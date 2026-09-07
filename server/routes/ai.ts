import { Router } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { DEFAULT_SOP_TEXT, SOP_CAMPAIGN_TYPES, type SopCampaignType } from "../lib/sop";

// Reads this campaign type's admin-editable SOP text (Manage > Campaign SOP), falling back to
// the built-in default when it hasn't been customized yet. This is what makes the campaign
// narrative/structure changeable month to month without a code deploy.
function getSopText(campaignType: string): string {
  const type: SopCampaignType = (SOP_CAMPAIGN_TYPES as readonly string[]).includes(campaignType)
    ? (campaignType as SopCampaignType)
    : "custom";
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`sop_${type}`) as { value: string } | undefined;
  return row?.value !== undefined ? row.value : DEFAULT_SOP_TEXT[type];
}

const router = Router();

// Lazy init Google GenAI client
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Turns raw provider errors (SDK exceptions, HTTP error bodies) into plain-language
// messages a non-technical user can act on, instead of exposing stack traces / raw JSON.
function mapProviderError(err: any): string {
  const msg = String(err?.message || err || "");
  if (/\b401\b|invalid.*api.?key|unauthorized|permission.?denied/i.test(msg)) {
    return "The AI provider's API key looks invalid or missing. Check the server's environment configuration.";
  }
  if (/\b429\b|rate.?limit|quota/i.test(msg)) {
    return "The AI service is rate-limited right now. Wait a moment and try again.";
  }
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|network|timeout|abort/i.test(msg)) {
    return "Couldn't reach the AI service — check your connection and try again.";
  }
  return msg || "An unexpected error occurred.";
}

// Claude model — overridable via env without a code change if Anthropic ships a newer model.
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// Shared creative-but-controlled temperature for both providers' batch generation call — low
// enough to reliably respect hard constraints (char limits, banned words, JSON shape), high
// enough to avoid flat/repetitive "every brand sounds the same" output.
const GENERATION_TEMPERATURE = 0.8;

// Estimates a safe max-output-token ceiling for the batch campaign JSON response, scaling with
// campaign size instead of one fixed number that silently truncates mid-JSON on any campaign
// bigger than a couple of brands/days (Claude was previously hardcoded to max_tokens 4096,
// which any realistic multi-brand campaign blows past, corrupting the JSON and forcing a
// silent fallback to template content).
function estimateMaxTokensForCampaign(
  brandCount: number,
  durationDays: number,
  postsPerDay: number,
  variantCount: number = 1
): number {
  const totalPosts = brandCount * durationDays * postsPerDay;
  const perPostTokens = 220 + (variantCount > 1 ? (variantCount - 1) * 60 : 0);
  const estimated = totalPosts * perPostTokens + 1500;
  return Math.min(Math.max(estimated, 4096), 32000);
}

// Trims SMS captions to the 160-char GSM segment limit at the last full word boundary rather
// than a hard mid-word cut, so a truncated message doesn't end mid-word/mid-sentence. This is a
// rare safety net — the prompt instructs the model to stay within budget; this only fires when
// the model (or the fallback template) still overshoots.
function trimSmsToLimit(caption: string, limit: number = 160): string {
  if (caption.length <= limit) return caption;
  const ellipsis = "...";
  const budget = limit - ellipsis.length;
  const hardCut = caption.slice(0, budget);
  const lastSpace = hardCut.lastIndexOf(" ");
  const trimmed = lastSpace > budget * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return trimmed.trimEnd() + ellipsis;
}

// House SMS formatting rules (hard business rules, not stylistic — see the sms-content-creator
// skill): every SMS must open with "RM0 BrandName: ", no parentheses anywhere in the body, and
// no em dashes/other non-GSM-7 punctuation (which silently drops the segment budget from 160 to
// 70). Applied as a safety net regardless of whether the model's own output already followed the
// prompt instruction — run BEFORE trimSmsToLimit so the prefix counts toward the 160 budget.
function applySmsHouseRules(caption: string, brandName: string): string {
  let text = (caption || "")
    .replace(/[()]/g, "")
    .replace(/[—–]/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  const expectedPrefix = `RM0 ${brandName}:`;
  if (!text.toUpperCase().startsWith(expectedPrefix.toUpperCase())) {
    text = `${expectedPrefix} ${text}`;
  }
  return text;
}

// Helper function for fallback campaign data generation when API key is unconfigured or hits error
function generateFallbackCampaignData(
  brands: any[],
  campaignType: string,
  campaignTitle: string,
  durationDays: number,
  postsPerDay: number,
  promoCode: string,
  discountDetails: string,
  targetPlatforms: string[],
  customDates: string[] = [],
  language: string = "English",
  customTimeSlots: string[] = [],
  variantCount: number = 1
) {
  const defaultSlots = ["08:00 AM", "11:00 AM", "02:00 PM", "05:00 PM", "08:00 PM", "10:00 PM"];
  const timeSlots = (customTimeSlots && customTimeSlots.length > 0) ? customTimeSlots : defaultSlots;

  // SOP Slot Progression Definitions
  const paydaySopTitles = [
    "Morning Salary Teaser",
    "Midday Flash Voucher Drop",
    "Afternoon Reward Pick",
    "Evening Urgency Countdown",
    "Late Night Expiry Alert",
    "Midnight Last Chance Call",
    "Bonus Flash Voucher",
    "Final Night Expiry"
  ];

  const firstWeekSopTitles = [
    "New Month Collection Drop",
    "Midday Category Curation",
    "Afternoon Craft & Value Feature",
    "Evening VIP Early Access",
    "Late Night First-Batch Stock Call",
    "Midnight Collection Preview",
    "Bonus VIP First-Look",
    "Early Bird Expiry"
  ];

  const reloanSopTitles = [
    "You're Eligible Again Reveal",
    "Fast-Track Approval Announcement",
    "Reloan Benefit Spotlight",
    "Reloan Incentive Countdown",
    "Last-Chance Reapply Call",
    "Bonus Reloan Reminder",
    "Priority Processing Alert",
    "Final Reloan Window Call"
  ];

  const genericSopTitles = [
    "Morning Campaign Kickoff",
    "Midday Highlight",
    "Afternoon Feature Spotlight",
    "Evening Special Offer",
    "Late Night Reminder",
    "Midnight Final Call"
  ];

  const sopTitles = campaignType === "payday" ? paydaySopTitles : campaignType === "first_week" ? firstWeekSopTitles : campaignType === "reloan" ? reloanSopTitles : genericSopTitles;

  // Per-Brand Vocabulary Archetypes for 100% Unique Wording across Brands
  const getBrandLexicon = (brand: any) => {
    const name = brand.name || "Brand";
    const id = (brand.id || "").toLowerCase();

    if (id.includes("pl") || id.includes("rpd") || id.includes("fr") || id.includes("wk")) {
      // Express / Ultra-Fast Cash
      return {
        paydayHooks: [
          `⚡ ${name}: Duit gaji dah masuk ke akaun?`,
          `🚀 ${name} Ultra-Fast: Luluskan kredit pantas serta-merta!`,
          `💸 ${name} Express: Pindahan tunai laksana kilat!`,
          `🚨 ${name} Flash Drop: Duit poket gaji extra sedia!`,
        ],
        paydayCaptions: [
          `${name.toUpperCase()}: Gaji dah keluar! Selesaikan keperluan tunai serta-merta tanpa lengah. Semak promo ${brand.brandVoucherCode || 'PAYDAY'} sekarang`,
          `${name.toUpperCase()}: Nikmati pemindahan paling pantas harini! Tebag ganjaran gaji dengan kod ${brand.brandVoucherCode || 'PAYDAY'} harini`,
          `${name.toUpperCase()}: Duit gaji extra serta-merta dalam 15 minit! Guna kod ${brand.brandVoucherCode || 'PAYDAY'} sebelum voucher habis`,
        ],
        firstWeekHooks: [
          `✨ ${name}: Koleksi baharu dilancarkan hari ini!`,
          `🔥 ${name}: Akses kewangan lantas untuk awal bulan!`,
          `🌟 ${name} First Drop: Sedia untuk permulaan bulan baharu.`,
        ],
        firstWeekCaptions: [
          `${name.toUpperCase()}: Mulakan bulan baharu dengan tawaran terhebat! Akses kemudahan kami sekarang`,
          `${name.toUpperCase()}: Terokai kelebihan awal bulan khas untuk pengguna tegar ${name}. Semak aplikasi hari ini`,
        ],
        reloanHooks: [
          `⚡ ${name}: Anda layak pinjaman baharu sekarang!`,
          `🔁 ${name} Reload: Kelulusan pantas untuk pelanggan setia!`,
        ],
        reloanCaptions: [
          `${name.toUpperCase()}: Anda dah selesai bayaran, jadi anda layak reload serta-merta! Guna kod ${brand.brandVoucherCode || 'RELOAN'} untuk kelulusan pantas`,
          `${name.toUpperCase()}: Rekod bayaran cemerlang anda buka laluan pantas untuk pinjaman baharu. Mohon sekarang dengan kod ${brand.brandVoucherCode || 'RELOAN'}`,
        ],
        cta: `Luluskan sekarang di ${name.toLowerCase().replace(/\s+/g, '')}.com`
      };
    } else if (id.includes("gby") || id.includes("fd") || id.includes("fxl")) {
      // Friendly & Flexible Micro-Credit
      return {
        paydayHooks: [
          `🎈 ${name}: Raikan gaji anda dengan pelan anjal!`,
          `🌸 ${name} Flexi: Nikmati kelonggaran tunai tanpa tekanan.`,
          `🎁 ${name}: Sokongan modal mesra untuk hari gaji anda.`,
        ],
        paydayCaptions: [
          `${name.toUpperCase()}: Sambut hari gaji dengan kebebasan kewangan! Tebur baucar baucar mesra ${brand.brandVoucherCode || 'PAYDAY'} sekarang`,
          `${name.toUpperCase()}: Bayaran balik anjal & mesra poket! Guna kod ${brand.brandVoucherCode || 'PAYDAY'} untuk nikmati tawaran istimewa`,
        ],
        firstWeekHooks: [
          `🌱 ${name}: Bulan baharu, peluang kewangan mesra baharu!`,
          `☀️ ${name}: Terokai fleksibiliti aliran tunai awal bulan.`,
        ],
        firstWeekCaptions: [
          `${name.toUpperCase()}: Perancangan awal bulan lebih tenang dengan fleksibiliti ${name}. Lawati aplikasi hari ini`,
        ],
        reloanHooks: [
          `🎈 ${name}: Anda dah layak reload semula, senang je!`,
        ],
        reloanCaptions: [
          `${name.toUpperCase()}: Terima kasih kerana bayar tepat waktu! Anda kini layak reload dengan syarat lebih mesra. Guna kod ${brand.brandVoucherCode || 'RELOAN'} sekarang`,
        ],
        cta: `Pilih pelan anjal di ${name.toLowerCase().replace(/\s+/g, '')}.com`
      };
    } else if (id.includes("dnh")) {
      // Hero & Rescue Credit
      return {
        paydayHooks: [
          `🦸‍♂️ ${name}: Wira kewangan sedia membantu bil gaji anda!`,
          `🛡️ ${name} Rescue: Benteng tunai peribadi peria anda.`,
        ],
        paydayCaptions: [
          `${name.toUpperCase()}: Perlindungan kecemasan & kelulusan wira! Gunakan kod istimewa ${brand.brandVoucherCode || 'HERO'} sekarang`,
        ],
        firstWeekHooks: [
          `🛡️ ${name}: Perlindungan kredit wira melangkah ke bulan baharu.`,
        ],
        firstWeekCaptions: [
          `${name.toUpperCase()}: Benteng kewangan keluarga anda sedia untuk bulan baharu bersama ${name}.`,
        ],
        reloanHooks: [
          `🦸‍♂️ ${name}: Wira kewangan sedia bantu anda sekali lagi!`,
        ],
        reloanCaptions: [
          `${name.toUpperCase()}: Rekod bayaran anda buktikan anda pelanggan dipercayai. Reload sekarang dengan kod istimewa ${brand.brandVoucherCode || 'RELOAN'}`,
        ],
        cta: `Dapatkan bantuan wira di ${name.toLowerCase().replace(/\s+/g, '')}.com`
      };
    } else if (id.includes("dg")) {
      // Youth & Lifestyle
      return {
        paydayHooks: [
          `🔥 ${name}: Gaji korang dah selamat! Masa shopping spree!`,
          `🛍️ ${name} Vibe: Hack gaji terpadu korang dah ready!`,
        ],
        paydayCaptions: [
          `${name.toUpperCase()}: Gaji dah masuk, jom claim voucher korang! Guna code ${brand.brandVoucherCode || 'PAYDAY'} sekarang`,
        ],
        firstWeekHooks: [
          `✨ ${name}: Trend awal bulan dah drop! Check it out!`,
        ],
        firstWeekCaptions: [
          `${name.toUpperCase()}: Vibe awal bulan korang lebih ngam bersama promo terhangat ${name}!`,
        ],
        reloanHooks: [
          `🔥 ${name}: Korang dah layak reload lagi, jom!`,
        ],
        reloanCaptions: [
          `${name.toUpperCase()}: Sejarah bayaran korang power, so korang layak reload cepat! Guna code ${brand.brandVoucherCode || 'RELOAN'} sekarang`,
        ],
        cta: `Claim sekarang kat ${name.toLowerCase().replace(/\s+/g, '')}.com`
      };
    } else {
      // Smart FinTech / General
      return {
        paydayHooks: [
          `🧠 ${name}: Tingkatkan aliran tunai gaji anda pintar!`,
          `💎 ${name} Prime: Barisan kredit digital sedia digunakan.`,
        ],
        paydayCaptions: [
          `${name.toUpperCase()}: Pengurusan tunai gaji pintar & telus. Tebag ganjaran kod ${brand.brandVoucherCode || 'PAYDAY'} hari ini`,
        ],
        firstWeekHooks: [
          `📊 ${name}: Perancangan pintar awal bulan bermula di sini.`,
        ],
        firstWeekCaptions: [
          `${name.toUpperCase()}: Nikmati kemudahan kredit digital generasi baharu bersama ${name} bulan ini.`,
        ],
        reloanHooks: [
          `🧠 ${name}: Data kredit anda tunjuk anda sedia untuk reload.`,
        ],
        reloanCaptions: [
          `${name.toUpperCase()}: Profil kredit pintar anda layak untuk reload segera. Mohon dengan kod ${brand.brandVoucherCode || 'RELOAN'} hari ini`,
        ],
        cta: `Terokai kemudahan di ${name.toLowerCase().replace(/\s+/g, '')}.com`
      };
    }
  };

  return brands.map((brand) => {
    const posts: any[] = [];
    let postCount = 0;

    const lexicon = getBrandLexicon(brand);
    const isNoCode = !promoCode || promoCode === "NO PROMO CODE" || promoCode === "ORGANIC" || promoCode.trim() === "";
    const brandCode = isNoCode
      ? "NO PROMO CODE"
      : (brand.brandVoucherCode ||
        (brand.shortCode && promoCode.toUpperCase().includes(brand.shortCode.toUpperCase())
          ? promoCode
          : `${promoCode || 'PROMO'}${brand.shortCode || brand.id.replace('brand-', '').toUpperCase()}`));

    for (let day = 1; day <= durationDays; day++) {
      const scheduledDate = customDates[day - 1] || "";

      for (let slot = 1; slot <= postsPerDay; slot++) {
        postCount++;
        const timeSlot = timeSlots[(slot - 1) % timeSlots.length];
        const titleType = sopTitles[(slot - 1) % sopTitles.length];
        const platform = targetPlatforms[(postCount - 1) % targetPlatforms.length] || "SMS";
        const code = brandCode;

        let hook = "";
        let caption = "";
        let cta = lexicon.cta;

        const hooksList = campaignType === "first_week" ? lexicon.firstWeekHooks : campaignType === "reloan" ? lexicon.reloanHooks : lexicon.paydayHooks;
        const captionsList = campaignType === "first_week" ? lexicon.firstWeekCaptions : campaignType === "reloan" ? lexicon.reloanCaptions : lexicon.paydayCaptions;

        hook = hooksList[(slot - 1) % hooksList.length];
        caption = captionsList[(slot - 1) % captionsList.length];

        // Fallback A/B variants: cycle through the brand's other lexicon hooks/captions so each
        // variant is at least genuinely different copy, not a duplicate of the primary one.
        let hookVariants: string[] | undefined;

        if (platform === "SMS") {
          // SMS has no separate hook/CTA shown to the user — fold everything into ONE
          // self-contained message (opening line + offer/code + short CTA), capped at 160 chars,
          // with the house rules (RM0 Brand: prefix, no parentheses/em dashes) applied first so
          // the prefix counts toward that 160-char budget rather than pushing it over.
          caption = trimSmsToLimit(applySmsHouseRules(`${caption} ${lexicon.cta}`.replace(/\s+/g, " ").trim(), brand.name || "Brand"));
          hook = caption;
          cta = "";

          if (variantCount > 1 && captionsList.length > 1) {
            hookVariants = [caption];
            for (let v = 1; v < variantCount; v++) {
              const altCaption = captionsList[(slot - 1 + v) % captionsList.length];
              hookVariants.push(trimSmsToLimit(applySmsHouseRules(`${altCaption} ${lexicon.cta}`.replace(/\s+/g, " ").trim(), brand.name || "Brand")));
            }
          }
        } else {
          // Web Push rich emoji formatting — title/hook/caption/cta stay separate.
          hook = `🔔 ${hook}`;
          if (variantCount > 1 && hooksList.length > 1) {
            hookVariants = [hook];
            for (let v = 1; v < variantCount; v++) {
              const alt = hooksList[(slot - 1 + v) % hooksList.length];
              hookVariants.push(`🔔 ${alt}`);
            }
          }
        }

        posts.push({
          id: `post-${brand.id || 'brand'}-${day}-${slot}-${Date.now()}`,
          dayNumber: day,
          scheduledDate,
          timeSlot,
          slotIndex: slot,
          platform,
          format: platform === "SMS" ? "SMS Message" : "Push Notification",
          title: `${brand.name} ${scheduledDate ? `(${scheduledDate})` : `Day ${day}`} - ${titleType}`,
          hook,
          hookVariants,
          caption,
          promoCodeUsed: code,
          visualPrompt: "",
          hashtags: [],
          cta
        });
      }
    }

    return {
      brandId: brand.id,
      brandName: brand.name,
      posts
    };
  });
}

// Anthropic Claude API Integration Helper — retries transient failures (network error,
// 429, 5xx) up to 2 extra times with backoff; never retries 4xx auth/validation errors,
// since those won't succeed on retry and would just waste the user's wait before fallback.
async function callClaudeAPI(systemInstruction: string, promptText: string, maxTokens: number, temperature: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is missing. Please add ANTHROPIC_API_KEY to your environment variables.");
  }

  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 45000;
  let lastErr: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature,
          system: systemInstruction,
          messages: [
            {
              role: "user",
              // Shape-agnostic on purpose (array vs. object) — the caller's own promptText already
              // states the exact JSON shape it wants; this only reinforces "no prose, no fences".
              content: `${promptText}\n\nIMPORTANT: Return ONLY valid JSON matching the exact format requested above, without extra commentary or markdown codeblocks.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        const err = new Error(`Claude API Error (${response.status}): ${errBody}`);
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        throw err;
      }

      const json: any = await response.json();
      const text = json.content?.[0]?.text || "[]";
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (err: any) {
      const isTimeoutOrNetwork = err.name === "AbortError" || err.code === "ECONNRESET" || err.code === "ENOTFOUND" || err.cause;
      if (isTimeoutOrNetwork && attempt < MAX_ATTEMPTS) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Batch Campaign Content Generator API
router.post("/generate", requireAuth, async (req, res) => {
  const {
    brands, // Array of Brand objects
    campaignType = "payday", // 'payday' | 'first_week' | 'custom'
    campaignTitle,
    durationDays = 3,
    postsPerDay = 6,
    promoCode = "PAYDAY30OFF",
    discountDetails = "30% OFF Storewide",
    brandVoucherCodes = {},
    brandDiscountDetails = {},
    targetPlatforms = ["SMS", "Web Push"],
    customNotes = "",
    monthYear = "Current Month",
    aiProvider = "gemini", // 'gemini' | 'claude'
    customDates = [],
    language = "English",
    timeSlots = [],
    customGuidelines = "",
    hookVariantCount = 1,
  } = req.body;

  if (!brands || !Array.isArray(brands) || brands.length === 0) {
    return res.status(400).json({ error: "At least one brand must be selected." });
  }

  const variantCount = Math.min(Math.max(parseInt(hookVariantCount, 10) || 1, 1), 3);

  const campaignTypeInfo =
    campaignType === "payday"
      ? "Payday Sale (High urgency, payday salary reward theme, flash voucher countdowns, steep discounts, aggressive CTA)"
      : campaignType === "first_week"
      ? "First Week Collection (New monthly arrivals, fresh season drops, lifestyle aesthetic, early bird privileges, trend showcase)"
      : campaignType === "reloan"
      ? "Reloan Aggressive Win-Back (Repeat customers who already repaid a loan, fast-track reapproval, high-urgency but encouraging tone, never threatening)"
      : campaignTitle || "Custom Monthly Promotional Campaign";

  // Format custom dates string if present
  const datesSummaryStr =
    customDates && customDates.length > 0
      ? `SPECIFIC BLAST DATES INVOLVED (${customDates.length} Days): ${customDates.join(", ")}`
      : `CONSECUTIVE DAYS: Day 1 through Day ${durationDays}`;

  const timeSlotsSummaryStr =
    timeSlots && timeSlots.length > 0
      ? `CUSTOM DAILY TIME SLOTS TO USE IN ORDER: ${timeSlots.join(", ")}`
      : `STANDARD DAILY TIME SLOTS: 08:00 AM, 11:00 AM, 02:00 PM, 05:00 PM, 08:00 PM, 10:00 PM`;

  // Admin-editable via Manage > Campaign SOP (falls back to the built-in default) — only the
  // block matching THIS campaign's actual type is injected, instead of always feeding the model
  // every campaign type's SOP regardless of which one is actually running.
  const activeSopText = getSopText(campaignType);
  const sopSection = activeSopText
    ? `CRITICAL CAMPAIGN SOP & MANDATORY CONTENT INGREDIENTS:\n${activeSopText}\n`
    : "";

  const fewShotExamples = `
EXAMPLE OUTPUT QUALITY & FORMAT ANCHORS (for calibration only — do NOT reuse these exact words, brand names, codes, or phrasing in your actual output; generate entirely original copy for the real brands and campaign below):

Example SMS post (English, payday theme) — ONE self-contained message, no separate hook/CTA:
  caption: "Payday's here! SwiftCash gives you 30% off fees today. Use code PAY30 now: swiftcash.com/pay30"
  (hook and cta fields must repeat this exact text — SMS has no separate hook/title/CTA)

Example Web Push post (English, first-week theme):
  hook: "🌟 New Month, New Drop — VIP access starts now!"
  caption: "🔥 LumeStyle just dropped this month's fresh collection. VIP members get first pick before it sells out. 🛍️"
  cta: "👉 Shop the drop first"

Use these only to calibrate tone, punchiness, and structural conventions (length, emoji density for Web Push, directness for SMS) — every actual generated post must be original and specific to the real brand, campaign, and language requested below.`;

  const systemInstruction = `You are an elite Performance Copywriter specializing in high-converting SMS and Web Push notification marketing campaigns for e-commerce brands.
Your task is to generate high-impact, actionable SMS and Web Push messaging schedules across multiple brands running promotional campaigns.

${customGuidelines ? `USER-DEFINED MANDATORY CAMPAIGN GUIDELINES & CONTENT SOP:\n"${customGuidelines}"\n(You MUST strictly obey all user-defined rules above for tone, hooks, ingredients, and messaging structure!)\n` : ""}
CRITICAL LANGUAGE REQUIREMENT:
- All generated content (hooks, titles, message captions, CTAs) MUST be written in ${language.toUpperCase()} (${language}).
- If any SOP guidance below gives an example phrase in a specific language, treat it only as an illustration of tone/intent — always write the actual output in ${language}, never mixing languages within a single post.

${sopSection}
CRITICAL MULTI-BRAND WORDING UNIQUENESS MANDATE (ANTI-DUPLICATE TEMPLATE RULE):
- End-customers who receive messages from multiple brands MUST NEVER suspect that the copy was generated by the same template engine or AI prompt.
- EVERY SINGLE BRAND MUST USE COMPLETELY DISTINCT VOCABULARY, TONE OF VOICE, SLANGS, ACTION VERBS, AND SENTENCE STRUCTURES according to its unique brand profile:
  * Express / Ultra-Fast Cash Brands: Use direct, high-energy, speed-driven language ("Kelulusan pantas", "15 minit laksana kilat", "Selesaikan serta-merta").
  * Flexible Micro-Financing Brands: Use warm, empowering, flexible phrasing ("Kebebasan kewangan", "Anjal tanpa tekanan", "Sokongan modal mesra").
  * Smart FinTech Brands: Use sleek, smart, modern digital phrasing ("Barisan kredit digital pintar", "Pengurusan tunai masa depan").
  * Hero / Rescue Brands: Use reassuring, heroic, rescue-focused phrasing ("Wira penyelamat masa sukar", "Benteng kewangan keluarga").
  * Youth / Lifestyle Brands: Use casual, trendy, Gen-Z / Millennial hype slang ("Gaji korang dah selamat!", "Hack terpadu", "Vibe ngam").
  * Growth / Merchant Brands: Use strategic, empowering, business capital phrasing ("Suntik modal perniagaan", "Kembangkan stok jualan").
- STRICTLY FORBIDDEN: Do NOT reuse identical slogans, catchphrases, or opening hooks across different brands in the same campaign run!

CRITICAL REQUIREMENT - VOUCHER CODES / ORGANIC CAMPAIGN HANDLING:
- If a promo code prefix is provided (e.g. PAYDAY30OFF), each brand MUST receive its own DISTINCT, UNIQUE promo voucher code (e.g. PAYDAY30OFF-PL, PAYDAY30OFF-GBY).
- If the campaign is set to ORGANIC / NO PROMO CODE (promo code is empty or "NO PROMO CODE"), DO NOT mention any promo codes or voucher codes in the message text. Set "promoCodeUsed" to "" or "NO PROMO CODE". Focus strictly on brand value, new arrival drops, product quality, and direct action CTAs.

CRITICAL PLATFORM & FORMAT SPECIFICATIONS:
- **SMS Messages**: STRICT MANDATE — an SMS post has NO separate title, hook, or CTA. The "caption" field IS the entire message the customer receives: it MUST START WITH "RM0 [BrandName]: " (the brand's exact name as given below, this exact prefix format, always), then the attention-grabbing line, the offer, the embedded unique brand promo code, and a short call to action — ALL WITHIN 160 CHARACTERS TOTAL INCLUDING THE PREFIX (1 GSM segment). Count characters carefully before finalizing — anything over the limit is automatically cut off. Set "hook" and "cta" to the exact same text as "caption" for SMS posts (they are never shown separately). NO PARENTHESES anywhere in SMS text — rephrase instead (e.g. "kod X, RM8 off" not "kod X (RM8 off)"). NO em dashes or other non-GSM-7 punctuation (use "," or "." instead of "—") — a single non-GSM-7 character silently drops the per-segment budget from 160 to 70. Extremely punchy and urgent! NO HASHTAGS (#) in SMS copy!
- **Web Push Notifications**: STRICT MANDATE — Web Push keeps title, hook, caption, and cta as separate fields. Titles, hooks, and message captions MUST feature RICH VIBRANT EMOJIS (e.g. 🔔, ⚡, 💸, 🚨, 🛍️, 🔥, 🎁, 🚀, ⏳, 💥, 📦, 👉) spread through the middle and end of the message, not just the start, for high engagement! NO HASHTAGS (#) in Web Push copy!
- **HASHTAGS RULE**: DO NOT include any hashtags (#something) in SMS or Web Push text captions. Leave hashtags array as empty array [].
- **NEVER USE "amaran" (WARNING) OR THREATENING PHRASING for KYC, reloan, or before-due-date content types** — these read as encouraging/informational, not as a threat, regardless of how urgent the campaign is meant to feel. (This restriction does not apply to overdue/collections content sent after a due date has already passed.)

CONTENT STRUCTURE:
1. For EACH brand provided, generate exactly ${durationDays} days of campaign messaging.
2. ${datesSummaryStr}
3. For EACH day, generate exactly ${postsPerDay} distinct message slots matching key daily conversion times, evenly distributing the SOP narrative arc above across all ${postsPerDay} slots regardless of the exact count — no slot beyond a "5th" should read as generic filler; every slot must carry a distinct narrative beat and purpose. ${timeSlotsSummaryStr}
4. Alternate or assign platform strictly as "SMS" or "Web Push" (from chosen: ${targetPlatforms.join(", ")}).
5. Ensure every item includes:
   - Specific time slot and slot index (1 to ${postsPerDay}).
   - For Web Push: a Hook / Headline designed to get instant clicks, a separate Message Caption body (Rich Emojis), and a separate CTA.
   - For SMS: ONE self-contained Message Caption (<= 160 chars total) that already includes the attention-grabbing opening, the embedded unique brand promo code, and the call to action — no separate hook or CTA.
6. If a brand below lists FORBIDDEN WORDS/PHRASES or its own VOICE/SOP GUIDELINES, you MUST strictly obey them — check every generated hook, caption, title, and CTA for that brand against its rules before finalizing.
${fewShotExamples}

Maintain each brand's unique voice. Make copy punchy, urgent, and high-converting.`;

  const promptText = `Generate content campaign plan:
- Campaign: ${campaignTitle || campaignTypeInfo}
- Campaign Type: ${campaignType}
- Selected Output Language: ${language}
- Target Month/Year: ${monthYear}
- Schedule Plan: ${datesSummaryStr}
- Duration: ${durationDays} Days
- Posts Per Day: ${postsPerDay} posts (Total ${durationDays * postsPerDay} posts per brand)
- Base Promo Code / Prefix: "${promoCode || 'PAYDAY30OFF'}"
- Discount/Offer Details: "${discountDetails || 'Exclusive Monthly Savings'}"
- Platforms: ${targetPlatforms.join(", ")}
- Special Instructions / Focus Products: "${customNotes}"

BRANDS INVOLVED & THEIR ASSIGNED UNIQUE BRAND VOUCHER CODES & DISCOUNT OFFERS (${brands.length} Brands):
${brands
  .map(
    (b: any, index: number) => {
      const uniqueCode = brandVoucherCodes[b.id] || b.brandVoucherCode || `${promoCode || 'PROMO'}${b.shortCode || b.id.replace('brand-', '').toUpperCase()}`;
      const uniqueDiscount = brandDiscountDetails[b.id] || b.brandDiscountDetails || discountDetails || 'Exclusive Brand Savings';
      const bannedWordsList: string[] = Array.isArray(b.bannedWords)
        ? b.bannedWords.filter((w: any) => typeof w === "string" && w.trim())
        : [];
      const bannedWordsLine = bannedWordsList.length > 0
        ? `\n- FORBIDDEN WORDS/PHRASES FOR THIS BRAND — DO NOT use any of the following in this brand's copy: ${bannedWordsList.map((w) => `"${w}"`).join(", ")}`
        : "";
      const brandGuidelinesLine = (typeof b.contentGuidelines === "string" && b.contentGuidelines.trim())
        ? `\n- THIS BRAND'S OWN VOICE/SOP GUIDELINES: ${b.contentGuidelines.trim().slice(0, 500)}`
        : "";
      return `
Brand #${index + 1}: ${b.name} (Shortcode: ${b.shortCode || 'N/A'})
- ASSIGNED UNIQUE VOUCHER CODE FOR THIS BRAND: "${uniqueCode}"
- ASSIGNED UNIQUE DISCOUNT OFFER FOR THIS BRAND: "${uniqueDiscount}"
- Industry: ${b.industry || 'E-Commerce'}
- Tone of Voice: ${b.tone || 'Engaging & Professional'}
- Target Audience: ${b.targetAudience || 'General Consumers'}
- Key Products/Offerings: ${b.keyProducts || 'Featured Catalog'}${bannedWordsLine}${brandGuidelinesLine}
`;
    }
  )
  .join("\n")}

Return a JSON array where each object represents a Brand Content Plan.
Each Brand Content Plan must contain:
- brandId: string
- brandName: string
- posts: array of post objects containing:
  - id: string (unique)
  - dayNumber: number (1 to ${durationDays})
  - timeSlot: string (e.g., "08:00 AM")
  - slotIndex: number (1 to ${postsPerDay})
  - platform: string
  - format: string
  - title: string
  - hook: string (Web Push: the primary/active hook, must equal hookVariants[0] when present. SMS: must equal caption exactly — SMS has no separate hook.)
${variantCount > 1 ? `  - hookVariants: string[] (EXACTLY ${variantCount} distinct options for this slot, each a genuinely different angle or style for A/B testing — not minor rewordings. Web Push: alternate headlines. SMS: alternate full self-contained messages, each <= 160 chars.)\n` : ""}  - caption: string (Web Push: the message body. SMS: the ENTIRE self-contained message — opening line, offer, promo code, and CTA all included, <= 160 chars.)
  - promoCodeUsed: string (MUST match this brand's assigned unique voucher code!)
  - visualPrompt: string
  - hashtags: string[]
  - cta: string (Web Push: a short call to action. SMS: must equal caption exactly — SMS has no separate CTA.)
`;

  // Helper to post-process & sanitize AI generated JSON
  const sanitizeGeneratedData = (dataArray: any[]) => {
    if (!Array.isArray(dataArray)) return dataArray;
    return dataArray.map((brandPlan) => {
      if (!brandPlan.posts || !Array.isArray(brandPlan.posts)) return brandPlan;

      const cleanedPosts = brandPlan.posts.map((post: any) => {
        const isSms = post.platform && post.platform.toLowerCase().includes("sms");
        let caption = post.caption || "";

        // Remove any #hashtags from SMS or Web Push caption
        caption = caption.replace(/#[a-zA-Z0-9_]+/g, "").trim();

        // House SMS rules (RM0 Brand: prefix, no parentheses/em dashes) then the 160-char trim —
        // in that order, so the prefix counts toward the budget rather than pushing it over.
        if (isSms) {
          caption = applySmsHouseRules(caption, brandPlan.brandName || post.brandName || "Brand");
          caption = trimSmsToLimit(caption);
        }

        // Assign scheduledDate from customDates array if available
        const scheduledDate = (customDates && customDates[post.dayNumber - 1]) || "";

        // Normalize hookVariants: always an array, hook always set from it when present.
        let hookVariants: string[] | undefined = Array.isArray(post.hookVariants)
          ? post.hookVariants.filter((h: any) => typeof h === "string" && h.trim())
          : undefined;
        let hook = post.hook || (hookVariants && hookVariants[0]) || "";
        let cta = post.cta || "";

        if (isSms) {
          // SMS has no separate hook/CTA shown to the user — the caption alone is the entire message.
          hook = caption;
          cta = "";
          if (hookVariants) {
            hookVariants = hookVariants.map((h) =>
              trimSmsToLimit(applySmsHouseRules(h.replace(/#[a-zA-Z0-9_]+/g, "").trim(), brandPlan.brandName || post.brandName || "Brand"))
            );
          }
        }
        if (hookVariants && hookVariants.length <= 1) hookVariants = undefined;

        return {
          ...post,
          hook,
          hookVariants,
          caption,
          cta,
          scheduledDate,
          visualPrompt: "", // Visual prompts not needed
          hashtags: [], // No hashtags needed for SMS and Web Push
        };
      });

      return {
        ...brandPlan,
        posts: cleanedPosts,
      };
    });
  };

  const maxOutputTokens = estimateMaxTokensForCampaign(brands.length, durationDays, postsPerDay, variantCount);

  try {
    if (aiProvider === "claude") {
      console.log(`Generating campaign using Anthropic Claude (${CLAUDE_MODEL})...`);
      const rawData = await callClaudeAPI(systemInstruction, promptText, maxOutputTokens, GENERATION_TEMPERATURE);
      const generatedData = sanitizeGeneratedData(rawData);
      return res.json({
        success: true,
        aiProvider: "claude",
        campaignType,
        durationDays,
        postsPerDay,
        promoCode,
        discountDetails,
        language,
        data: generatedData,
      });
    }

    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptText,
      config: {
        // Only the batch-generation call gets automatic retry/timeout — this is the
        // expensive, all-eggs-in-one-basket call where a transient blip should be retried
        // before giving up to fallback content. The other endpoints intentionally keep
        // fail-fast behavior (see mapProviderError callers below).
        httpOptions: {
          timeout: 45000,
          retryOptions: {
            attempts: 3, // original attempt + 2 retries
            initialDelay: 1,
            maxDelay: 8,
            httpStatusCodes: [408, 429, 500, 502, 503, 504],
          },
        },
        systemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens,
        temperature: GENERATION_TEMPERATURE,
        responseSchema: {
          type: Type.ARRAY,
          description: "List of content plans per brand",
          items: {
            type: Type.OBJECT,
            properties: {
              brandId: { type: Type.STRING },
              brandName: { type: Type.STRING },
              posts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    dayNumber: { type: Type.INTEGER },
                    timeSlot: { type: Type.STRING },
                    slotIndex: { type: Type.INTEGER },
                    platform: { type: Type.STRING },
                    format: { type: Type.STRING },
                    title: { type: Type.STRING },
                    hook: { type: Type.STRING },
                    hookVariants: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    caption: { type: Type.STRING },
                    promoCodeUsed: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    hashtags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    cta: { type: Type.STRING },
                  },
                  required: [
                    "dayNumber",
                    "timeSlot",
                    "slotIndex",
                    "platform",
                    "format",
                    "title",
                    "hook",
                    "caption",
                    "cta",
                  ],
                },
              },
            },
            required: ["brandName", "posts"],
          },
        },
      },
    });

    const jsonText = response.text || "[]";
    const rawData = JSON.parse(jsonText);
    const generatedData = sanitizeGeneratedData(rawData);

    return res.json({
      success: true,
      aiProvider: "gemini",
      campaignType,
      durationDays,
      postsPerDay,
      promoCode,
      discountDetails,
      language,
      data: generatedData,
    });
  } catch (err: any) {
    console.warn("AI Generation call failed or unconfigured, serving fallback campaign data:", err.message);
    const fallbackData = generateFallbackCampaignData(
      brands,
      campaignType,
      campaignTitle,
      durationDays,
      postsPerDay,
      promoCode,
      discountDetails,
      targetPlatforms,
      customDates,
      language,
      timeSlots,
      variantCount
    );

    return res.json({
      success: true,
      isFallback: true,
      fallbackReason: mapProviderError(err),
      aiProvider,
      campaignType,
      durationDays,
      postsPerDay,
      promoCode,
      discountDetails,
      language,
      data: fallbackData,
    });
  }
});

// AI Promo Code Generator Endpoint
router.post("/generate-promocodes", requireAuth, async (req, res) => {
  try {
    const { campaignType, campaignTitle, monthYear, brandShortCodes = [], discountDetails = "", avoidCodes = [] } = req.body;

    const avoidLine = Array.isArray(avoidCodes) && avoidCodes.length > 0
      ? `\n- MUST NOT match, nor be a trivial variant of, any of these already-in-use codes: ${avoidCodes.join(", ")}`
      : "";

    const systemInstruction = "You are a high-conversion e-commerce promo code and growth marketing specialist.";

    const promptText = `You are a high-conversion e-commerce promo code and growth marketing specialist.
Generate 6 creative, catchy, easy-to-remember promo voucher codes for an upcoming marketing campaign.

Campaign Details:
- Type: ${campaignType} (e.g. Payday, First Week Collection, Festive/Custom)
- Campaign Title: "${campaignTitle || 'Monthly Special'}"
- Month/Year: "${monthYear || '2026'}"
- Discount/Offer: "${discountDetails || 'Special Discount'}"
- Brand Short Codes involved: ${brandShortCodes.join(", ") || "PL, GBY, FR, SD, FIN, FD, KDM, RYW, RPD, DG, EVO, FDR, NVK, WK, FXL, DNH"}

Requirements for each code:
1. UPPERCASE alphanumeric only, short & punchy (e.g., PLPAYDAY50, GAJI88, DNHHERO30, AUGFLEXI50, PAYDAY2026).
2. Easy to type on mobile keyboards.
3. Includes a catchy tag line explaining why this code converts well.${avoidLine}

Return a JSON object containing an array "suggestions", where each object has:
- "code": string (the exact promo code string)
- "tagline": string (short description, e.g., "Best for Payday express discount")
- "recommendedDiscount": string (e.g., "RM50 Fee Waiver / 30% Cashback")`;

    let data: any;
    try {
      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: promptText,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    tagline: { type: Type.STRING },
                    recommendedDiscount: { type: Type.STRING },
                  },
                  required: ["code", "tagline", "recommendedDiscount"],
                },
              },
            },
            required: ["suggestions"],
          },
        },
      });
      data = JSON.parse(response.text || "{}");
    } catch (geminiErr: any) {
      if (!process.env.ANTHROPIC_API_KEY) throw geminiErr;
      console.warn("generate-promocodes: Gemini failed, falling back to Claude —", geminiErr.message);
      data = await callClaudeAPI(systemInstruction, promptText, 800, 0.9);
    }

    const avoidSet = new Set((Array.isArray(avoidCodes) ? avoidCodes : []).map((c: string) => c.toUpperCase()));
    // Safety net: strip any symbol/underscore the model slips in, and drop any suggestion that
    // still collides with an in-use code despite the prompt instruction above.
    const suggestions = (data.suggestions || [])
      .map((s: any) => ({
        ...s,
        code: (s.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      }))
      .filter((s: any) => s.code && !avoidSet.has(s.code));
    res.json({ success: true, suggestions });
  } catch (err: any) {
    console.error("Error generating promo codes:", err);
    res.status(500).json({ error: mapProviderError(err) });
  }
});

// Single Post AI Refinement Endpoint
router.post("/refine-post", requireAuth, async (req, res) => {
  try {
    const { post, brandName, instruction } = req.body;
    if (!post || !instruction) {
      return res.status(400).json({ error: "Post data and instruction are required." });
    }

    const ai = getGenAIClient();
    const isSms = (post.platform || "").toLowerCase().includes("sms");

    const promptText = `You are an expert social media copy editor.
Brand Name: ${brandName || "E-Commerce Brand"}
Platform: ${post.platform || "SMS"}
${
  isSms
    ? `Current SMS Content (the entire message — SMS has no separate title/hook/CTA): "${post.caption}"`
    : `Current Post Title: "${post.title}"
Current Hook: "${post.hook}"
Current Caption: "${post.caption}"
Current CTA: "${post.cta}"
Current Visual Prompt: "${post.visualPrompt}"`
}

Instruction from user: "${instruction}"

Modify and improve this post according to the instruction.
${
  isSms
    ? `This is an SMS message — return the ENTIRE updated message in "caption" only, self-contained (opening line, offer, promo code, and CTA all included). It MUST start with "RM0 ${brandName || "Brand"}: ", contain NO parentheses and NO em dashes, and be 160 characters or fewer INCLUDING that prefix. Set "hook" and "cta" to the same text as "caption".`
    : `Return updated JSON with keys: title, hook, caption, cta, visualPrompt, hashtags (array of strings).`
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            caption: { type: Type.STRING },
            cta: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["title", "hook", "caption", "cta", "visualPrompt"],
        },
      },
    });

    const updated = JSON.parse(response.text || "{}");
    if (isSms) {
      const cleaned = applySmsHouseRules((updated.caption || "").replace(/#[a-zA-Z0-9_]+/g, "").trim(), brandName || "Brand");
      updated.caption = trimSmsToLimit(cleaned);
      updated.hook = updated.caption;
      updated.cta = "";
      updated.hashtags = [];
    }
    res.json({ success: true, updatedPost: { ...post, ...updated } });
  } catch (err: any) {
    console.error("Error refining post:", err);
    res.status(500).json({ error: mapProviderError(err) });
  }
});

// Opt-in AI Language QA Pass — reviews existing generated copy for translation/grammar issues.
// Only runs when the user explicitly clicks the button (not automatic) to keep API cost predictable.
const QA_CHECK_MAX_POSTS = 80;

router.post("/qa-check", requireAuth, async (req, res) => {
  try {
    const { posts, language } = req.body;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "posts array is required." });
    }

    const truncated = posts.length > QA_CHECK_MAX_POSTS;
    const postsToCheck = posts.slice(0, QA_CHECK_MAX_POSTS);

    const ai = getGenAIClient();

    const promptText = `You are a meticulous bilingual copy editor and localization QA reviewer.
Review the following list of marketing messages, all of which are supposed to be written in ${language || "the specified language"}.
For each message, check for: leftover English filler words that shouldn't be there, awkward or unnatural phrasing, grammar mistakes, or garbled/mixed-up translation.
Only flag messages that have a REAL quality issue — do not flag a message just because it uses common loanwords, brand names, or promo codes.

Messages to review (format: id | hook | caption):
${postsToCheck.map((p: any) => `${p.id} | ${p.hook} | ${p.caption}`).join("\n")}

Return a JSON object with key "issues": an array of objects, each with:
- "id": the exact message id from the list above
- "issue": a short one-sentence description of the specific problem found`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  issue: { type: Type.STRING },
                },
                required: ["id", "issue"],
              },
            },
          },
          required: ["issues"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json({ success: true, issues: data.issues || [], checkedCount: postsToCheck.length, truncated });
  } catch (err: any) {
    console.error("Error running language QA check:", err);
    res.status(500).json({ error: mapProviderError(err) });
  }
});

export default router;

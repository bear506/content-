export interface Brand {
  id: string;
  name: string;
  shortCode: string; // e.g. "PL", "GBY", "FR", "SD", "FIN", "FD", "KDM", "RYW", "RPD", "DG", "EVO", "FDR", "NVK", "WK", "FXL", "DNH"
  categoryGroup: "WDF" | "WLM" | "WAW" | string; // Category group code
  industry: string;
  tone: string;
  targetAudience: string;
  keyProducts: string;
  defaultHashtags: string;
  defaultPromoCode: string;
  brandColor: string;
  logoEmoji: string;
  contentGuidelines?: string; // Persisted per-brand SOP/tone guidelines, auto-prefilled into campaign generation
  bannedWords?: string[]; // Words/phrases to avoid in generated copy for this brand
}

export type CampaignType = "payday" | "first_week" | "reloan" | "custom";

export interface CampaignConfig {
  id: string;
  title: string;
  campaignType: CampaignType;
  monthYear: string;
  startDate: string; // e.g., "2026-08-25"
  calendarDates?: string[]; // Array of selected YYYY-MM-DD or date strings e.g. ["2026-08-21", "2026-08-25", "2026-08-29"]
  scheduleMode?: "consecutive" | "custom_dates";
  customDates?: string[];
  language?: string; // e.g. "English", "Bahasa Melayu", "Chinese", "Manglish", "Spanish"
  timeSlots?: string[]; // Custom blast time slots e.g. ["09:00 AM", "01:00 PM", "06:00 PM"]
  durationDays: number; // e.g. 3, 5, 7
  postsPerDay: number; // e.g. 6 (default)
  promoCode: string;
  discountDetails: string;
  targetPlatforms: string[];
  customNotes: string;
  customGuidelines?: string;
  selectedBrandIds: string[];
  brandVoucherCodes?: Record<string, string>; // Brand ID -> Unique Voucher Code
  brandDiscountDetails?: Record<string, string>; // Brand ID -> Unique Discount Offer/Mechanics
  aiProvider?: "gemini" | "claude";
  hookVariantCount?: number; // 1-3 A/B hook options generated per slot
  isFallback?: boolean; // true if the AI call failed and this campaign is template-generated, not real AI output
  fallbackReason?: string; // plain-language reason the AI call failed, shown alongside the fallback badge
  createdAt: string;
}

export interface PromoCodeRecord {
  id: string;
  code: string;
  campaignTitle: string;
  campaignType: CampaignType;
  monthYear: string;
  startDate?: string;
  /** One brand per code going forward (enforced server-side) — kept as an array for backward
   *  compatibility with older records that predate the one-code-per-brand rule. */
  brandIds: string[];
  brandShortCodes: string[];
  discountDetails: string;
  discountType?: "percentage" | "amount" | "cashback" | "custom";
  discountValue?: number;
  /** YYYY-MM-DD. Empty/undefined validUntil means the code never expires. */
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  notes?: string;
  redemptionCount?: number;
}

export type PostStatus = "draft" | "pending_review" | "approved" | "scheduled";

export interface Post {
  id: string;
  brandId: string;
  brandName: string;
  dayNumber: number; // 1, 2, 3...
  scheduledDate?: string; // e.g. "2026-08-21" or "21/08/2026"
  timeSlot: string; // e.g., "08:00 AM"
  slotIndex: number; // 1 to 6
  platform: string; // "Instagram", "TikTok", "Facebook", "Twitter", "Email", "WhatsApp"
  format: string; // "Reel Script", "Carousel", "Single Image", "Story", "Push Notification"
  title: string;
  hook: string;
  caption: string;
  promoCodeUsed: string;
  visualPrompt: string;
  hashtags: string[];
  cta: string;
  status: PostStatus;
  imageUrl?: string;
  approvedBy?: string;
  approvedAt?: string;
  hookVariants?: string[]; // A/B options generated alongside `hook` (which holds the currently-active choice)
}

export interface BrandContentPlan {
  brandId: string;
  brandName: string;
  posts: Post[];
}

export type SystemLayoutMode = "command" | "sidebar" | "compact";
export type SystemThemeMode = "dark" | "light" | "cyber";

export interface CampaignResult {
  id: string;
  config: CampaignConfig;
  brandsData: BrandContentPlan[];
  createdAt: string;
}

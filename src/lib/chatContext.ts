import { Brand, CampaignResult, PromoCodeRecord } from "../types";

// Builds the plain-text "data snapshot" sent alongside every chat message — rebuilt fresh from
// whatever's currently loaded in the app so the assistant is never answering from stale state.
export function buildChatContextSummary(
  brands: Brand[],
  campaigns: CampaignResult[],
  promoLibrary: PromoCodeRecord[]
): string {
  const brandsLine = `Brands (${brands.length}): ${brands
    .map((b) => `${b.name} [${b.shortCode || "?"}, ${b.categoryGroup || "WDF"}]`)
    .join(", ")}`;

  const campaignLines = campaigns
    .map((c) => {
      const posts = c.brandsData.flatMap((bd) => bd.posts || []);
      const approved = posts.filter((p) => p.status === "approved").length;
      const pending = posts.filter((p) => p.status === "pending_review").length;
      const draft = posts.filter((p) => p.status === "draft").length;
      const brandNames = c.brandsData.map((bd) => bd.brandName).join(", ");
      return `- "${c.config.title}" (${c.config.campaignType}, ${c.config.monthYear || "no month set"}): brands [${brandNames}], ${posts.length} posts total (${approved} approved, ${pending} pending review, ${draft} draft), promo code "${c.config.promoCode}", created ${c.createdAt}`;
    })
    .join("\n");

  const promoLines = promoLibrary
    .slice(0, 40)
    .map(
      (p) =>
        `- ${p.code}: "${p.campaignTitle}" (${p.monthYear || "?"}), brands [${(p.brandShortCodes || []).join(", ")}], ${p.discountDetails}${
          p.redemptionCount ? `, ${p.redemptionCount} redemptions logged` : ""
        }`
    )
    .join("\n");

  return [
    brandsLine,
    "",
    `Campaigns (${campaigns.length}):`,
    campaignLines || "(none yet)",
    "",
    `Promo Codes (${promoLibrary.length}${promoLibrary.length > 40 ? ", showing first 40" : ""}):`,
    promoLines || "(none yet)",
  ].join("\n");
}

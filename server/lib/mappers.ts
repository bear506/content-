export function rowToBrand(row: any) {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    categoryGroup: row.category_group,
    industry: row.industry,
    tone: row.tone,
    targetAudience: row.target_audience,
    keyProducts: row.key_products,
    defaultHashtags: row.default_hashtags,
    defaultPromoCode: row.default_promo_code,
    brandColor: row.brand_color,
    logoEmoji: row.logo_emoji,
    contentGuidelines: row.content_guidelines || "",
    bannedWords: JSON.parse(row.banned_words || "[]"),
  };
}

export function rowToPromoCode(row: any) {
  return {
    id: row.id,
    code: row.code,
    campaignTitle: row.campaign_title,
    campaignType: row.campaign_type,
    monthYear: row.month_year,
    startDate: row.start_date,
    brandIds: JSON.parse(row.brand_ids || "[]"),
    brandShortCodes: JSON.parse(row.brand_short_codes || "[]"),
    discountDetails: row.discount_details,
    discountType: row.discount_type || "custom",
    discountValue: row.discount_value || 0,
    validFrom: row.valid_from || "",
    validUntil: row.valid_until || "",
    notes: row.notes,
    redemptionCount: row.redemption_count || 0,
    createdAt: row.created_at,
  };
}

export function rowToPost(row: any) {
  const data = JSON.parse(row.data || "{}");
  return {
    ...data,
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    dayNumber: row.day_number,
    platform: row.platform,
    status: row.status,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
  };
}

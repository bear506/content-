import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { rowToPromoCode } from "../lib/mappers";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC").all();
  res.json({ promoCodes: (rows as any[]).map(rowToPromoCode) });
});

router.post("/", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const r = req.body || {};
  const code = String(r.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return res.status(400).json({ error: "Promo code is required." });

  const brandIds: string[] = Array.isArray(r.brandIds) ? r.brandIds : [];
  if (brandIds.length !== 1) {
    return res.status(400).json({ error: "Select exactly one brand for this promo code — one brand can only have one active code at a time." });
  }
  const [brandId] = brandIds;

  const existingRows = db.prepare("SELECT code, brand_ids, valid_until FROM promo_codes").all() as any[];

  const codeClash = existingRows.find((row) => String(row.code).toUpperCase() === code);
  if (codeClash) {
    return res.status(409).json({ error: `Promo code "${code}" is already in use — codes must be unique.` });
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeForBrand = existingRows.find((row) => {
    const ids: string[] = JSON.parse(row.brand_ids || "[]");
    if (!ids.includes(brandId)) return false;
    return !row.valid_until || row.valid_until >= today;
  });
  if (activeForBrand) {
    return res.status(409).json({
      error: `This brand already has an active promo code ("${activeForBrand.code}"). Delete it or let it expire before adding a new one.`,
    });
  }

  const id = r.id || `promo-${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO promo_codes (id, code, campaign_title, campaign_type, month_year, start_date, brand_ids, brand_short_codes, discount_details, discount_type, discount_value, valid_from, valid_until, notes, redemption_count, created_at)
    VALUES (@id, @code, @campaignTitle, @campaignType, @monthYear, @startDate, @brandIds, @brandShortCodes, @discountDetails, @discountType, @discountValue, @validFrom, @validUntil, @notes, 0, @now)
  `).run({
    id,
    code,
    campaignTitle: r.campaignTitle || "",
    campaignType: r.campaignType || "custom",
    monthYear: r.monthYear || "",
    startDate: r.startDate || "",
    brandIds: JSON.stringify(brandIds),
    brandShortCodes: JSON.stringify(r.brandShortCodes || []),
    discountDetails: r.discountDetails || "",
    discountType: r.discountType || "custom",
    discountValue: typeof r.discountValue === "number" ? r.discountValue : 0,
    validFrom: r.validFrom || "",
    validUntil: r.validUntil || "",
    notes: r.notes || "",
    now,
  });
  logAudit(req, "create", "promo_code", id, { code });
  res.json({ success: true, id });
});

router.patch("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const { redemptionCount } = req.body || {};
  if (typeof redemptionCount !== "number") {
    return res.status(400).json({ error: "redemptionCount must be a number." });
  }
  db.prepare("UPDATE promo_codes SET redemption_count = ? WHERE id = ?").run(redemptionCount, req.params.id);
  logAudit(req, "update", "promo_code", req.params.id, { redemptionCount });
  res.json({ success: true });
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  db.prepare("DELETE FROM promo_codes WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "promo_code", req.params.id, {});
  res.json({ success: true });
});

export default router;

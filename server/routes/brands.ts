import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { rowToBrand } from "../lib/mappers";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM brands ORDER BY created_at ASC").all();
  res.json({ brands: (rows as any[]).map(rowToBrand) });
});

router.post("/", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.name) {
    return res.status(400).json({ error: "Brand id and name are required." });
  }
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM brands WHERE id = ?").get(b.id);

  if (existing) {
    db.prepare(`
      UPDATE brands SET name=?, short_code=?, category_group=?, industry=?, tone=?, target_audience=?, key_products=?, default_hashtags=?, default_promo_code=?, brand_color=?, logo_emoji=?, content_guidelines=?, banned_words=?, updated_at=?
      WHERE id=?
    `).run(
      b.name, b.shortCode || "", b.categoryGroup || "WDF", b.industry || "", b.tone || "", b.targetAudience || "",
      b.keyProducts || "", b.defaultHashtags || "", b.defaultPromoCode || "", b.brandColor || "#6366f1", b.logoEmoji || "✨",
      b.contentGuidelines || "", JSON.stringify(b.bannedWords || []), now, b.id
    );
    logAudit(req, "update", "brand", b.id, { name: b.name });
  } else {
    db.prepare(`
      INSERT INTO brands (id, name, short_code, category_group, industry, tone, target_audience, key_products, default_hashtags, default_promo_code, brand_color, logo_emoji, content_guidelines, banned_words, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.id, b.name, b.shortCode || "", b.categoryGroup || "WDF", b.industry || "", b.tone || "", b.targetAudience || "",
      b.keyProducts || "", b.defaultHashtags || "", b.defaultPromoCode || "", b.brandColor || "#6366f1", b.logoEmoji || "✨",
      b.contentGuidelines || "", JSON.stringify(b.bannedWords || []), now, now
    );
    logAudit(req, "create", "brand", b.id, { name: b.name });
  }

  const row = db.prepare("SELECT * FROM brands WHERE id = ?").get(b.id);
  res.json({ success: true, brand: rowToBrand(row) });
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const count = (db.prepare("SELECT COUNT(*) as c FROM brands").get() as { c: number }).c;
  if (count <= 1) {
    return res.status(400).json({ error: "At least one brand must remain." });
  }
  db.prepare("DELETE FROM brands WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "brand", req.params.id, {});
  res.json({ success: true });
});

export default router;

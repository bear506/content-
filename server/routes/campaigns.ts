import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { rowToPost } from "../lib/mappers";
import { notifyWebhook } from "../lib/webhook";

const router = Router();

function getCampaignFull(campaignId: string) {
  const campRow = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as any;
  if (!campRow) return null;

  const postRows = db.prepare("SELECT * FROM posts WHERE campaign_id = ? ORDER BY day_number ASC, id ASC").all(campaignId) as any[];
  const posts = postRows.map(rowToPost);

  const brandsMap = new Map<string, { brandId: string; brandName: string; posts: any[] }>();
  for (const p of posts) {
    if (!brandsMap.has(p.brandId)) {
      brandsMap.set(p.brandId, { brandId: p.brandId, brandName: p.brandName, posts: [] });
    }
    brandsMap.get(p.brandId)!.posts.push(p);
  }

  return {
    id: campRow.id,
    config: JSON.parse(campRow.config),
    createdAt: campRow.created_at,
    brandsData: Array.from(brandsMap.values()),
  };
}

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id FROM campaigns ORDER BY created_at DESC").all() as { id: string }[];
  const campaigns = rows.map((r) => getCampaignFull(r.id)).filter(Boolean);
  res.json({ campaigns });
});

router.get("/:id", requireAuth, (req, res) => {
  const campaign = getCampaignFull(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign });
});

router.post("/", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const { config, brandsData } = req.body || {};
  if (!config || !Array.isArray(brandsData)) {
    return res.status(400).json({ error: "config and brandsData are required." });
  }

  const id = config.id || `result-${randomUUID()}`;
  const now = new Date().toISOString();
  const user = req.session.user;

  const insertCampaign = db.prepare("INSERT INTO campaigns (id, config, created_by, created_at) VALUES (?, ?, ?, ?)");
  const insertPost = db.prepare(`
    INSERT INTO posts (id, campaign_id, brand_id, brand_name, day_number, platform, status, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertCampaign.run(id, JSON.stringify({ ...config, id }), user?.username || null, now);
    for (const bd of brandsData) {
      for (const p of bd.posts || []) {
        const { id: postId, brandId, brandName, dayNumber, platform, status, ...rest } = p;
        insertPost.run(
          postId || `post-${randomUUID()}`,
          id,
          brandId || bd.brandId,
          brandName || bd.brandName,
          dayNumber,
          platform,
          status || "draft",
          JSON.stringify(rest),
          now,
          now
        );
      }
    }
  });
  tx();

  logAudit(req, "create", "campaign", id, { title: config.title });

  const postCount = brandsData.reduce((sum: number, bd: any) => sum + (bd.posts?.length || 0), 0);
  notifyWebhook(
    `📣 New campaign generated: *${config.title}*\n${brandsData.length} brand(s), ${postCount} post(s) — by ${user?.username || "unknown"}`
  );

  res.json({ success: true, campaign: getCampaignFull(id) });
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  db.prepare("DELETE FROM campaigns WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "campaign", req.params.id, {});
  res.json({ success: true });
});

export default router;

import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { getWebhookUrl, notifyWebhook } from "../lib/webhook";
import { DEFAULT_SOP_TEXT, SOP_CAMPAIGN_TYPES, type SopCampaignType } from "../lib/sop";

const router = Router();

router.get("/campaign-sop", requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${SOP_CAMPAIGN_TYPES.map(() => "?").join(",")})`)
    .all(...SOP_CAMPAIGN_TYPES.map((t) => `sop_${t}`)) as { key: string; value: string }[];

  const saved: Record<string, string> = {};
  for (const row of rows) saved[row.key.replace(/^sop_/, "")] = row.value;

  const sop: Record<SopCampaignType, string> = {} as any;
  for (const type of SOP_CAMPAIGN_TYPES) {
    sop[type] = saved[type] !== undefined ? saved[type] : DEFAULT_SOP_TEXT[type];
  }
  res.json({ sop, defaults: DEFAULT_SOP_TEXT });
});

router.put("/campaign-sop", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const { campaignType, text } = req.body || {};
  if (!SOP_CAMPAIGN_TYPES.includes(campaignType)) {
    return res.status(400).json({ error: `campaignType must be one of: ${SOP_CAMPAIGN_TYPES.join(", ")}` });
  }
  if (typeof text !== "string") {
    return res.status(400).json({ error: "text must be a string (empty string resets to the default)." });
  }

  const now = new Date().toISOString();
  const username = req.session.user?.username || null;
  const key = `sop_${campaignType}`;
  db.prepare(
    "INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
  ).run(key, text.trim(), username, now);

  logAudit(req, "update", "settings", key, { campaignType });
  res.json({ success: true, campaignType, text: text.trim() });
});

router.get("/webhook-url", requireAuth, requireRole("admin"), (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'webhook_url'").get() as { value: string } | undefined;
  res.json({
    url: row?.value || "",
    fromEnv: !row?.value && !!process.env.NOTIFY_WEBHOOK_URL,
  });
});

router.put("/webhook-url", requireAuth, requireRole("admin"), (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== "string") {
    return res.status(400).json({ error: "url must be a string (empty string clears it)." });
  }
  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return res.status(400).json({ error: "url must start with http:// or https://." });
  }

  const now = new Date().toISOString();
  const username = req.session.user?.username || null;
  db.prepare(
    "INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('webhook_url', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
  ).run(trimmed, username, now);

  logAudit(req, "update", "settings", "webhook_url", { url: trimmed || "(cleared)" });
  res.json({ success: true, url: trimmed });
});

router.post("/webhook-url/test", requireAuth, requireRole("admin"), (req, res) => {
  const url = getWebhookUrl();
  if (!url) {
    return res.status(400).json({ error: "No webhook URL is configured yet." });
  }
  notifyWebhook(`🔔 Test notification from CampaignAI — triggered by ${req.session.user?.username || "an admin"}.`);
  res.json({ success: true });
});

export default router;

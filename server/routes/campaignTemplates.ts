import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();

function rowToTemplate(row: any) {
  return {
    id: row.id,
    name: row.name,
    config: JSON.parse(row.config),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM campaign_templates ORDER BY created_at DESC").all() as any[];
  res.json({ templates: rows.map(rowToTemplate) });
});

router.post("/", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const { name, config } = req.body || {};
  if (!name || !name.trim() || !config) {
    return res.status(400).json({ error: "Template name and config are required." });
  }

  const id = `template-${randomUUID()}`;
  const now = new Date().toISOString();
  const user = req.session.user;

  db.prepare("INSERT INTO campaign_templates (id, name, config, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, name.trim(), JSON.stringify(config), user?.username || null, now);

  logAudit(req, "create", "campaign_template", id, { name: name.trim() });
  res.json({ success: true, id });
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  db.prepare("DELETE FROM campaign_templates WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "campaign_template", req.params.id, {});
  res.json({ success: true });
});

export default router;

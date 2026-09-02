import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows = db
    .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as any[];

  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: JSON.parse(r.details || "{}"),
      createdAt: r.created_at,
    })),
  });
});

export default router;

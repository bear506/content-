import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { rowToPost } from "../lib/mappers";
import { notifyWebhook } from "../lib/webhook";

const router = Router();

router.patch("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Post not found." });

  const current = rowToPost(row);
  const isApproving = req.body.status === "approved" && current.status !== "approved";

  // Only admins can move a post into "approved" — editors can create/edit and send for review.
  if (isApproving && req.session.user?.role !== "admin") {
    return res.status(403).json({ error: "Only an admin can approve a post." });
  }

  const updated = { ...current, ...req.body };
  const { id, brandId, brandName, dayNumber, platform, status, approvedBy, approvedAt, ...rest } = updated;

  const user = req.session.user;
  const isUnapproving = req.body.status !== undefined && req.body.status !== "approved" && current.status === "approved";
  const newApprovedBy = isApproving ? user?.username : isUnapproving ? null : row.approved_by;
  const newApprovedAt = isApproving ? new Date().toISOString() : isUnapproving ? null : row.approved_at;

  db.prepare(`
    UPDATE posts SET brand_id=?, brand_name=?, day_number=?, platform=?, status=?, approved_by=?, approved_at=?, data=?, updated_at=?
    WHERE id=?
  `).run(
    brandId, brandName, dayNumber, platform, status || "draft",
    newApprovedBy || null, newApprovedAt || null,
    JSON.stringify(rest), new Date().toISOString(), req.params.id
  );

  logAudit(req, isApproving ? "approve" : "update", "post", req.params.id, { status });

  if (isApproving) {
    notifyWebhook(
      `✅ Post approved: *${current.brandName}* — ${current.platform} (Day ${current.dayNumber}, ${current.timeSlot})\nApproved by ${user?.username || "unknown"}`
    );
  }

  const fresh = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  res.json({ success: true, post: rowToPost(fresh) });
});

router.delete("/:id", requireAuth, requireRole("admin", "editor"), (req, res) => {
  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "post", req.params.id, {});
  res.json({ success: true });
});

router.post("/bulk-approve", requireAuth, requireRole("admin"), (req, res) => {
  const { postIds } = req.body || {};
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ error: "postIds array is required." });
  }
  const user = req.session.user;
  const now = new Date().toISOString();
  const stmt = db.prepare("UPDATE posts SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?");
  const tx = db.transaction((ids: string[]) => {
    for (const pid of ids) stmt.run(user?.username || null, now, now, pid);
  });
  tx(postIds);
  logAudit(req, "bulk_approve", "post", null, { count: postIds.length });
  notifyWebhook(`✅ Bulk approved ${postIds.length} post(s) — by ${user?.username || "unknown"}`);
  res.json({ success: true, count: postIds.length });
});

// --- Comments ---

router.get("/:id/comments", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC").all(req.params.id) as any[];
  res.json({
    comments: rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      userId: r.user_id,
      username: r.username,
      body: r.body,
      createdAt: r.created_at,
    })),
  });
});

router.post("/:id/comments", requireAuth, (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Comment body is required." });

  const user = req.session.user;
  const id = `comment-${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO comments (id, post_id, user_id, username, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, req.params.id, user?.id || null, user?.username || "unknown", body.trim(), now);

  logAudit(req, "comment", "post", req.params.id, {});
  res.json({ success: true, id });
});

export default router;

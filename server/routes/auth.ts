import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "../db";
import { requireAuth, requireRole, Role } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  is_active: number;
  created_at: string;
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  if (!row || !row.is_active) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const passwordMatches = await bcrypt.compare(password, row.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  req.session.user = { id: row.id, username: row.username, role: row.role };
  res.json({ success: true, username: row.username, role: row.role });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Failed to log out." });
    }
    res.clearCookie("campaignai.sid");
    res.json({ success: true });
  });
});

router.get("/me", (req, res) => {
  if (req.session?.user) {
    return res.json({ authenticated: true, ...req.session.user });
  }
  res.json({ authenticated: false });
});

// --- User management (admin only) ---

router.get("/users", requireAuth, requireRole("admin"), (req, res) => {
  const rows = db.prepare("SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at ASC").all();
  res.json({
    users: (rows as any[]).map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      isActive: !!r.is_active,
      createdAt: r.created_at,
    })),
  });
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { username, password, role = "editor" } = req.body || {};
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Username and a password of at least 8 characters are required." });
  }
  if (!["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username.trim());
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = `user-${randomUUID()}`;
  db.prepare("INSERT INTO users (id, username, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .run(id, username.trim(), passwordHash, role, new Date().toISOString());

  logAudit(req, "create", "user", id, { username: username.trim(), role });
  res.json({ success: true, id });
});

router.patch("/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { role, isActive } = req.body || {};
  const updates: string[] = [];
  const params: any[] = [];

  if (role) {
    if (!["admin", "editor", "viewer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }
    updates.push("role = ?");
    params.push(role);
  }
  if (typeof isActive === "boolean") {
    updates.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  logAudit(req, "update", "user", req.params.id, { role, isActive });
  res.json({ success: true });
});

router.post("/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const { newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "User not found." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, req.params.id);
  logAudit(req, "reset_password", "user", req.params.id, {});
  res.json({ success: true });
});

router.delete("/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  if (req.session.user?.id === req.params.id) {
    return res.status(400).json({ error: "You can't delete your own account while logged in." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  logAudit(req, "delete", "user", req.params.id, {});
  res.json({ success: true });
});

export default router;

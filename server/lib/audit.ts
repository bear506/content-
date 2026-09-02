import type { Request } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";

export function logAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>
) {
  const user = req.session?.user;
  db.prepare(`
    INSERT INTO audit_log (id, user_id, username, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `audit-${randomUUID()}`,
    user?.id || null,
    user?.username || "unknown",
    action,
    entityType,
    entityId,
    JSON.stringify(details || {}),
    new Date().toISOString()
  );
}

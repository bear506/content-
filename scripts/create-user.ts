import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "../server/db";

async function main() {
  const [username, password, role = "editor"] = process.argv.slice(2);

  if (!username || !password) {
    console.error("Usage: npm run create-user -- <username> <password> [admin|editor|viewer]");
    process.exit(1);
  }
  if (!["admin", "editor", "viewer"].includes(role)) {
    console.error(`Invalid role "${role}". Must be admin, editor, or viewer.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    console.error(`A user named "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = `user-${randomUUID()}`;
  db.prepare("INSERT INTO users (id, username, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .run(id, username, passwordHash, role, new Date().toISOString());

  console.log(`Created user "${username}" with role "${role}".`);
}

main();

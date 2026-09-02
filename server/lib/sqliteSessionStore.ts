import session from "express-session";
import { db } from "../db";

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // matches server.ts's cookie maxAge
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Hand-rolled express-session Store backed by the same SQLite DB the rest of the app already
// uses — avoids pulling in a separate session-store dependency for what's a handful of queries
// against a table this file owns outright (see src/lib/csv.ts for the same "hand-roll the small
// thing" precedent in this codebase). Sessions now survive server restarts.
export class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    setInterval(() => {
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    }, CLEANUP_INTERVAL_MS).unref();
  }

  private expiryFor(sess: session.SessionData): number {
    const maxAge = sess.cookie?.maxAge;
    return Date.now() + (typeof maxAge === "number" ? maxAge : DEFAULT_MAX_AGE_MS);
  }

  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): void {
    try {
      const row = db.prepare("SELECT sess, expires_at FROM sessions WHERE sid = ?").get(sid) as
        | { sess: string; expires_at: number }
        | undefined;
      if (!row || row.expires_at < Date.now()) {
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: any) => void): void {
    try {
      db.prepare(
        "INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at"
      ).run(sid, JSON.stringify(sess), this.expiryFor(sess));
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    try {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    try {
      db.prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?").run(this.expiryFor(sess), sid);
      callback?.();
    } catch {
      callback?.();
    }
  }
}

import dotenv from "dotenv";
dotenv.config(); // must run before reading AUTH_USERNAME/AUTH_PASSWORD_HASH below — ESM hoists imports,
// so this module can otherwise execute before server.ts's own dotenv.config() call runs.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { INITIAL_BRANDS } from "../src/data/defaultBrands";
import { INITIAL_PROMO_LIBRARY } from "../src/data/defaultPromoLibrary";
import { SAMPLE_CAMPAIGNS } from "../src/data/sampleCampaigns";

// DATA_DIR lets a deploy point the SQLite file at a mounted persistent disk (e.g. Render) instead
// of the app's own working directory, which on most PaaS hosts is wiped on every deploy/restart.
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, "campaignai.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  category_group TEXT NOT NULL,
  industry TEXT,
  tone TEXT,
  target_audience TEXT,
  key_products TEXT,
  default_hashtags TEXT,
  default_promo_code TEXT,
  brand_color TEXT,
  logo_emoji TEXT,
  content_guidelines TEXT DEFAULT '',
  banned_words TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  brand_name TEXT,
  day_number INTEGER,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_at TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_posts_brand ON posts(brand_id);

CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  campaign_title TEXT,
  campaign_type TEXT,
  month_year TEXT,
  start_date TEXT,
  brand_ids TEXT DEFAULT '[]',
  brand_short_codes TEXT DEFAULT '[]',
  discount_details TEXT,
  notes TEXT,
  redemption_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS campaign_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
`);

// Additive migration — adds the structured discount + validity-window columns the promo code
// bank needs (one active code per brand) without touching existing rows or requiring a fresh DB.
function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn("promo_codes", "discount_type", "TEXT DEFAULT 'custom'");
ensureColumn("promo_codes", "discount_value", "REAL DEFAULT 0");
ensureColumn("promo_codes", "valid_from", "TEXT DEFAULT ''");
ensureColumn("promo_codes", "valid_until", "TEXT DEFAULT ''");

function nowIso() {
  return new Date().toISOString();
}

function seedIfEmpty() {
  const brandCount = (db.prepare("SELECT COUNT(*) as c FROM brands").get() as { c: number }).c;
  if (brandCount === 0) {
    const insert = db.prepare(`
      INSERT INTO brands (id, name, short_code, category_group, industry, tone, target_audience, key_products, default_hashtags, default_promo_code, brand_color, logo_emoji, content_guidelines, banned_words, created_at, updated_at)
      VALUES (@id, @name, @shortCode, @categoryGroup, @industry, @tone, @targetAudience, @keyProducts, @defaultHashtags, @defaultPromoCode, @brandColor, @logoEmoji, '', '[]', @now, @now)
    `);
    const insertMany = db.transaction((brands: typeof INITIAL_BRANDS) => {
      for (const b of brands) insert.run({ ...b, now: nowIso() });
    });
    insertMany(INITIAL_BRANDS);
    console.log(`Seeded ${INITIAL_BRANDS.length} default brands.`);
  }

  const promoCount = (db.prepare("SELECT COUNT(*) as c FROM promo_codes").get() as { c: number }).c;
  if (promoCount === 0) {
    const insert = db.prepare(`
      INSERT INTO promo_codes (id, code, campaign_title, campaign_type, month_year, start_date, brand_ids, brand_short_codes, discount_details, notes, redemption_count, created_at)
      VALUES (@id, @code, @campaignTitle, @campaignType, @monthYear, @startDate, @brandIds, @brandShortCodes, @discountDetails, @notes, 0, @createdAt)
    `);
    const insertMany = db.transaction((records: typeof INITIAL_PROMO_LIBRARY) => {
      for (const r of records) {
        insert.run({
          ...r,
          brandIds: JSON.stringify(r.brandIds),
          brandShortCodes: JSON.stringify(r.brandShortCodes),
          notes: r.notes || "",
        });
      }
    });
    insertMany(INITIAL_PROMO_LIBRARY);
    console.log(`Seeded ${INITIAL_PROMO_LIBRARY.length} default promo codes.`);
  }

  const campaignCount = (db.prepare("SELECT COUNT(*) as c FROM campaigns").get() as { c: number }).c;
  if (campaignCount === 0) {
    const insertCampaign = db.prepare(`INSERT INTO campaigns (id, config, created_by, created_at) VALUES (?, ?, ?, ?)`);
    const insertPost = db.prepare(`
      INSERT INTO posts (id, campaign_id, brand_id, brand_name, day_number, platform, status, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((campaigns: typeof SAMPLE_CAMPAIGNS) => {
      for (const c of campaigns) {
        insertCampaign.run(c.id, JSON.stringify(c.config), null, c.createdAt);
        for (const bd of c.brandsData) {
          for (const p of bd.posts) {
            const { id, brandId, brandName, dayNumber, platform, status, ...rest } = p as any;
            insertPost.run(id, c.id, brandId, brandName, dayNumber, platform, status || "draft", JSON.stringify(rest), c.createdAt, c.createdAt);
          }
        }
      }
    });
    insertMany(SAMPLE_CAMPAIGNS);
    console.log(`Seeded ${SAMPLE_CAMPAIGNS.length} sample campaigns.`);
  }

  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (userCount === 0) {
    const seedUsername = process.env.AUTH_USERNAME;
    const seedPasswordHash = process.env.AUTH_PASSWORD_HASH;
    if (seedUsername && seedPasswordHash) {
      db.prepare(`INSERT INTO users (id, username, password_hash, role, is_active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)`)
        .run(`user-${Date.now()}`, seedUsername, seedPasswordHash, nowIso());
      console.log(`Seeded initial admin user "${seedUsername}" from AUTH_USERNAME/AUTH_PASSWORD_HASH.`);
    } else {
      console.warn('No users exist yet and AUTH_USERNAME/AUTH_PASSWORD_HASH are not set. Run "npm run create-user -- <username> <password> admin" to create the first account.');
    }
  }
}

seedIfEmpty();

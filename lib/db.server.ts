import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";

/** Read-write SQLite database for the reusable content library. */
const DB_PATH =
  process.env.ITINERARY_DB_PATH ??
  path.join(process.cwd(), "data", "library.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  initSchema(db);
  _db = db;
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotels (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      city        TEXT,
      url         TEXT,
      category    TEXT,
      description TEXT,
      image       TEXT,            -- serialized ImageRef JSON
      lang        TEXT NOT NULL DEFAULT 'fr',
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sights (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      city        TEXT,
      description TEXT,
      image       TEXT,
      lang        TEXT NOT NULL DEFAULT 'fr',
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      city        TEXT,
      description TEXT,
      image       TEXT,
      lang        TEXT NOT NULL DEFAULT 'fr',
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cities (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      country     TEXT,
      intro       TEXT,
      lang        TEXT NOT NULL DEFAULT 'fr',
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hotels_name ON hotels(name);
    CREATE INDEX IF NOT EXISTS idx_sights_title ON sights(title);
    CREATE INDEX IF NOT EXISTS idx_activities_title ON activities(title);
    CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);

    -- AI-generated or fetched images, keyed by subject so we reuse them.
    CREATE TABLE IF NOT EXISTS generated_images (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,       -- 'city', 'sight', 'route', 'watercolor'
      key         TEXT NOT NULL,       -- city name, sight title, route slug
      source      TEXT NOT NULL,       -- 'ai', 'web', 'library'
      url         TEXT,                -- remote URL
      local_path  TEXT,                -- path under public/uploads
      metadata    TEXT,                -- JSON
      created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_images_type_key ON generated_images(type, key);

    -- Learning memory: user preferences, common routes, feedback.
    CREATE TABLE IF NOT EXISTS memory (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,       -- 'preference', 'route', 'hotel', 'sighting', 'feedback'
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,       -- JSON
      updated_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_category_key ON memory(category, key);
  `);
}

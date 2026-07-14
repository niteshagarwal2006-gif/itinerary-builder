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

    -- City coordinates for real distance and map calculations.
    CREATE TABLE IF NOT EXISTS city_coords (
      name        TEXT PRIMARY KEY,
      lat         REAL NOT NULL,
      lon         REAL NOT NULL,
      updated_at  TEXT NOT NULL
    );

    -- Monument/sight weekly closure days, learned from static rules and AI.
    -- Keyed by normalized sight title + city so future itineraries reuse the answer.
    CREATE TABLE IF NOT EXISTS monument_closures (
      id          TEXT PRIMARY KEY,
      sight_title TEXT NOT NULL,
      city        TEXT NOT NULL DEFAULT '',
      closed_days TEXT NOT NULL,       -- JSON array of weekday numbers (0=Sun..6=Sat)
      note        TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT 'ai', -- 'ai', 'static', 'manual'
      updated_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_monument_closures_title_city ON monument_closures(sight_title, city);

    -- AI activity log: every AI/web call, what was generated, and where it was saved.
    -- Used for audit, debugging, and to avoid repeating the same generation.
    CREATE TABLE IF NOT EXISTS ai_activity_log (
      id            TEXT PRIMARY KEY,
      category      TEXT NOT NULL,     -- 'text', 'image', 'geocode', 'distance', 'hotel_url', 'sight_suggestions', 'route_suggestion', 'translate', 'verify', 'review'
      provider      TEXT,              -- 'gemini', 'openrouter', 'anthropic', 'nominatim', 'osrm', 'pexels', 'web', 'cache'
      cache_key     TEXT NOT NULL,     -- deterministic key for deduplication
      input_hash    TEXT,              -- sha256 of normalized input
      input_summary TEXT NOT NULL,     -- JSON of request params
      output_summary TEXT,             -- JSON of result (truncated for large text/images)
      saved_to      TEXT,              -- db table or file path where result is persisted
      duration_ms   INTEGER,
      status        TEXT NOT NULL DEFAULT 'success', -- 'success', 'error', 'cached'
      error_message TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_activity_category ON ai_activity_log(category);
    CREATE INDEX IF NOT EXISTS idx_ai_activity_cache_key ON ai_activity_log(cache_key);
    CREATE INDEX IF NOT EXISTS idx_ai_activity_created_at ON ai_activity_log(created_at DESC);

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

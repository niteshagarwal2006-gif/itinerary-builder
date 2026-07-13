import "server-only";
import { getDb } from "./db.server";
import type { ImageRef, Lang } from "./itinerary/types";
import type {
  LibType,
  LibHotel,
  LibSight,
  LibCity,
  LibEntry,
} from "./library-types";

function parseImage(s: string | null): ImageRef | undefined {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as ImageRef;
  } catch {
    return undefined;
  }
}
const serializeImage = (img?: ImageRef): string | null =>
  img ? JSON.stringify(img) : null;
const nowIso = (): string => new Date().toISOString();
const asLang = (s: string): Lang => (s === "en" || s === "de" ? s : "fr");
const like = (q?: string): string => `%${(q ?? "").trim()}%`;

// --- Hotels -----------------------------------------------------------------
type HotelRow = {
  id: string; name: string; city: string | null; url: string | null;
  category: string | null; description: string | null; image: string | null;
  lang: string; updated_at: string;
};
const toHotel = (r: HotelRow): LibHotel => ({
  id: r.id, name: r.name, city: r.city ?? undefined, url: r.url ?? undefined,
  category: r.category ?? undefined, description: r.description ?? undefined,
  image: parseImage(r.image), lang: asLang(r.lang), updatedAt: r.updated_at,
});

export function listHotels(q?: string, lang?: Lang, city?: string): LibHotel[] {
  const conditions: string[] = ["(name LIKE ? OR city LIKE ?)"];
  const args: unknown[] = [like(q), like(q)];
  // Hotels have no meaningful lang distinction (imported as fr but shown for all)
  // City filter: strict match when provided
  if (city) { conditions.push("city LIKE ?"); args.push(like(city)); }
  const rows = getDb()
    .prepare(`SELECT * FROM hotels WHERE ${conditions.join(" AND ")} ORDER BY name COLLATE NOCASE LIMIT 100`)
    .all(...args) as HotelRow[];
  return rows.map(toHotel);
}
export function upsertHotel(h: LibHotel): void {
  getDb()
    .prepare(
      `INSERT INTO hotels (id,name,city,url,category,description,image,lang,updated_at)
       VALUES (@id,@name,@city,@url,@category,@description,@image,@lang,@updated_at)
       ON CONFLICT(id) DO UPDATE SET name=@name,city=@city,url=@url,category=@category,
         description=@description,image=@image,lang=@lang,updated_at=@updated_at`
    )
    .run({
      id: h.id, name: h.name, city: h.city ?? null, url: h.url ?? null,
      category: h.category ?? null, description: h.description ?? null,
      image: serializeImage(h.image), lang: h.lang, updated_at: nowIso(),
    });
}

// --- Sights -----------------------------------------------------------------
type SightRow = {
  id: string; title: string; city: string | null; description: string | null;
  image: string | null; lang: string; updated_at: string;
};
const toSight = (r: SightRow): LibSight => ({
  id: r.id, title: r.title, city: r.city ?? undefined,
  description: r.description ?? undefined, image: parseImage(r.image),
  lang: asLang(r.lang), updatedAt: r.updated_at,
});
export function listSights(q?: string, lang?: Lang, city?: string): LibSight[] {
  const conditions: string[] = ["(title LIKE ? OR city LIKE ?)"];
  const args: unknown[] = [like(q), like(q)];
  if (lang) { conditions.push("lang = ?"); args.push(lang); }
  // NULL-city entries are generic (apply anywhere) — keep them under a city filter
  if (city) { conditions.push("(city LIKE ? OR city IS NULL)"); args.push(like(city)); }
  const rows = getDb()
    .prepare(`SELECT * FROM sights WHERE ${conditions.join(" AND ")} ORDER BY title COLLATE NOCASE LIMIT 100`)
    .all(...args) as SightRow[];
  return rows.map(toSight);
}
export function upsertSight(s: LibSight): void {
  getDb()
    .prepare(
      `INSERT INTO sights (id,title,city,description,image,lang,updated_at)
       VALUES (@id,@title,@city,@description,@image,@lang,@updated_at)
       ON CONFLICT(id) DO UPDATE SET title=@title,city=@city,description=@description,
         image=@image,lang=@lang,updated_at=@updated_at`
    )
    .run({
      id: s.id, title: s.title, city: s.city ?? null,
      description: s.description ?? null, image: serializeImage(s.image),
      lang: s.lang, updated_at: nowIso(),
    });
}

// --- Activities -------------------------------------------------------------
export function listActivities(q?: string, lang?: Lang, city?: string): LibSight[] {
  const conditions: string[] = ["(title LIKE ? OR city LIKE ?)"];
  const args: unknown[] = [like(q), like(q)];
  if (lang) { conditions.push("lang = ?"); args.push(lang); }
  // NULL-city entries are generic (apply anywhere) — keep them under a city filter
  if (city) { conditions.push("(city LIKE ? OR city IS NULL)"); args.push(like(city)); }
  const rows = getDb()
    .prepare(`SELECT * FROM activities WHERE ${conditions.join(" AND ")} ORDER BY title COLLATE NOCASE LIMIT 100`)
    .all(...args) as SightRow[];
  return rows.map(toSight);
}
export function upsertActivity(s: LibSight): void {
  getDb()
    .prepare(
      `INSERT INTO activities (id,title,city,description,image,lang,updated_at)
       VALUES (@id,@title,@city,@description,@image,@lang,@updated_at)
       ON CONFLICT(id) DO UPDATE SET title=@title,city=@city,description=@description,
         image=@image,lang=@lang,updated_at=@updated_at`
    )
    .run({
      id: s.id, title: s.title, city: s.city ?? null,
      description: s.description ?? null, image: serializeImage(s.image),
      lang: s.lang, updated_at: nowIso(),
    });
}

// --- Cities -----------------------------------------------------------------
type CityRow = {
  id: string; name: string; country: string | null; intro: string | null;
  image: string | null; lang: string; updated_at: string;
};
const toCity = (r: CityRow): LibCity => ({
  id: r.id, name: r.name, country: r.country ?? undefined,
  intro: r.intro ?? undefined, image: parseImage(r.image),
  lang: asLang(r.lang), updatedAt: r.updated_at,
});
export function listCities(q?: string, lang?: Lang): LibCity[] {
  const where = lang
    ? `(name LIKE ? OR country LIKE ?) AND lang = ?`
    : `name LIKE ? OR country LIKE ?`;
  const args = lang ? [like(q), like(q), lang] : [like(q), like(q)];
  const rows = getDb()
    .prepare(`SELECT * FROM cities WHERE ${where} ORDER BY name COLLATE NOCASE LIMIT 100`)
    .all(...args) as CityRow[];
  return rows.map(toCity);
}
export function upsertCity(c: LibCity): void {
  getDb()
    .prepare(
      `INSERT INTO cities (id,name,country,intro,image,lang,updated_at)
       VALUES (@id,@name,@country,@intro,@image,@lang,@updated_at)
       ON CONFLICT(id) DO UPDATE SET name=@name,country=@country,intro=@intro,
         image=@image,lang=@lang,updated_at=@updated_at`
    )
    .run({
      id: c.id, name: c.name, country: c.country ?? null,
      intro: c.intro ?? null, image: serializeImage(c.image),
      lang: c.lang, updated_at: nowIso(),
    });
}

/** Return the hero image for a city (case-insensitive name match, any lang). */
export function getCityImage(cityName: string): ImageRef | undefined {
  const row = getDb()
    .prepare(`SELECT image FROM cities WHERE name = ? AND image IS NOT NULL LIMIT 1`)
    .get(cityName) as { image: string } | undefined;
  if (row) return parseImage(row.image);
  const row2 = getDb()
    .prepare(`SELECT image FROM cities WHERE name LIKE ? AND image IS NOT NULL LIMIT 1`)
    .get(`%${cityName}%`) as { image: string } | undefined;
  return row2 ? parseImage(row2.image) : undefined;
}

// --- Generic dispatch -------------------------------------------------------
export function listEntries(type: LibType, q?: string, lang?: Lang, city?: string): LibEntry[] {
  if (type === "hotels") return listHotels(q, lang, city);
  if (type === "sights") return listSights(q, lang, city);
  if (type === "activities") return listActivities(q, lang, city);
  return listCities(q, lang);
}
export function upsertEntry(type: LibType, entry: LibEntry): void {
  if (type === "hotels") return upsertHotel(entry as LibHotel);
  if (type === "sights") return upsertSight(entry as LibSight);
  if (type === "activities") return upsertActivity(entry as LibSight);
  return upsertCity(entry as LibCity);
}
export function deleteEntry(type: LibType, id: string): void {
  getDb().prepare(`DELETE FROM ${type} WHERE id = ?`).run(id);
}

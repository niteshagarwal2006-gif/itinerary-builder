import "server-only";
import { getDb } from "@/lib/db.server";

export type MemoryCategory = "preference" | "route" | "hotel" | "feedback" | "sighting" | "flow";

function get(category: MemoryCategory, key: string): unknown {
  const row = getDb()
    .prepare("SELECT value FROM memory WHERE category = ? AND key = ?")
    .get(category, key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function set(category: MemoryCategory, key: string, value: unknown): void {
  const json = JSON.stringify(value);
  getDb()
    .prepare(
      `INSERT INTO memory (id, category, key, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(category, key) DO UPDATE SET value = ?, updated_at = ?`
    )
    .run(
      crypto.randomUUID(),
      category,
      key,
      json,
      new Date().toISOString(),
      json,
      new Date().toISOString()
    );
}

/** Remember a simple preference, e.g. default language or meal plan. */
export function recordPreference(key: string, value: unknown): void {
  set("preference", key, value);
}

export function getPreference(key: string): unknown {
  return get("preference", key);
}

/** Remember a route the user created. */
export function recordRoute(cities: string[]): void {
  const key = cities.join("|").toLowerCase();
  const existing = get("route", key) as { count: number; cities: string[] } | undefined;
  set("route", key, {
    cities,
    count: (existing?.count ?? 0) + 1,
    lastUsed: new Date().toISOString(),
  });
}

/** Return the most frequently used routes. */
export function commonRoutes(limit = 5): string[][] {
  const rows = getDb()
    .prepare("SELECT value FROM memory WHERE category = 'route' ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as { value: string }[];
  return rows
    .map((r) => {
      try {
        const v = JSON.parse(r.value) as { cities?: string[] };
        return v.cities ?? [];
      } catch {
        return [];
      }
    })
    .filter((r) => r.length > 0);
}

/** Remember a hotel the user picked for a city. */
export function recordHotel(city: string, name: string, url?: string): void {
  const key = city.toLowerCase();
  const existing = (get("hotel", key) as { hotels: { name: string; url?: string; count: number }[] } | undefined) ?? { hotels: [] };
  const idx = existing.hotels.findIndex((h) => h.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    existing.hotels[idx].count += 1;
    if (url) existing.hotels[idx].url = url;
  } else {
    existing.hotels.push({ name, url, count: 1 });
  }
  set("hotel", key, existing);
}

/** Suggest hotels previously used for a city. */
export function suggestedHotels(city: string): { name: string; url?: string; count: number }[] {
  const data = get("hotel", city.toLowerCase()) as { hotels: { name: string; url?: string; count: number }[] } | undefined;
  return (data?.hotels ?? []).sort((a, b) => b.count - a.count);
}

/** Store free-form feedback / questions. */
export function recordFeedback(text: string, context?: Record<string, unknown>): void {
  set("feedback", `${Date.now()}`, { text, context, createdAt: new Date().toISOString() });
}

/** Remember a sight/activity the user added for a city. */
export function recordSighting(city: string, title: string): void {
  const key = city.toLowerCase();
  const existing = (get("sighting", key) as { titles: string[] } | undefined) ?? { titles: [] };
  if (!existing.titles.includes(title)) {
    existing.titles.push(title);
    set("sighting", key, existing);
  }
}

/** Suggest sights previously used for a city. */
export function suggestedSights(city: string): string[] {
  const data = get("sighting", city.toLowerCase()) as { titles: string[] } | undefined;
  return data?.titles ?? [];
}

/** Save the narrative flow / tone rules AI used, so future itineraries improve. */
export function recordFlowStyle(rules: string): void {
  const existing = (get("flow", "style") as { versions?: string[] } | undefined) ?? { versions: [] };
  existing.versions = [rules, ...(existing.versions ?? [])].slice(0, 20);
  set("flow", "style", existing);
}

/** Retrieve the most recent narrative flow guidance, if any. */
export function getFlowStyle(): string | undefined {
  const data = get("flow", "style") as { versions?: string[] } | undefined;
  return data?.versions?.[0];
}

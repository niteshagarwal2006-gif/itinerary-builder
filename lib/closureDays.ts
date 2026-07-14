/**
 * Weekly closure days for monuments/sights in India.
 *
 * Order of lookup:
 * 1. SQLite cache (monument_closures table)
 * 2. Static patterns (compiled from ASI/state tourism sources)
 * 3. AI lookup (Gemini/OpenRouter) — result is cached so AI usage declines over time.
 */

import { getDb } from "./db.server";
import { generateText, hasAiProvider } from "./ai/gemini";
import { logActivity } from "./ai/log";
import type { Lang } from "./itinerary/types";

export interface ClosureInfo {
  closedDays: number[]; // 0-6, JS weekday numbers
  note: string;
}

const DAY: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type Pattern = [RegExp, (keyof typeof DAY)[], string];

/** Static patterns — kept as a fast fallback and seed for the cache. */
const PATTERNS: Pattern[] = [
  // Agra
  [/taj\s*mahal/i, ["friday"], "Closed for Friday prayers at the mosque"],
  // Delhi
  [/qutub?\s*minar|qutb\s*minar/i, ["monday"], "Closed Mondays (ASI)"],
  [/lotus\s*temple|temp[l]e.*lotus/i, ["monday"], "Closed Mondays for maintenance"],
  // Kochi
  [/synagogue\s*paradesi|paradesi\s*synagogue|jew\s*town.*synagogue|synagogue.*jew/i, ["friday", "saturday"], "Closed Fri & Sat (Jewish Sabbath)"],
  [/mattancherry|palais\shollandais|dutch\s*palace/i, ["friday", "saturday"], "Closed Fri & Sat"],
  [/indo.?portuguese\s*museum/i, ["monday"], "Closed Mondays"],
  // Chennai
  [/government\s*museum.*chennai|chennai.*government\s*museum|mus[ée]e?\s*du\s*gouvernement/i, ["friday"], "Closed Fridays and national holidays"],
  [/vivekanandar?\s*(illam|house)|vivekananda\s*house/i, ["monday"], "Closed Mondays"],
  // Munnar
  [/tea\s*museum|kdhp|tata\s*tea\s*museum/i, ["monday"], "Closed Mondays and Good Fridays"],
  // Pondicherry / Pondichéry
  [/mus[ée]e?\s*(de\s*)?pondich[eé]r[yi]|pondich[eé]r[yi]\s*mus[ée]e?/i, ["monday"], "Closed Mondays and national holidays"],
  // Generic ASI state museum pattern (catches many state museums)
  [/state\s*museum/i, ["monday"], "Most state museums closed Mondays"],
];

/** Returns { closedDays, note } from static patterns, or null if no match. */
export function getStaticClosureInfo(sightTitle: string): ClosureInfo | null {
  const t = sightTitle.toLowerCase();
  for (const [re, days, note] of PATTERNS) {
    if (re.test(t)) {
      return { closedDays: days.map((d) => DAY[d]), note };
    }
  }
  return null;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

function parseClosedDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as (number | string)[];
    return parsed
      .map((d) => (typeof d === "number" ? d : DAY[String(d).toLowerCase()]))
      .filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6);
  } catch {
    return [];
  }
}

/** Fetch closure info from the cache table. Tries city-specific first, then generic. */
function getCachedClosureInfo(sightTitle: string, city?: string): ClosureInfo | null {
  const db = getDb();
  const title = normalizeTitle(sightTitle);
  const cityNorm = (city || "").toLowerCase().trim();

  const row = db
    .prepare(
      "SELECT closed_days, note FROM monument_closures WHERE sight_title = ? AND city = ?"
    )
    .get(title, cityNorm) as { closed_days: string; note: string } | undefined;

  if (!row && cityNorm) {
    const generic = db
      .prepare(
        "SELECT closed_days, note FROM monument_closures WHERE sight_title = ? AND city = ''"
      )
      .get(title) as { closed_days: string; note: string } | undefined;
    if (generic) return { closedDays: parseClosedDays(generic.closed_days), note: generic.note };
  }

  if (!row) return null;
  return { closedDays: parseClosedDays(row.closed_days), note: row.note };
}

/** Persist closure info to the cache table. */
function saveClosureInfo(
  sightTitle: string,
  city: string | undefined,
  info: ClosureInfo,
  source: "ai" | "static" | "manual"
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO monument_closures (id, sight_title, city, closed_days, note, source, updated_at)
     VALUES (@id, @title, @city, @days, @note, @source, @updatedAt)
     ON CONFLICT(sight_title, city) DO UPDATE SET
       closed_days = @days,
       note = @note,
       source = @source,
       updated_at = @updatedAt`
  ).run({
    id,
    title: normalizeTitle(sightTitle),
    city: (city || "").toLowerCase().trim(),
    days: JSON.stringify(info.closedDays),
    note: info.note,
    source,
    updatedAt: new Date().toISOString(),
  });
}

async function askAiClosureInfo(sightTitle: string, city: string, lang: Lang): Promise<ClosureInfo | null> {
  if (!hasAiProvider()) return null;

  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const system =
    "You are a precise travel-data assistant. Return ONLY a valid JSON object, no markdown, no explanation.";
  const prompt =
    `In ${languageName}, tell me the weekly closure day(s) for "${sightTitle}" in ${city}, India. ` +
    `Return JSON exactly like {"closedDays":["friday"],"note":"short reason"}. ` +
    `Use empty arrays and note if unknown. Weekday names must be lowercase English.`;
  const cacheKey = `closure:${lang}:${city}:${sightTitle}`;
  const start = Date.now();

  try {
    const raw = await generateText(system, prompt);
    const parsed = JSON.parse(raw) as { closedDays?: (string | number)[]; note?: string };
    const closedDays = (parsed.closedDays || [])
      .map((d) => (typeof d === "number" ? d : DAY[String(d).toLowerCase()]))
      .filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6);
    const note = typeof parsed.note === "string" ? parsed.note : "";

    logActivity({
      category: "verify",
      provider: "gemini",
      cacheKey,
      input: { sightTitle, city, lang },
      output: { closedDays, note },
      savedTo: "monument_closures",
      durationMs: Date.now() - start,
      status: "success",
    });

    return { closedDays, note };
  } catch (err) {
    logActivity({
      category: "verify",
      provider: "gemini",
      cacheKey,
      input: { sightTitle, city, lang },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Returns closure info for a sight, using the cache first, then static patterns,
 * then AI. Results from static/AI are written to the cache so future lookups
 * do not need AI.
 */
export async function getClosureInfo(sightTitle: string, city?: string, lang: Lang = "en"): Promise<ClosureInfo | null> {
  const cached = getCachedClosureInfo(sightTitle, city);
  if (cached) return cached;

  const staticInfo = getStaticClosureInfo(sightTitle);
  if (staticInfo) {
    saveClosureInfo(sightTitle, city, staticInfo, "static");
    return staticInfo;
  }

  if (city) {
    const aiInfo = await askAiClosureInfo(sightTitle, city, lang);
    if (aiInfo) {
      saveClosureInfo(sightTitle, city, aiInfo, "ai");
      return aiInfo;
    }
  }

  return null;
}

/** Returns true if the sight is closed on the given weekday (0=Sun). */
export async function isClosedOn(sightTitle: string, weekday: number, city?: string, lang?: Lang): Promise<boolean> {
  const info = await getClosureInfo(sightTitle, city, lang);
  return info?.closedDays.includes(weekday) ?? false;
}

export interface DateCheckResult {
  closed: boolean;
  weekday: number;
  dayName: string;
  note?: string;
}

/**
 * Check whether a sight is closed on a specific calendar date.
 * Returns the weekday number, day name, and closure note if closed.
 */
export async function checkSightOnDate(
  sightTitle: string,
  isoDate: string,
  city?: string,
  lang: Lang = "en"
): Promise<DateCheckResult> {
  const d = new Date(isoDate + "T00:00:00Z");
  const weekday = d.getUTCDay();
  const info = await getClosureInfo(sightTitle, city, lang);
  const closed = info ? info.closedDays.includes(weekday) : false;
  return {
    closed,
    weekday,
    dayName: WEEKDAY_NAMES[weekday],
    note: closed ? info?.note : undefined,
  };
}

/** Day-of-week name (English) for display. */
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_NAMES_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const WEEKDAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** Localised weekday name for a closure note. */
export function weekdayName(weekday: number, lang: Lang): string {
  if (lang === "fr") return WEEKDAY_NAMES_FR[weekday];
  if (lang === "de") return WEEKDAY_NAMES_DE[weekday];
  return WEEKDAY_NAMES[weekday];
}

import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./db.server";
import { generateJson, generateText, hasAiProvider } from "./ai/gemini";
import { logActivity } from "./ai/log";
import type { Lang } from "./itinerary/types";

/**
 * Default suggested activities/experiences for major Indian cities.
 */
const DEFAULT_CITY_ACTIVITIES: Record<string, string[]> = {
  delhi: ["Rickshaw ride in Old Delhi", "Heritage walk in Chandni Chowk", "Sunset at India Gate", "Cooking class with a local family"],
  agra: ["Sunrise visit to Taj Mahal", "Heritage walk in Agra", "Cooking demonstration"],
  jaipur: ["Elephant ride at Amber Fort", "Block printing workshop", "Hot air balloon ride", "Heritage walk in Pink City"],
  jodhpur: ["Zip-lining at Mehrangarh Fort", "Blue city heritage walk", "Sunset at Jaswant Thada"],
  udaipur: ["Sunset boat ride on Lake Pichola", "Cooking class", "Heritage walk in old city"],
  jaisalmer: ["Camel safari in Sam Sand Dunes", "Sunset at Gadisar Lake", "Folk dance performance"],
  varanasi: ["Morning boat ride on the Ganges", "Ganga Aarti ceremony", "Heritage walk in old city"],
  khajuraho: ["Light and sound show", "Village tour"],
  amritsar: ["Wagah Border ceremony", "Heritage walk in old city", "Langar at Golden Temple"],
  shimla: ["Toy train ride", "Ice skating at The Ridge", "Nature walk to Kufri"],
  manali: ["River rafting in Beas", "Paragliding in Solang Valley", "Snow activities at Rohtang"],
  rishikesh: ["River rafting", "Yoga session by the Ganges", "Ganga Aarti at Triveni Ghat"],
  mussoorie: ["Cable car to Gun Hill", "Nature walk to Kempty Falls"],
  kochi: ["Backwater sunset cruise", "Kathakali dance show", "Heritage walk in Fort Kochi"],
  munnar: ["Tea plantation walk", "Shikara ride in Kundala Lake", "Nature trek"],
  thekkady: ["Boat safari in Periyar Lake", "Spice plantation tour", "Kalaripayattu show"],
  alleppey: ["Houseboat cruise", "Canoe ride through backwaters", "Village walk"],
  kumarakom: ["Backwater cruise", "Bird watching tour"],
  kovalam: ["Sunset at Lighthouse Beach", "Ayurveda massage", "Surfing lesson"],
  chennai: ["Sunrise at Marina Beach", "Heritage walk in Mylapore", "Bharatanatyam performance"],
  pondicherry: ["Cycling tour of French Quarter", "Sunset at Promenade Beach", "Auroville visit"],
  thanjavur: ["Bharatanatyam performance", "Craft village visit"],
  madurai: ["Heritage walk around Meenakshi Temple", "Sunset at Thirumalai Nayakkar Palace"],
  mumbai: ["Dharavi slum tour", "Heritage walk in Fort area", "Sunset at Marine Drive", "Bollywood studio tour"],
  goa: ["Sunset cruise on Mandovi River", "Dolphin watching", "Beach shack evening", "Spice plantation tour"],
  kolkata: ["Heritage tram ride", "Food walk in Park Street", "Sunset at Princep Ghat"],
  bikaner: ["Camel safari", "Desert camp dinner"],
  pushkar: ["Sunset at Pushkar Lake", "Camel fair visit (seasonal)", "Desert safari"],
  ranthambore: ["Jeep safari in Ranthambore National Park", "Bird watching tour"],
};

function normalizeCity(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function keyOf(city: string): string {
  return normalizeCity(city).replace(/\s+/g, "_");
}

function getDefaults(city: string): string[] {
  return DEFAULT_CITY_ACTIVITIES[keyOf(city)] ?? [];
}

function getDbActivities(city: string): { title: string }[] {
  return getDb()
    .prepare("SELECT title FROM activities WHERE city = ? ORDER BY updated_at DESC")
    .all(normalizeCity(city)) as { title: string }[];
}

function ensureDefaults(city: string): void {
  const defaults = getDefaults(city);
  if (defaults.length === 0) return;
  const stmt = getDb().prepare(
    "INSERT OR IGNORE INTO activities (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  for (const title of defaults) {
    stmt.run(randomUUID(), title, normalizeCity(city), "en", now);
  }
}

async function generateWithAi(city: string): Promise<string[]> {
  if (!hasAiProvider()) return [];
  const system =
    "You are an expert India travel guide. Return ONLY a JSON array of the top 6 must-do activities/experiences for the given Indian city. No commentary.";
  const prompt = `List the top 6 must-do activities and experiences in ${city}, India as a JSON array of strings. Examples: rickshaw ride, cooking class, boat ride, heritage walk.`;
  const cacheKey = `activity-suggestions:${normalizeCity(city)}`;
  const start = Date.now();
  try {
    const data = await generateJson<string[]>(system, prompt);
    if (Array.isArray(data) && data.length > 0) {
      const activities = data.map((s) => String(s).trim()).filter(Boolean);
      logActivity({
        category: "sight_suggestions",
        provider: "gemini",
        cacheKey,
        input: { city },
        output: { count: activities.length, activities },
        savedTo: "activities",
        durationMs: Date.now() - start,
        status: "success",
      });
      return activities;
    }
  } catch (err) {
    console.error("AI activity generation failed for", city, err);
    logActivity({
      category: "sight_suggestions",
      provider: "gemini",
      cacheKey,
      input: { city },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  return [];
}

/** Return suggested activities for a city, seeding defaults and learning from memory. */
export async function getSuggestedActivities(city: string): Promise<string[]> {
  ensureDefaults(city);
  const dbActivities = getDbActivities(city).map((r) => r.title);
  if (dbActivities.length > 0) return dbActivities;

  const aiActivities = await generateWithAi(city);
  if (aiActivities.length > 0) {
    const stmt = getDb().prepare(
      "INSERT OR IGNORE INTO activities (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const now = new Date().toISOString();
    for (const title of aiActivities) {
      stmt.run(randomUUID(), title, normalizeCity(city), "en", now);
    }
    return aiActivities;
  }

  return getDefaults(city);
}

/** Add an activity to the city's suggestion list (called when user adds a custom activity). */
export function addSuggestedActivity(city: string, title: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO activities (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), title.trim(), normalizeCity(city), "en", new Date().toISOString());
}

/** Get a cached activity description from the database. */
export function getCachedActivityDescription(title: string, city: string, lang: string): string | undefined {
  const row = getDb()
    .prepare("SELECT description FROM activities WHERE title = ? AND city = ? AND lang = ?")
    .get(title, normalizeCity(city), lang) as { description: string | null } | undefined;
  return row?.description ?? undefined;
}

/** Save an activity description to the database. */
export function saveActivityDescription(title: string, city: string, lang: string, description: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM activities WHERE title = ? AND city = ? AND lang = ?")
    .get(title, normalizeCity(city), lang) as { id: string } | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE activities SET description = ?, updated_at = ? WHERE id = ?")
      .run(description, new Date().toISOString(), existing.id);
  } else {
    getDb()
      .prepare("INSERT INTO activities (id, title, city, description, lang, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), title, normalizeCity(city), description, lang, new Date().toISOString());
  }
}

function languageName(lang: Lang): string {
  return lang === "fr" ? "French" : lang === "en" ? "English" : "German";
}

async function generateActivityDescription(title: string, city: string, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const system = "You are a luxury travel writer for the Indian subcontinent. Write rich, evocative descriptions.";
  const prompt = `Write a detailed paragraph of 4-6 sentences in ${languageName(lang)} for the activity "${title}" in ${city}, India, suitable for a high-end travel itinerary. Describe the experience, atmosphere, and what makes it memorable. Return only the description, no labels.`;
  const cacheKey = `activity-desc:${lang}:${city}:${title}`;
  const start = Date.now();
  try {
    const text = (await generateText(system, prompt)).trim();
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return text;
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

export async function ensureActivityDescription(title: string, city: string, lang: Lang): Promise<string> {
  const cached = getCachedActivityDescription(title, city, lang);
  if (cached?.trim()) {
    logActivity({
      category: "text",
      provider: "cache",
      cacheKey: `activity-desc:${lang}:${city}:${title}`,
      input: { title, city, lang },
      output: { length: cached.length, preview: cached.slice(0, 200) },
      savedTo: "activities",
      status: "cached",
    });
    return cached;
  }
  const desc = await generateActivityDescription(title, city, lang);
  if (desc) saveActivityDescription(title, city, lang, desc);
  return desc;
}

export interface LearnedActivity {
  title: string;
  description: string;
}

/**
 * Learn a custom activity: store it and generate a description.
 * Safe to call multiple times — cached values are returned after the first run.
 */
export async function learnActivity(title: string, city: string, lang: Lang): Promise<LearnedActivity> {
  addSuggestedActivity(city, title);
  const description = await ensureActivityDescription(title, city, lang);
  return {
    title: title.trim(),
    description,
  };
}

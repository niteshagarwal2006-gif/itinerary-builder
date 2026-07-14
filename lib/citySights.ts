import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db.server";
import { generateJson, generateText, hasAiProvider } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";
import { getSightImage } from "./images/imageService";
import type { Lang } from "./itinerary/types";

/**
 * Default suggested sights for major Indian cities.
 * These are shown immediately in the wizard; user can click to add.
 */
const DEFAULT_CITY_SIGHTS: Record<string, string[]> = {
  delhi: [
    "Red Fort",
    "Qutub Minar",
    "Humayun's Tomb",
    "India Gate",
    "Lotus Temple",
    "Jama Masjid",
    "Chandni Chowk",
    "Raj Ghat",
    "Akshardham Temple",
    "National Museum",
  ],
  agra: [
    "Taj Mahal",
    "Agra Fort",
    "Itmad-ud-Daula",
    "Mehtab Bagh",
    "Fatehpur Sikri",
    "Akbar's Tomb",
    "Jama Masjid",
  ],
  jaipur: [
    "Amber Fort",
    "Hawa Mahal",
    "City Palace",
    "Jantar Mantar",
    "Jal Mahal",
    "Albert Hall Museum",
    "Birla Mandir",
    "Nahargarh Fort",
  ],
  jodhpur: [
    "Mehrangarh Fort",
    "Jaswant Thada",
    "Umaid Bhawan Palace",
    "Clock Tower",
    "Mandore Gardens",
  ],
  udaipur: [
    "City Palace",
    "Lake Pichola",
    "Jag Mandir",
    "Saheliyon Ki Bari",
    "Fateh Sagar Lake",
    "Jagdish Temple",
    "Monsoon Palace",
  ],
  jaisalmer: [
    "Jaisalmer Fort",
    "Patwon Ki Haveli",
    "Sam Sand Dunes",
    "Gadisar Lake",
    "Bada Bagh",
    "Salim Singh Ki Haveli",
  ],
  varanasi: [
    "Kashi Vishwanath Temple",
    "Dashashwamedh Ghat",
    "Ganga Aarti",
    "Sarnath",
    "Assi Ghat",
    "Manikarnika Ghat",
  ],
  khajuraho: [
    "Western Group of Temples",
    "Kandariya Mahadeva Temple",
    "Lakshmana Temple",
    "Eastern Group of Temples",
  ],
  amritsar: [
    "Golden Temple",
    "Jallianwala Bagh",
    "Wagah Border",
    "Akal Takht",
  ],
  shimla: [
    "The Ridge",
    "Mall Road",
    "Jakhoo Temple",
    "Christ Church",
    "Kufri",
  ],
  manali: [
    "Solang Valley",
    "Rohtang Pass",
    "Hadimba Temple",
    "Vashisht Hot Springs",
    "Old Manali",
  ],
  rishikesh: [
    "Laxman Jhula",
    "Ram Jhula",
    "Triveni Ghat",
    "Beatles Ashram",
    "Neelkanth Mahadev",
  ],
  mussoorie: [
    "Gun Hill",
    "Kempty Falls",
    "Mall Road",
    "Camel's Back Road",
    "Lal Tibba",
  ],
  kochi: [
    "Fort Kochi",
    "Chinese Fishing Nets",
    "Mattancherry Palace",
    "Paradesi Synagogue",
    "St. Francis Church",
    "Marine Drive",
  ],
  munnar: [
    "Tea Gardens",
    "Eravikulam National Park",
    "Mattupetty Dam",
    "Kundala Lake",
    "Tea Museum",
  ],
  thekkady: [
    "Periyar Wildlife Sanctuary",
    "Periyar Lake",
    "Spice Plantations",
    "Kathakali Show",
  ],
  alleppey: [
    "Backwater Cruise",
    "Alleppey Beach",
    "Vembanad Lake",
    "Marari Beach",
  ],
  kumarakom: [
    "Kumarakom Bird Sanctuary",
    "Vembanad Lake",
    "Backwaters",
  ],
  kovalam: [
    "Kovalam Beach",
    "Lighthouse Beach",
    "Hawah Beach",
    "Samudra Beach",
  ],
  chennai: [
    "Marina Beach",
    "Kapaleeshwarar Temple",
    "Fort St. George",
    "San Thome Basilica",
    "Government Museum",
  ],
  pondicherry: [
    "Auroville",
    "Sri Aurobindo Ashram",
    "Promenade Beach",
    "French Quarter",
    "Paradise Beach",
  ],
  thanjavur: [
    "Brihadeeswarar Temple",
    "Thanjavur Maratha Palace",
    "Saraswathi Mahal Library",
  ],
  madurai: [
    "Meenakshi Amman Temple",
    "Thirumalai Nayakkar Palace",
    "Gandhi Museum",
  ],
  mumbai: [
    "Gateway of India",
    "Marine Drive",
    "Elephanta Caves",
    "Chhatrapati Shivaji Terminus",
    "Colaba Causeway",
  ],
  goa: [
    "Basilica of Bom Jesus",
    "Dudhsagar Falls",
    "Fort Aguada",
    "Anjuna Beach",
    "Baga Beach",
    "Old Goa Churches",
  ],
  kolkata: [
    "Victoria Memorial",
    "Howrah Bridge",
    "Dakshineswar Kali Temple",
    "Indian Museum",
    "Marble Palace",
  ],
  bikaner: [
    "Junagarh Fort",
    "Karni Mata Temple",
    "National Research Centre on Camel",
    "Lalgarh Palace",
  ],
  pushkar: [
    "Pushkar Lake",
    "Brahma Temple",
    "Pushkar Camel Fair Ground",
    "Savitri Temple",
  ],
  ranthambore: [
    "Ranthambore National Park Safari",
    "Ranthambore Fort",
    "Padam Lake",
  ],
};

function normalizeCity(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function keyOf(city: string): string {
  return normalizeCity(city).replace(/\s+/g, "_");
}

function getDefaults(city: string): string[] {
  return DEFAULT_CITY_SIGHTS[keyOf(city)] ?? [];
}

function getDbSights(city: string): { title: string }[] {
  return getDb()
    .prepare("SELECT title FROM sights WHERE city = ? ORDER BY updated_at DESC")
    .all(normalizeCity(city)) as { title: string }[];
}

function ensureDefaults(city: string): void {
  const defaults = getDefaults(city);
  if (defaults.length === 0) return;
  const stmt = getDb().prepare(
    "INSERT OR IGNORE INTO sights (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  for (const title of defaults) {
    stmt.run(randomUUID(), title, normalizeCity(city), "en", now);
  }
}

async function generateWithAi(city: string): Promise<string[]> {
  if (!hasAiProvider()) return [];
  const system =
    "You are an expert India travel guide. Return ONLY a JSON array of the top 8 must-see sights/activities for the given Indian city. No commentary.";
  const prompt = `List the top 8 must-see sights and activities in ${city}, India as a JSON array of strings.`;
  const cacheKey = `sight-suggestions:${normalizeCity(city)}`;
  const start = Date.now();
  try {
    const data = await generateJson<string[]>(system, prompt);
    if (Array.isArray(data) && data.length > 0) {
      const sights = data.map((s) => String(s).trim()).filter(Boolean);
      logActivity({
        category: "sight_suggestions",
        provider: "gemini",
        cacheKey,
        input: { city },
        output: { count: sights.length, sights },
        savedTo: "sights",
        durationMs: Date.now() - start,
        status: "success",
      });
      return sights;
    }
  } catch (err) {
    console.error("AI sight generation failed for", city, err);
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

/**
 * Return suggested sights for a city, seeding defaults and learning from memory.
 */
export async function getSuggestedSights(city: string): Promise<string[]> {
  ensureDefaults(city);
  const dbSights = getDbSights(city).map((r) => r.title);
  if (dbSights.length > 0) return dbSights;

  const aiSights = await generateWithAi(city);
  if (aiSights.length > 0) {
    const stmt = getDb().prepare(
      "INSERT OR IGNORE INTO sights (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const now = new Date().toISOString();
    for (const title of aiSights) {
      stmt.run(randomUUID(), title, normalizeCity(city), "en", now);
    }
    return aiSights;
  }

  return getDefaults(city);
}

/**
 * Add a sight to the city's suggestion list (called when user adds a custom visit).
 */


/**
 * Add a sight to the city's suggestion list (called when user adds a custom visit).
 */
export function addSuggestedSight(city: string, title: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO sights (id, title, city, lang, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), title.trim(), normalizeCity(city), "en", new Date().toISOString());
}

function languageName(lang: Lang): string {
  return lang === "fr" ? "French" : lang === "en" ? "English" : "German";
}

export function getCachedSightDescription(title: string, city: string, lang: Lang): string | undefined {
  const row = getDb()
    .prepare("SELECT description FROM sights WHERE title = ? AND city = ? AND lang = ?")
    .get(title, normalizeCity(city), lang) as { description: string | null } | undefined;
  return row?.description ?? undefined;
}

export function saveSightDescription(title: string, city: string, lang: Lang, description: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM sights WHERE title = ? AND city = ? AND lang = ?")
    .get(title, normalizeCity(city), lang) as { id: string } | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE sights SET description = ?, updated_at = ? WHERE id = ?")
      .run(description, new Date().toISOString(), existing.id);
  } else {
    getDb()
      .prepare("INSERT INTO sights (id, title, city, description, lang, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), title, normalizeCity(city), description, lang, new Date().toISOString());
  }
}

async function generateVisitDescription(title: string, city: string, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const system = "You are a luxury travel writer for the Indian subcontinent. Write rich, evocative descriptions.";
  const prompt = `Write a detailed paragraph of 4-6 sentences in ${languageName(lang)} for "${title}" in ${city}, India, suitable for a high-end travel itinerary. Describe the atmosphere, highlights, and why it is special. Return only the description, no labels.`;
  const cacheKey = `desc:${lang}:${city}:${title}`;
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

export async function ensureSightDescription(title: string, city: string, lang: Lang): Promise<string> {
  const cached = getCachedSightDescription(title, city, lang);
  if (cached?.trim()) {
    logActivity({
      category: "text",
      provider: "cache",
      cacheKey: `desc:${lang}:${city}:${title}`,
      input: { title, city, lang },
      output: { length: cached.length, preview: cached.slice(0, 200) },
      savedTo: "sights",
      status: "cached",
    });
    return cached;
  }
  const desc = await generateVisitDescription(title, city, lang);
  if (desc) saveSightDescription(title, city, lang, desc);
  return desc;
}

export interface LearnedSight {
  title: string;
  description: string;
  imageUrl?: string;
}

/**
 * Learn a custom sight: store it, generate a description, and fetch an image.
 * Safe to call multiple times — cached values are returned after the first run.
 */
export async function learnSight(title: string, city: string, lang: Lang): Promise<LearnedSight> {
  addSuggestedSight(city, title);
  const [description, image] = await Promise.all([
    ensureSightDescription(title, city, lang),
    getSightImage(title, city),
  ]);
  return {
    title: title.trim(),
    description,
    imageUrl: image?.url,
  };
}

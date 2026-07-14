import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db.server";
import type { Lang } from "@/lib/itinerary/types";
import { generateText } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";

function findCity(name: string, lang: Lang) {
  const row = getDb()
    .prepare("SELECT * FROM cities WHERE name = ? AND lang = ?")
    .get(name, lang) as {
      id: string;
      name: string;
      country: string | null;
      intro: string | null;
      lang: string;
      updated_at: string;
    } | undefined;
  return row;
}

function upsertCity(name: string, country: string | undefined, intro: string, lang: Lang) {
  const existing = getDb()
    .prepare("SELECT id FROM cities WHERE name = ? AND lang = ?")
    .get(name, lang) as { id: string } | undefined;

  if (existing) {
    getDb()
      .prepare("UPDATE cities SET intro = ?, updated_at = ? WHERE id = ?")
      .run(intro, new Date().toISOString(), existing.id);
  } else {
    getDb()
      .prepare(
        "INSERT INTO cities (id, name, country, intro, lang, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(randomUUID(), name, country ?? null, intro, lang, new Date().toISOString());
  }
}

/**
 * Return the city intro from the library, generating and caching it if missing.
 */
export async function ensureCityDescription(
  cityName: string,
  lang: Lang,
  country = "India"
): Promise<string> {
  const cached = findCity(cityName, lang);
  if (cached?.intro?.trim()) {
    logActivity({
      category: "text",
      provider: "cache",
      cacheKey: `city-intro:${lang}:${cityName}`,
      input: { cityName, lang, country },
      output: { length: cached.intro.length, preview: cached.intro.slice(0, 200) },
      savedTo: "cities",
      status: "cached",
    });
    return cached.intro;
  }

  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const prompt = `Write a short, evocative travel introduction in ${languageName} for the city of ${cityName}, ${country}.
It should be 2-3 sentences, suitable for a luxury travel itinerary, and capture the city's atmosphere and highlights.
Return only the text, no markdown, no labels.`;
  const cacheKey = `city-intro:${lang}:${cityName}`;
  const start = Date.now();

  try {
    const text = await generateText(
      "You are a luxury travel writer specializing in the Indian subcontinent.",
      prompt
    );
    const intro = text.trim();
    if (intro) {
      upsertCity(cityName, country, intro, lang);
      logActivity({
        category: "text",
        provider: "gemini",
        cacheKey,
        input: { cityName, lang, country, prompt },
        output: { length: intro.length, preview: intro.slice(0, 200) },
        savedTo: "cities",
        durationMs: Date.now() - start,
        status: "success",
      });
      return intro;
    }
  } catch (err) {
    console.error("Failed to generate city description for", cityName, err);
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { cityName, lang, country, prompt },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  return "";
}

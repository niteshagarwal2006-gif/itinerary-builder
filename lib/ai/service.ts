import "server-only";
import type { Itinerary, Lang } from "../itinerary/types";
import { collectFields, applyFields, type VerifyIssue } from "./fields";
import { AI_MODEL, getClient, parseJson, textOf } from "./client";

export type { VerifyIssue };

const LANG_NAME: Record<Lang, string> = {
  fr: "French",
  en: "English",
  de: "German",
};

/**
 * Translate an itinerary's free-text fields into `target`. Proper nouns
 * (places, hotels, client) are preserved. Returns a new itinerary with
 * `outputLanguage` set to the target. No-op when source === target.
 */
export async function translateItinerary(
  it: Itinerary,
  target: Lang
): Promise<Itinerary> {
  const source: Lang = it.outputLanguage ?? "fr";
  if (source === target) return { ...it, outputLanguage: target };

  const fields = collectFields(it);
  if (fields.length === 0) return { ...it, outputLanguage: target };

  const payload: Record<string, string> = {};
  for (const f of fields) payload[f.id] = f.text;

  const system =
    `You are an expert travel-copywriter and translator working on a luxury, ` +
    `bespoke travel itinerary. Translate each text value from ${LANG_NAME[source]} ` +
    `into ${LANG_NAME[target]}. Preserve the elegant, evocative tone of high-end ` +
    `travel writing. Keep proper nouns (place names, monuments, hotel names), ` +
    `numbers, distances, dates' day/month structure, and any codes unchanged where ` +
    `they would normally stay. Translate month and weekday names. Do NOT add, drop, ` +
    `or merge entries. Return ONLY a JSON object mapping each input id to its ` +
    `translated string — no commentary, no code fences.`;

  const msg = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
  });

  const map = parseJson<Record<string, string>>(textOf(msg));
  return { ...applyFields(it, map), outputLanguage: target };
}

/**
 * Proofread every free-text field in the itinerary's current output language
 * and return a list of grammar/spelling/typography issues.
 */
export async function verifyItinerary(it: Itinerary): Promise<VerifyIssue[]> {
  const lang: Lang = it.outputLanguage ?? "fr";
  const fields = collectFields(it);
  if (fields.length === 0) return [];

  const labelById = new Map(fields.map((f) => [f.id, f.label]));
  const textById = new Map(fields.map((f) => [f.id, f.text]));
  const payload: Record<string, string> = {};
  for (const f of fields) payload[f.id] = f.text;

  const system =
    `You are a meticulous professional proofreader of ${LANG_NAME[lang]}. ` +
    `Check each text value for spelling, grammar, gender/number agreement, ` +
    `accents/diacritics, punctuation and typography errors. Be precise and ` +
    `conservative: only report genuine errors, not stylistic preferences. ` +
    `Return ONLY a JSON array. Each element: ` +
    `{"id": <input id>, "severity": "error"|"warning", "message": <what is wrong, in English>, ` +
    `"suggestion": <the corrected full text>}. Omit fields that are correct. No code fences.`;

  const msg = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
  });

  const raw = parseJson<
    Array<{ id: string; severity?: string; message?: string; suggestion?: string }>
  >(textOf(msg));

  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && textById.has(r.id))
    .map((r) => ({
      id: r.id,
      label: labelById.get(r.id) ?? r.id,
      severity: r.severity === "warning" ? "warning" : "error",
      message: r.message ?? "Issue detected.",
      suggestion: r.suggestion ?? "",
      original: textById.get(r.id) ?? "",
    }));
}

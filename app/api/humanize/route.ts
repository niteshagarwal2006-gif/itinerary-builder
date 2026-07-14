import { NextRequest, NextResponse } from "next/server";
import { generateText, hasAiProvider } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";
import type { Itinerary, DayBlock, Lang } from "@/lib/itinerary/types";

export const runtime = "nodejs";

interface HumanizeRequest {
  itinerary: Itinerary;
}

interface DayRewrite {
  intro: string;
  closing: string;
}

function closingForDay(day: DayBlock, lang: Lang, hasDinner: boolean): string {
  if (lang === "fr") {
    return hasDinner ? "Dîner et nuit à l'hôtel." : "Nuit à l'hôtel.";
  }
  if (lang === "de") {
    return hasDinner ? "Abendessen und Übernachtung im Hotel." : "Übernachtung im Hotel.";
  }
  return hasDinner ? "Dinner and overnight at the hotel." : "Overnight at the hotel.";
}

function isArrivalDay(day: DayBlock, dayIndex: number): boolean {
  if (dayIndex === 0) return true;
  if (day.leg && /airport|aéroport|flughafen/i.test(day.leg.fromCity || "")) return true;
  return false;
}

function breakfastPhrase(day: DayBlock, dayIndex: number, lang: Lang): string | null {
  if (isArrivalDay(day, dayIndex)) return null;
  if (lang === "fr") return "Après le petit-déjeuner";
  if (lang === "de") return "Nach dem Frühstück";
  return "After breakfast";
}

function normalizeIntro(intro: string, day: DayBlock, dayIndex: number, lang: Lang, hasBreakfast: boolean): string {
  let text = intro.trim();
  const phrase = hasBreakfast ? breakfastPhrase(day, dayIndex, lang) : null;

  // Remove any existing incorrect breakfast phrase on arrival days
  if (!phrase) {
    const patterns = [
      /^After breakfast[,.]?\s*/i,
      /^Après le petit-déjeuner[,.]?\s*/i,
      /^Nach dem Frühstück[,.]?\s*/i,
    ];
    for (const p of patterns) text = text.replace(p, "");
    return text;
  }

  // Ensure non-arrival days with breakfast start with the breakfast phrase
  const alreadyStarts =
    text.toLowerCase().startsWith("after breakfast") ||
    text.toLowerCase().startsWith("après le petit-déjeuner") ||
    text.toLowerCase().startsWith("nach dem frühstück");

  if (!alreadyStarts) {
    text = `${phrase}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  // Remove redundant time words right after the breakfast phrase
  text = text
    .replace(/After breakfast,\s*this morning,/i, "After breakfast,")
    .replace(/Après le petit-déjeuner,\s*ce matin,/i, "Après le petit-déjeuner,")
    .replace(/Nach dem Frühstück,\s*am Morgen,/i, "Nach dem Frühstück,");

  return text;
}

function extractJsonObject<T>(text: string): T | null {
  // Try to find the first JSON object in the response (handles markdown fences)
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
  } catch {
    return null;
  }
}

function normalizeClosing(closing: string, day: DayBlock, lang: Lang, hasDinner: boolean): string {
  let text = closing.trim();

  // If the AI closing already conveys the right meal/overnight idea, keep it as-is
  const hasOvernight = /overnight|night|nuit|nacht|übernachtung/i.test(text);
  const hasDinnerWord = /dinner|dîner|abendessen/i.test(text);

  if (hasOvernight && (hasDinnerWord || !hasDinner)) {
    return text.endsWith(".") ? text : `${text}.`;
  }

  // Remove wrong fragments (e.g. "overnight" when dinner is included and should mention dinner)
  const wrongPatterns = hasDinner
    ? [/overnight at the hotel[.!?]?\s*$/i, /nuit à l'hôtel[.!?]?\s*$/i, /übernachtung im hotel[.!?]?\s*$/i]
    : [/dinner and overnight at the hotel[.!?]?\s*$/i, /dîner et nuit à l'hôtel[.!?]?\s*$/i, /abendessen und übernachtung[.!?]?\s*$/i];

  for (const p of wrongPatterns) text = text.replace(p, "").trim();

  text = text.replace(/[.!?]\s*$/, "").trim();
  if (!text) return closingForDay(day, lang, hasDinner);
  return `${text}. ${closingForDay(day, lang, hasDinner)}`;
}

export async function POST(req: NextRequest) {
  let body: HumanizeRequest;
  try {
    body = (await req.json()) as HumanizeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!hasAiProvider()) {
    return NextResponse.json(
      { error: "No AI provider configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to .env.local." },
      { status: 503 }
    );
  }

  const { itinerary } = body;
  const lang = itinerary.outputLanguage || "en";
  const languageName = lang === "fr" ? "French" : lang === "de" ? "German" : "English";
  const hasBreakfast = itinerary.mealPlan?.b ?? false;
  const hasDinner = itinerary.mealPlan?.d ?? false;

  const daysSummary = itinerary.days
    .map((d, i) => {
      const leg = d.leg ? `${d.leg.fromCity} → ${d.leg.toCity}` : "none";
      const sights = d.sights.map((s) => s.title).join(", ") || "none";
      const isArrival = isArrivalDay(d, i);
      return `Day ${i + 1}: ${d.title} | City: ${d.city} | Arrival/day-1: ${isArrival ? "yes" : "no"} | Leg: ${leg} | Sights: ${sights} | Current intro: ${d.intro || "(none)"}`;
    })
    .join("\n");

  const breakfastRule = hasBreakfast
    ? "2) For NON-ARRIVAL days only, begin the intro with the breakfast phrase ('After breakfast, ...' / 'Après le petit-déjeuner, ...' / 'Nach dem Frühstück, ...'). Never put a breakfast phrase on Day 1 or any arrival day."
    : "2) Do NOT mention breakfast.";

  const dinnerRule = hasDinner
    ? "3) End each day's closing with dinner and overnight at the hotel."
    : "3) End each day's closing with overnight at the hotel only (no dinner).";

  const system =
    "You are a senior luxury-travel writer. Rewrite each day's intro and closing so the itinerary feels warm, professional and human. " +
    "Return ONLY a valid JSON object: {\"days\":[{\"intro\":\"...\",\"closing\":\"...\"}, ...]}. " +
    "Rules: " +
    "1) If the day involves travel from one city to another, mention the direction naturally (e.g. 'In the morning we leave Delhi for Agra'). " +
    `${breakfastRule} ` +
    `${dinnerRule} ` +
    "4) Keep intros to one flowing paragraph (3-5 sentences) and closings to one sentence.";

  const prompt = `Rewrite these day intros and closings in ${languageName}:\n${daysSummary}`;
  const cacheKey = `humanize:${lang}:${itinerary.days.map((d) => d.city).join("-")}`;
  const start = Date.now();

  try {
    const raw = await generateText(system, prompt);
    const parsed = extractJsonObject<{ days?: DayRewrite[] }>(raw);
    const rewritten = parsed && Array.isArray(parsed.days) ? parsed.days : [];

    const days: DayBlock[] = itinerary.days.map((d, i) => {
      const rawIntro = rewritten[i]?.intro?.trim() || d.intro || "";
      const rawClosing = rewritten[i]?.closing?.trim() || "";
      return {
        ...d,
        intro: normalizeIntro(rawIntro, d, i, lang, hasBreakfast),
        closing: rawClosing ? normalizeClosing(rawClosing, d, lang, hasDinner) : closingForDay(d, lang, hasDinner),
      };
    });

    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { dayCount: itinerary.days.length, lang },
      output: { dayCount: days.length },
      durationMs: Date.now() - start,
      status: "success",
    });

    return NextResponse.json({ itinerary: { ...itinerary, days } });
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { dayCount: itinerary.days.length, lang },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Could not humanize the itinerary." }, { status: 500 });
  }
}

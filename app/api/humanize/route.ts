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
      return `Day ${i + 1}: ${d.title} | City: ${d.city} | Leg: ${leg} | Sights: ${sights} | Current intro: ${d.intro || "(none)"}`;
    })
    .join("\n");

  const system =
    "You are a senior luxury-travel writer. Rewrite each day's intro and closing so the itinerary feels warm, professional and human. " +
    "Return ONLY a valid JSON object: {\"days\":[{\"intro\":\"...\",\"closing\":\"...\"}, ...]}. " +
    "Rules: " +
    "1) If the day involves travel from one city to another, mention the direction naturally (e.g. 'In the morning we leave Delhi for Agra'). " +
    `${hasBreakfast ? "2) Start non-arrival days with 'After breakfast, proceed to...' or similar. " : ""}` +
    `${hasDinner ? "3) End the day with dinner and overnight at the hotel. " : "3) End the day with overnight at the hotel (no dinner). "}` +
    "4) Keep intros concise (2-4 sentences) and closings to one sentence.";

  const prompt = `Rewrite these day intros and closings in ${languageName}:\n${daysSummary}`;
  const cacheKey = `humanize:${lang}:${itinerary.days.map((d) => d.city).join("-")}`;
  const start = Date.now();

  try {
    const raw = await generateText(system, prompt);
    const parsed = JSON.parse(raw) as { days?: DayRewrite[] };
    const rewritten = Array.isArray(parsed.days) ? parsed.days : [];

    const days: DayBlock[] = itinerary.days.map((d, i) => ({
      ...d,
      intro: rewritten[i]?.intro?.trim() || d.intro,
      closing: rewritten[i]?.closing?.trim() || closingForDay(d, lang, hasDinner),
    }));

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

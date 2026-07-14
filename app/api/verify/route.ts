import { NextRequest, NextResponse } from "next/server";
import { generateText, hasAiProvider } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";
import { checkSightOnDate } from "@/lib/closureDays";
import type { Itinerary, Lang } from "@/lib/itinerary/types";

interface ReviewNote {
  type: "warning" | "info" | "ok";
  scope: string;
  message: string;
}

export const runtime = "nodejs";

interface VerifyRequest {
  itinerary: Itinerary;
}

function parseIso(date?: string): string | undefined {
  if (!date) return undefined;
  // The itinerary stores display dates like "14-07-2027"; convert to ISO.
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export async function POST(req: NextRequest) {
  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { itinerary } = body;
  const notes: ReviewNote[] = [];
  const lang: Lang = itinerary.outputLanguage || "en";

  // 1. Monument closure checks
  for (const day of itinerary.days) {
    const iso = parseIso(day.date);
    if (!iso) continue;
    for (const sight of day.sights) {
      const check = await checkSightOnDate(sight.title, iso, day.city, lang);
      if (check.closed) {
        notes.push({
          type: "warning",
          scope: day.dayLabel,
          message: `${sight.title} is closed on ${check.dayName}s (${day.date}). ${check.note ?? ""}`.trim(),
        });
      }
    }
  }

  // 2. Basic logistics / missing data
  for (let i = 0; i < itinerary.days.length; i++) {
    const d = itinerary.days[i];
    if (!d.hotel?.name) {
      notes.push({
        type: "info",
        scope: d.dayLabel,
        message: `No hotel selected for ${d.city}.`,
      });
    }
    if (d.sights.length === 0 && d.activities.length === 0) {
      notes.push({
        type: "info",
        scope: d.dayLabel,
        message: `No visits or experiences scheduled in ${d.city}.`,
      });
    }
    if (i > 0 && d.city === itinerary.days[i - 1]?.city && d.leg) {
      notes.push({
        type: "info",
        scope: d.dayLabel,
        message: `Same-city leg present; verify it is intentional.`,
      });
    }
  }

  // 3. AI review for logistics, festivals and flow
  if (hasAiProvider()) {
    const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
    const daysSummary = itinerary.days
      .map((d) => `${d.dayLabel}: ${d.date || "no date"} — ${d.title} — ${d.city} — ${d.sights.map((s) => s.title).join(", ") || "no sights"}`)
      .join("\n");

    const system =
      "You are a senior India travel expert reviewing an itinerary. " +
      "Return ONLY a valid JSON array of up to 6 notes. Each note: {\"type\":\"warning\"|\"info\"|\"ok\",\"scope\":\"JOUR N or Overall\",\"message\":\"concise text\"}. " +
      "Flag unrealistic distances, missing must-sees, repeated sights, backtracking, major festivals or events on the given dates, and flow issues. " +
      "Include one ok note if routing looks solid.";
    const prompt = `Review this itinerary in ${languageName}:\n${daysSummary}`;
    const cacheKey = `verify:${lang}:${itinerary.days.map((d) => d.city).join("-")}`;
    const start = Date.now();

    try {
      const raw = await generateText(system, prompt);
      const aiNotes = JSON.parse(raw) as ReviewNote[];
      if (Array.isArray(aiNotes)) {
        notes.push(...aiNotes.filter((n) => n && n.type && n.scope && n.message));
      }
      logActivity({
        category: "review",
        provider: "gemini",
        cacheKey,
        input: { dayCount: itinerary.days.length, lang },
        output: { noteCount: aiNotes.length },
        durationMs: Date.now() - start,
        status: "success",
      });
    } catch (err) {
      logActivity({
        category: "review",
        provider: "gemini",
        cacheKey,
        input: { dayCount: itinerary.days.length, lang },
        durationMs: Date.now() - start,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ notes });
}

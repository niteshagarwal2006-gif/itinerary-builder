import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/gemini";
import type { Lang } from "@/lib/itinerary/types";

export const runtime = "nodejs";

interface SuggestRouteInput {
  start: string;
  end: string;
  nights: number;
  lang?: Lang;
}

interface SuggestRouteOutput {
  cities: string[];
}

export async function POST(req: NextRequest) {
  let input: SuggestRouteInput;
  try {
    input = (await req.json()) as SuggestRouteInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { start, end, nights } = input;
  const lang = input.lang ?? "en";

  if (!start?.trim() || !end?.trim()) {
    return NextResponse.json({ error: "Start and end cities are required." }, { status: 400 });
  }
  if (!nights || nights < 1 || nights > 60) {
    return NextResponse.json({ error: "Total nights must be between 1 and 60." }, { status: 400 });
  }

  const languageName = lang === "fr" ? "French" : lang === "de" ? "German" : "English";

  const system =
    "You are an expert India travel planner. Suggest a logical, scenic road-route between two Indian cities. " +
    "Return ONLY a JSON object with a single key `cities` containing an ordered array of city names (strings). " +
    "Include the start and end cities. Choose intermediate cities that make sense for a tourist itinerary. " +
    "Do not add commentary or markdown.";

  const prompt =
    `Plan a ${nights}-night India tour starting in ${start} and ending in ${end}. ` +
    `Suggest 2 to 6 cities total including ${start} and ${end}, in travel order. ` +
    `Return the result as JSON like {"cities":["${start}",...,"${end}"]}. City names only, in ${languageName}.`;

  try {
    const data = await generateJson<SuggestRouteOutput>(system, prompt);
    const cities = data.cities
      ?.map((c) => c.trim())
      .filter(Boolean)
      .map((c) => c.replace(/^\d+\.\s*/, ""));

    if (!cities || cities.length < 2) {
      return NextResponse.json({ error: "AI returned an invalid route." }, { status: 502 });
    }

    // Ensure first and last match the requested start/end (case-insensitive).
    if (cities[0].toLowerCase() !== start.toLowerCase()) cities.unshift(start);
    if (cities[cities.length - 1].toLowerCase() !== end.toLowerCase()) cities.push(end);

    return NextResponse.json({ cities });
  } catch (err) {
    console.error("suggest-route failed", err);
    const message = err instanceof Error ? err.message : "Failed to suggest route.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

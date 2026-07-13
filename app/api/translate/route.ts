import { NextRequest, NextResponse } from "next/server";
import { translateItinerary } from "@/lib/ai/service";
import { MissingApiKeyError } from "@/lib/ai/client";
import type { Itinerary, Lang } from "@/lib/itinerary/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const LANGS = new Set<Lang>(["fr", "en", "de"]);

export async function POST(req: NextRequest) {
  let body: { itinerary?: Itinerary; target?: Lang };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { itinerary, target } = body;
  if (!itinerary || !Array.isArray(itinerary.days)) {
    return NextResponse.json({ error: "Missing itinerary." }, { status: 400 });
  }
  if (!target || !LANGS.has(target)) {
    return NextResponse.json({ error: "Invalid target language." }, { status: 400 });
  }

  try {
    const translated = await translateItinerary(itinerary, target);
    return NextResponse.json({ itinerary: translated });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "Translation needs an Anthropic API key. Set it in the app menu (Claude API Key…) or ANTHROPIC_API_KEY in .env.local." },
        { status: 503 }
      );
    }
    console.error("translate failed", err);
    return NextResponse.json({ error: "Translation failed. Please try again." }, { status: 500 });
  }
}

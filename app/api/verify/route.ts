import { NextRequest, NextResponse } from "next/server";
import { verifyItinerary } from "@/lib/ai/service";
import { MissingApiKeyError } from "@/lib/ai/client";
import type { Itinerary } from "@/lib/itinerary/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { itinerary?: Itinerary };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.itinerary || !Array.isArray(body.itinerary.days)) {
    return NextResponse.json({ error: "Missing itinerary." }, { status: 400 });
  }

  try {
    const issues = await verifyItinerary(body.itinerary);
    return NextResponse.json({ issues });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "Verification needs an Anthropic API key. Set it in the app menu (Claude API Key…) or ANTHROPIC_API_KEY in .env.local." },
        { status: 503 }
      );
    }
    console.error("verify failed", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}

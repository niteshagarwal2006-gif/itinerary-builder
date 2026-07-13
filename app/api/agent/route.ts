import { NextRequest, NextResponse } from "next/server";
import { buildItinerary, AgentTripInput } from "@/lib/agent/itineraryAgent";
import { MissingAiProviderError } from "@/lib/ai/gemini";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let input: AgentTripInput;
  try {
    input = (await req.json()) as AgentTripInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Basic validation
  if (!input.client?.trim()) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }
  if (!input.startCity?.trim() || !input.endCity?.trim()) {
    return NextResponse.json({ error: "Start and end cities are required." }, { status: 400 });
  }
  if (!input.totalNights || input.totalNights < 1 || input.totalNights > 60) {
    return NextResponse.json({ error: "Total nights must be between 1 and 60." }, { status: 400 });
  }
  if (!input.arrivalDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.arrivalDate)) {
    return NextResponse.json({ error: "Arrival date must be a valid YYYY-MM-DD date." }, { status: 400 });
  }

  const validStyles = ["culture", "nature", "luxury", "family", "adventure", "romantic"];
  if (!validStyles.includes(input.style)) {
    return NextResponse.json({ error: "Invalid travel style." }, { status: 400 });
  }

  const validBudgets = ["standard", "premium", "luxury"];
  if (!validBudgets.includes(input.budget)) {
    return NextResponse.json({ error: "Invalid budget tier." }, { status: 400 });
  }

  try {
    const { itinerary } = await buildItinerary(input);
    return NextResponse.json({ itinerary });
  } catch (err) {
    console.error("Agent build failed", err);
    if (err instanceof MissingAiProviderError) {
      return NextResponse.json(
        { error: "No AI provider configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to your .env.local file." },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to build itinerary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

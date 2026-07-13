import { NextRequest, NextResponse } from "next/server";
import { recordFeedback } from "@/lib/memory";

export const runtime = "nodejs";

interface FeedbackInput {
  text: string;
  context?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  let input: FeedbackInput;
  try {
    input = (await req.json()) as FeedbackInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = input.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Feedback text is required." }, { status: 400 });
  }

  try {
    recordFeedback(text, input.context ?? {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("feedback save failed", err);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}

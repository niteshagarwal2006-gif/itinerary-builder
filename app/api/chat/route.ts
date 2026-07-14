import { NextRequest, NextResponse } from "next/server";
import { generateText, hasAiProvider } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";

export const runtime = "nodejs";

interface ChatRequest {
  messages: { role: "user" | "assistant"; text: string }[];
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!hasAiProvider()) {
    return NextResponse.json(
      { error: "No AI provider configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to .env.local." },
      { status: 503 }
    );
  }

  const history = (body.messages || [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const system =
    "You are a friendly, expert India travel itinerary assistant. " +
    "Answer questions about Indian destinations, monuments, culture, hotels, routes, weather, visas, and travel tips. " +
    "Keep replies concise (2-4 sentences) and helpful. If you don't know something, say so honestly.";
  const prompt = history ? `${history}\nAssistant:` : "Hello!";
  const cacheKey = `chat:${Date.now()}`;
  const start = Date.now();

  try {
    const text = await generateText(system, prompt);
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { messageCount: body.messages.length },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { messageCount: body.messages.length },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Could not generate a reply." }, { status: 500 });
  }
}

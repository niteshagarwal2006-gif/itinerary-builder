import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db.server";
import { generateText, hasAiProvider } from "@/lib/ai/gemini";

export const runtime = "nodejs";

function normalizeCity(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function findCached(city: string, name: string): string | undefined {
  const row = getDb()
    .prepare("SELECT url FROM hotels WHERE city = ? AND name = ?")
    .get(normalizeCity(city), name.trim()) as { url: string | null } | undefined;
  return row?.url ?? undefined;
}

function saveHotel(city: string, name: string, url: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM hotels WHERE city = ? AND name = ?")
    .get(normalizeCity(city), name.trim()) as { id: string } | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE hotels SET url = ?, updated_at = ? WHERE id = ?")
      .run(url, new Date().toISOString(), existing.id);
  } else {
    getDb()
      .prepare("INSERT INTO hotels (id, name, city, url, lang, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), name.trim(), normalizeCity(city), url, "en", new Date().toISOString());
  }
}

async function fetchUrlWithAi(city: string, name: string): Promise<string | undefined> {
  if (!hasAiProvider()) return undefined;
  const system =
    "You are a travel data assistant. Given a hotel name and city, return ONLY the official hotel website URL. " +
    "If unsure, return a Google search URL. Return only the URL, no explanation.";
  const prompt = `What is the official website URL for the hotel "${name}" in ${city}, India?`;
  try {
    const raw = await generateText(system, prompt);
    const url = raw.trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      return url;
    }
  } catch (err) {
    console.error("Hotel URL AI fetch failed", err);
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  const name = req.nextUrl.searchParams.get("name");

  if (!city?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "City and hotel name are required." }, { status: 400 });
  }

  const cached = findCached(city, name);
  if (cached) {
    return NextResponse.json({ city, name, url: cached, source: "cache" });
  }

  const url = await fetchUrlWithAi(city, name);
  if (url) {
    saveHotel(city, name, url);
    return NextResponse.json({ city, name, url, source: "ai" });
  }

  return NextResponse.json({ city, name, url: null, source: "none" }, { status: 503 });
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  listEntries,
  upsertEntry,
  deleteEntry,
} from "@/lib/library.server";
import type { LibType, LibEntry } from "@/lib/library-types";
import type { Lang } from "@/lib/itinerary/types";

export const runtime = "nodejs";

const TYPES = new Set<LibType>(["hotels", "sights", "activities", "cities"]);
const isType = (t: unknown): t is LibType =>
  typeof t === "string" && TYPES.has(t as LibType);
const asLang = (s: string | null): Lang | undefined => {
  if (s === "fr" || s === "en" || s === "de") return s;
  return undefined;
};

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const lang = asLang(req.nextUrl.searchParams.get("lang"));
  const city = req.nextUrl.searchParams.get("city") ?? undefined;
  if (!isType(type)) {
    return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: listEntries(type, q, lang, city) });
  } catch (err) {
    console.error("library list failed", err);
    return NextResponse.json({ error: "Could not read the library." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { type?: unknown; entry?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { type, entry } = body;
  if (!isType(type)) {
    return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  }
  if (!entry || typeof entry !== "object") {
    return NextResponse.json({ error: "Missing entry." }, { status: 400 });
  }

  // Primary label: name for hotels/cities, title for sights/activities.
  const labelKey = type === "hotels" || type === "cities" ? "name" : "title";
  const label = entry[labelKey];
  if (typeof label !== "string" || !label.trim()) {
    return NextResponse.json(
      { error: `A ${labelKey} is required.` },
      { status: 400 }
    );
  }

  const normalized = {
    ...entry,
    id: typeof entry.id === "string" && entry.id ? entry.id : randomUUID(),
    lang: entry.lang === "en" || entry.lang === "de" ? entry.lang : "fr",
  } as unknown as LibEntry;

  try {
    upsertEntry(type, normalized);
    return NextResponse.json({ ok: true, entry: normalized });
  } catch (err) {
    console.error("library upsert failed", err);
    return NextResponse.json({ error: "Could not save to the library." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");
  if (!isType(type)) {
    return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  try {
    deleteEntry(type, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("library delete failed", err);
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
}

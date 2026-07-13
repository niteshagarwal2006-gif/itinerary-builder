import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

interface PhotoEntry {
  src: string;
  title: string;
  city: string | null;
}

/** Fold accents so "Pondichéry" matches "Pondicherry". */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Photo library index for the wizard's image chooser.
 * GET /api/photos            → all photos
 * GET /api/photos?city=Agra  → photos of that city + generic (city-less) ones
 */
export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city")?.trim();
  try {
    const p = path.join(process.cwd(), "public", "library-images", "photos.json");
    const all = JSON.parse(await readFile(p, "utf8")) as PhotoEntry[];
    if (!city) return NextResponse.json({ photos: all });
    const want = fold(city);
    const photos = all.filter((e) => {
      if (!e.city) return true; // generic photos fit any city
      const have = fold(e.city);
      return have.includes(want) || want.includes(have);
    });
    // City-specific photos first, generic ones after
    photos.sort((a, b) => Number(!a.city) - Number(!b.city));
    return NextResponse.json({ photos });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}

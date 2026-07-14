import { NextRequest, NextResponse } from "next/server";
import { getSuggestedSights, learnSight } from "@/lib/citySights";
import type { Lang } from "@/lib/itinerary/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  if (!city?.trim()) {
    return NextResponse.json({ error: "City is required." }, { status: 400 });
  }

  try {
    const sights = await getSuggestedSights(city);
    return NextResponse.json({ city, sights });
  } catch (err) {
    console.error("sights API failed", err);
    return NextResponse.json({ error: "Could not load sights." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { city?: string; title?: string; lang?: Lang };
    const city = body.city?.trim();
    const title = body.title?.trim();
    const lang = body.lang ?? "en";
    if (!city || !title) {
      return NextResponse.json({ error: "City and title are required." }, { status: 400 });
    }
    const result = await learnSight(title, city, lang);
    return NextResponse.json(result);
  } catch (err) {
    console.error("learn sight failed", err);
    return NextResponse.json({ error: "Could not learn sight." }, { status: 500 });
  }
}

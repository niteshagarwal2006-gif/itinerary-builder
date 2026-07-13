import { NextRequest, NextResponse } from "next/server";
import { getSuggestedSights } from "@/lib/citySights";

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

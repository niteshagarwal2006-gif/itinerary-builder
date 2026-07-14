import { NextRequest, NextResponse } from "next/server";
import { getSuggestedActivities } from "@/lib/cityActivities";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  if (!city?.trim()) {
    return NextResponse.json({ error: "City is required." }, { status: 400 });
  }

  try {
    const activities = await getSuggestedActivities(city);
    return NextResponse.json({ city, activities });
  } catch (err) {
    console.error("activities API failed", err);
    return NextResponse.json({ error: "Could not load activities." }, { status: 500 });
  }
}

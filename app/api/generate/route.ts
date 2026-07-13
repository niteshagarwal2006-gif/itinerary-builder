import { NextRequest, NextResponse } from "next/server";
import { generateItineraryDocx } from "@/lib/itinerary/generateDocx";
import { createServerImageResolver } from "@/lib/itinerary/serverImages";
import type { Itinerary } from "@/lib/itinerary/types";

export const runtime = "nodejs";

function filename(preparedFor: string): string {
  const slug = (preparedFor || "itineraire")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "itineraire";
  return `Itineraire_${slug}.docx`;
}

export async function POST(req: NextRequest) {
  let itinerary: Itinerary;
  try {
    itinerary = (await req.json()) as Itinerary;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!itinerary || typeof itinerary.preparedFor !== "string" || !Array.isArray(itinerary.days)) {
    return NextResponse.json({ error: "Missing required itinerary fields." }, { status: 400 });
  }

  try {
    const buf = await generateItineraryDocx(itinerary, createServerImageResolver());
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename(itinerary.preparedFor)}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (err) {
    console.error("docx generation failed", err);
    return NextResponse.json({ error: "Failed to generate document." }, { status: 500 });
  }
}

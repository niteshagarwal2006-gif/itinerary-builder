import { NextRequest, NextResponse } from "next/server";
import { recentActivity } from "@/lib/ai/log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const rows = recentActivity(limit);
  return NextResponse.json({ count: rows.length, activity: rows });
}

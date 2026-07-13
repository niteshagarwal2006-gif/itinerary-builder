import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/itinerary/serverImages";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

/**
 * Serves uploaded images from UPLOAD_DIR. In dev, files under public/uploads
 * are served statically and never reach this route; in the packaged desktop
 * app uploads live in the OS userData folder, so this route serves them.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const safe = path.basename(name);
  const ext = path.extname(safe).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, safe));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

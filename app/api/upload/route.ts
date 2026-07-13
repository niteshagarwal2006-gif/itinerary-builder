import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { imageSize } from "image-size";
import { UPLOAD_DIR } from "@/lib/itinerary/serverImages";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// Word (docx) supports these raster types. webp/svg/heic are intentionally
// rejected so an unsupported image never gets silently dropped from the doc.
const EXT_BY_TYPE: Record<string, string> = {
  jpg: "jpg",
  png: "png",
  gif: "gif",
  bmp: "bmp",
};

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 20 MB)." },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let dim;
  try {
    dim = imageSize(bytes);
  } catch {
    return NextResponse.json({ error: "Unreadable image file." }, { status: 400 });
  }

  const normType = dim.type === "jpeg" ? "jpg" : dim.type;
  const ext = normType ? EXT_BY_TYPE[normType] : undefined;
  if (!ext || !dim.width || !dim.height) {
    return NextResponse.json(
      {
        error:
          "Unsupported format for Word. Use JPG, PNG, GIF or BMP (WebP is not accepted).",
      },
      { status: 415 }
    );
  }

  const filename = `${randomUUID()}.${ext}`;
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), bytes);
  } catch (err) {
    console.error("upload write failed", err);
    return NextResponse.json({ error: "Failed to save the file." }, { status: 500 });
  }

  return NextResponse.json({
    uploadId: filename,
    url: `/uploads/${filename}`,
    width: dim.width,
    height: dim.height,
  });
}

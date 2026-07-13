import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import type { ImageRef } from "./types";
import type { ImageResolver, ResolvedImage } from "./generateDocx";

/** Writable uploads dir — overridable so the desktop app can use userData. */
export const UPLOAD_DIR =
  process.env.ITB_UPLOADS_DIR ?? path.join(process.cwd(), "public", "uploads");
const PUBLIC_DIR = process.env.ITB_PUBLIC_DIR ?? path.join(process.cwd(), "public");

const DOCX_TYPES = new Set(["png", "jpg", "gif", "bmp"]);

function toDocxType(t?: string): ResolvedImage["type"] | null {
  if (!t) return null;
  const norm = t === "jpeg" ? "jpg" : t;
  return DOCX_TYPES.has(norm) ? (norm as ResolvedImage["type"]) : null;
}

function measure(bytes: Uint8Array): ResolvedImage | null {
  try {
    const dim = imageSize(bytes);
    const type = toDocxType(dim.type);
    if (!type || !dim.width || !dim.height) return null;
    return { data: bytes, width: dim.width, height: dim.height, type };
  } catch {
    return null;
  }
}

async function fromUrl(url: string): Promise<ResolvedImage | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return measure(bytes);
  } catch {
    return null;
  }
}

async function fromUpload(uploadId: string): Promise<ResolvedImage | null> {
  try {
    const safe = path.basename(uploadId);
    const buf = await readFile(path.join(UPLOAD_DIR, safe));
    return measure(new Uint8Array(buf));
  } catch {
    return null;
  }
}

/** Resolve a public-relative path like "/library-images/agra_1.jpeg" */
async function fromPublicPath(src: string): Promise<ResolvedImage | null> {
  try {
    // Guard against path traversal
    const resolved = path.resolve(PUBLIC_DIR, src.replace(/^\//, ""));
    if (!resolved.startsWith(PUBLIC_DIR)) return null;
    const buf = await readFile(resolved);
    return measure(new Uint8Array(buf));
  } catch {
    return null;
  }
}

/** Resolver that handles: uploadId, url, and the `src` public-path field used by library images. */
export function createServerImageResolver(): ImageResolver {
  const cache = new Map<string, Promise<ResolvedImage | null>>();
  return async (ref: ImageRef) => {
    // Cast to access the `src` field that library entries store
    const src = (ref as unknown as { src?: string }).src;
    const key = ref.uploadId ? `u:${ref.uploadId}` : ref.url ? `w:${ref.url}` : src ? `p:${src}` : "";
    if (!key) return null;
    if (!cache.has(key)) {
      if (ref.uploadId) {
        cache.set(key, fromUpload(ref.uploadId));
      } else if (ref.url) {
        cache.set(key, fromUrl(ref.url));
      } else if (src) {
        cache.set(key, fromPublicPath(src));
      }
    }
    return cache.get(key)!;
  };
}

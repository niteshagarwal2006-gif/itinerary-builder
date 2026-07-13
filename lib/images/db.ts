import "server-only";
import { getDb } from "@/lib/db.server";
import type { ImageRef } from "@/lib/itinerary/types";

export interface GeneratedImageRecord {
  id: string;
  type: string;
  key: string;
  source: "ai" | "web" | "library";
  url: string | null;
  localPath: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function parseMetadata(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function findGeneratedImage(type: string, key: string): GeneratedImageRecord | undefined {
  const row = getDb()
    .prepare("SELECT * FROM generated_images WHERE type = ? AND key = ?")
    .get(type, key) as {
      id: string;
      type: string;
      key: string;
      source: string;
      url: string | null;
      local_path: string | null;
      metadata: string | null;
      created_at: string;
    } | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    type: row.type,
    key: row.key,
    source: row.source as GeneratedImageRecord["source"],
    url: row.url,
    localPath: row.local_path,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

export function saveGeneratedImage(
  type: string,
  key: string,
  source: GeneratedImageRecord["source"],
  url: string | null,
  localPath: string | null,
  metadata: Record<string, unknown> | null = null
): void {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO generated_images (id, type, key, source, url, local_path, metadata, created_at)
       VALUES (@id, @type, @key, @source, @url, @localPath, @metadata, @createdAt)
       ON CONFLICT(type, key) DO UPDATE SET
         source = @source,
         url = @url,
         local_path = @localPath,
         metadata = @metadata,
         created_at = @createdAt`
    )
    .run({
      id,
      type,
      key,
      source,
      url,
      localPath,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date().toISOString(),
    });
}

export function toImageRef(record: GeneratedImageRecord): ImageRef {
  if (record.localPath) {
    return { url: `/${record.localPath}`, caption: record.metadata?.caption as string | undefined };
  }
  return { url: record.url ?? undefined, caption: record.metadata?.caption as string | undefined };
}

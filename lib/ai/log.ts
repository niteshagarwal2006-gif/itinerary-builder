import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db.server";

export type AiActivityCategory =
  | "text"
  | "image"
  | "geocode"
  | "distance"
  | "hotel_url"
  | "sight_suggestions"
  | "route_suggestion"
  | "translate"
  | "verify"
  | "review";

export type AiProvider =
  | "gemini"
  | "openrouter"
  | "anthropic"
  | "nominatim"
  | "osrm"
  | "pexels"
  | "web"
  | "cache";

export interface AiActivityRecord {
  id: string;
  category: AiActivityCategory;
  provider?: AiProvider;
  cacheKey: string;
  inputHash?: string;
  inputSummary: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  savedTo?: string;
  durationMs?: number;
  status: "success" | "error" | "cached";
  errorMessage?: string;
  createdAt: string;
}

export interface LogActivityOptions {
  category: AiActivityCategory;
  provider?: AiProvider;
  cacheKey: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | string | number | boolean | null;
  savedTo?: string;
  durationMs?: number;
  status?: "success" | "error" | "cached";
  errorMessage?: string;
}

function hashInput(input: Record<string, unknown>): string {
  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function safeSummary(value: unknown, maxLength = 2000): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const truncated = value.length > maxLength ? value.slice(0, maxLength) + "…" : value;
    return { text: truncated };
  }
  if (typeof value === "number" || typeof value === "boolean") return { value };
  if (Array.isArray(value)) {
    return { count: value.length, preview: value.slice(0, 5) };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).slice(0, 20)) {
      const v = obj[key];
      if (typeof v === "string" && v.length > 300) {
        out[key] = v.slice(0, 300) + "…";
      } else if (typeof v === "object" && v !== null) {
        out[key] = "<object>";
      } else {
        out[key] = v;
      }
    }
    return out;
  }
  return { value: String(value) };
}

/**
 * Log an AI or external generation activity.
 * Call this after a successful (or failed) generation so there is an audit trail.
 */
export function logActivity(opts: LogActivityOptions): void {
  try {
    const outputSummary = safeSummary(opts.output) ?? undefined;
    const inputSummary = safeSummary(opts.input) ?? {};
    getDb()
      .prepare(
        `INSERT INTO ai_activity_log
         (id, category, provider, cache_key, input_hash, input_summary, output_summary, saved_to, duration_ms, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        opts.category,
        opts.provider ?? null,
        opts.cacheKey,
        hashInput(opts.input),
        JSON.stringify(inputSummary),
        outputSummary ? JSON.stringify(outputSummary) : null,
        opts.savedTo ?? null,
        opts.durationMs ?? null,
        opts.status ?? "success",
        opts.errorMessage ?? null,
        new Date().toISOString()
      );
  } catch (err) {
    console.error("[ai-log] failed to record activity", err);
  }
}

/**
 * Find a recent successful activity with the same cache key.
 * Returns the stored output summary if found, so callers can skip regeneration.
 */
export function findCachedActivity(
  category: AiActivityCategory,
  cacheKey: string
): AiActivityRecord | undefined {
  try {
    const row = getDb()
      .prepare(
        `SELECT id, category, provider, cache_key AS cacheKey, input_hash AS inputHash,
                input_summary AS inputSummary, output_summary AS outputSummary, saved_to AS savedTo,
                duration_ms AS durationMs, status, error_message AS errorMessage, created_at AS createdAt
         FROM ai_activity_log
         WHERE category = ? AND cache_key = ? AND status = 'success'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(category, cacheKey) as {
        id: string;
        category: AiActivityCategory;
        provider?: AiProvider;
        cacheKey: string;
        inputHash?: string;
        inputSummary: string;
        outputSummary: string | null;
        savedTo?: string;
        durationMs?: number;
        status: "success" | "error" | "cached";
        errorMessage?: string;
        createdAt: string;
      } | undefined;

    if (!row) return undefined;
    return {
      ...row,
      inputSummary: JSON.parse(row.inputSummary) as Record<string, unknown>,
      outputSummary: row.outputSummary
        ? (JSON.parse(row.outputSummary) as Record<string, unknown>)
        : undefined,
    };
  } catch (err) {
    console.error("[ai-log] failed to find cached activity", err);
    return undefined;
  }
}

interface WithLogOptions<T> {
  category: AiActivityCategory;
  provider?: AiProvider;
  /** Build a deterministic cache key from the input. */
  cacheKey: string;
  /** Input to log and hash. */
  input: Record<string, unknown>;
  /** Where the result is saved, e.g. "sights:delhi:taj_mahal" or "public/uploads/generated/sight/...". */
  savedTo?: (result: T) => string | undefined;
  /** Run the actual AI/generation work. */
  work: () => Promise<T>;
  /** Convert the result into a loggable output summary. */
  toOutput?: (result: T) => Record<string, unknown> | string | number | boolean | null;
}

/**
 * Run a generation with logging and optional deduplication.
 * If a successful log already exists for the cache key, the work is still run
 * (the existing caches/tables already short-circuit), but the activity is logged
 * as 'cached' so you can see it was reused.
 */
export async function withAiLog<T>(opts: WithLogOptions<T>): Promise<T> {
  const start = Date.now();
  const previous = findCachedActivity(opts.category, opts.cacheKey);
  const status: "success" | "cached" = previous ? "cached" : "success";

  try {
    const result = await opts.work();
    const durationMs = Date.now() - start;
    logActivity({
      category: opts.category,
      provider: opts.provider,
      cacheKey: opts.cacheKey,
      input: opts.input,
      output: opts.toOutput ? opts.toOutput(result) : safeSummary(result),
      savedTo: opts.savedTo?.(result),
      durationMs,
      status,
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    logActivity({
      category: opts.category,
      provider: opts.provider,
      cacheKey: opts.cacheKey,
      input: opts.input,
      durationMs,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Return recent activity rows for display/debugging. */
export function recentActivity(limit = 100): AiActivityRecord[] {
  try {
    const rows = getDb()
      .prepare(
        `SELECT id, category, provider, cache_key AS cacheKey, input_hash AS inputHash,
                input_summary AS inputSummary, output_summary AS outputSummary, saved_to AS savedTo,
                duration_ms AS durationMs, status, error_message AS errorMessage, created_at AS createdAt
         FROM ai_activity_log
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as {
        id: string;
        category: AiActivityCategory;
        provider?: AiProvider;
        cacheKey: string;
        inputHash?: string;
        inputSummary: string;
        outputSummary: string | null;
        savedTo?: string;
        durationMs?: number;
        status: "success" | "error" | "cached";
        errorMessage?: string;
        createdAt: string;
      }[];

    return rows.map((r) => ({
      ...r,
      inputSummary: JSON.parse(r.inputSummary) as Record<string, unknown>,
      outputSummary: r.outputSummary
        ? (JSON.parse(r.outputSummary) as Record<string, unknown>)
        : undefined,
    }));
  } catch (err) {
    console.error("[ai-log] failed to fetch recent activity", err);
    return [];
  }
}

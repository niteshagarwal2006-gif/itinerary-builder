import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

/** Default model for translation / proofreading (overridable via env). */
export const AI_MODEL = process.env.ITINERARY_AI_MODEL || "claude-sonnet-4-6";

/**
 * Key from the desktop app's config file (ITB_CONFIG_PATH points at a JSON
 * file like { "anthropicApiKey": "sk-ant-…" }). Re-read on each call so the
 * Settings window takes effect without restarting the server.
 */
function keyFromConfigFile(): string | undefined {
  const p = process.env.ITB_CONFIG_PATH;
  if (!p) return undefined;
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8")) as { anthropicApiKey?: string };
    return cfg.anthropicApiKey?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function apiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || keyFromConfigFile();
}

/** True when an Anthropic API key is configured (env or desktop config file). */
export function hasAi(): boolean {
  return Boolean(apiKey());
}

/** Thrown when the API key is missing, so routes can return a clear 503. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("No Claude API key configured.");
    this.name = "MissingApiKeyError";
  }
}

let cached: Anthropic | null = null;
let cachedKey: string | undefined;

/** Get a shared Anthropic client (env ANTHROPIC_API_KEY or desktop config). */
export function getClient(): Anthropic {
  const key = apiKey();
  if (!key) throw new MissingApiKeyError();
  if (!cached || cachedKey !== key) {
    cached = new Anthropic({ apiKey: key });
    cachedKey = key;
  }
  return cached;
}

/** Pull the concatenated text out of a Messages response. */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Thrown when a model reply cannot be parsed as JSON (e.g. truncated output). */
export class JsonParseError extends Error {
  constructor(public raw: string) {
    super("The AI reply could not be parsed as JSON (it may have been truncated).");
    this.name = "JsonParseError";
  }
}

/**
 * Extract the balanced JSON block that starts at `start` (an opening { or [),
 * respecting strings/escapes so brackets inside string values don't miscount.
 * Returns null if no matching close is found (e.g. truncated output).
 */
function extractBalanced(s: string, start: number): string | null {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse a JSON object/array from a model reply, tolerating ```json fences and
 * surrounding prose. Scans for the first balanced bracket block that parses, so
 * a stray bracket in prose or a trailing note doesn't break it. Throws
 * {@link JsonParseError} (not a raw SyntaxError) when nothing parses.
 */
export function parseJson<T>(raw: string): T {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();

  // Fast path: the whole string is valid JSON.
  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through to balanced extraction */
  }

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "[") {
      const block = extractBalanced(s, i);
      if (block) {
        try {
          return JSON.parse(block) as T;
        } catch {
          /* not this block — keep scanning */
        }
      }
    }
  }
  throw new JsonParseError(raw);
}

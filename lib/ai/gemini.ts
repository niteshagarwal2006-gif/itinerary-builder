import "server-only";
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import { parseJson } from "./client";

export type { JsonParseError } from "./client";
export { parseJson } from "./client";

/** Default Gemini model (overridable via env). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/** Default OpenRouter model (overridable via env). */
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

interface ConfigFile {
  geminiApiKey?: string;
  openRouterApiKey?: string;
  anthropicApiKey?: string;
}

/** Read the desktop config file, if one is configured. */
function keysFromConfigFile(): { gemini?: string; openRouter?: string } {
  const p = process.env.ITB_CONFIG_PATH;
  if (!p) return {};
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8")) as ConfigFile;
    return {
      gemini: cfg.geminiApiKey?.trim() || undefined,
      openRouter: cfg.openRouterApiKey?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || keysFromConfigFile().gemini;
}

function openRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY || keysFromConfigFile().openRouter;
}

/** True when any generative provider is configured. */
export function hasAiProvider(): boolean {
  return Boolean(geminiKey() || openRouterKey());
}

/** Thrown when no provider is configured, so routes can return a clear 503. */
export class MissingAiProviderError extends Error {
  constructor() {
    super("No AI provider configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to your .env.local file.");
    this.name = "MissingAiProviderError";
  }
}

let cachedGemini: GoogleGenAI | null = null;
let cachedGeminiKey: string | undefined;

/** Get a shared Gemini client (env GEMINI_API_KEY or desktop config file). */
export function getGeminiClient(): GoogleGenAI {
  const key = geminiKey();
  if (!key) throw new MissingAiProviderError();
  if (!cachedGemini || cachedGeminiKey !== key) {
    cachedGemini = new GoogleGenAI({ apiKey: key });
    cachedGeminiKey = key;
  }
  return cachedGemini;
}

/**
 * Generate text with Gemini using a system instruction and a user prompt.
 * Returns the raw text response.
 */
export async function generateWithGemini(
  system: string,
  prompt: string,
  model = GEMINI_MODEL
): Promise<string> {
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });
  return response.text ?? "";
}

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message: string; code?: number };
}

/** True when an OpenRouter API key is configured. */
export function hasOpenRouter(): boolean {
  return Boolean(openRouterKey());
}

/**
 * Generate text with OpenRouter using a system instruction and a user prompt.
 * OpenRouter provides an OpenAI-compatible chat completions API.
 */
export async function generateWithOpenRouter(
  system: string,
  prompt: string,
  model = OPENROUTER_MODEL
): Promise<string> {
  const key = openRouterKey();
  if (!key) throw new MissingAiProviderError();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3010",
      "X-Title": "Itinerary Builder Agent",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });

  const data = (await res.json()) as OpenRouterResponse;
  if (!res.ok || data.error) {
    const msg = data.error?.message || `OpenRouter request failed (${res.status})`;
    throw new Error(msg);
  }
  return data.choices?.[0]?.message?.content ?? "";
}

function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("not found") ||
    msg.includes("no gemini api key")
  );
}

/**
 * Generate text using the best available provider:
 * 1. Gemini (if configured)
 * 2. OpenRouter fallback (if configured and Gemini fails)
 */
export async function generateText(
  system: string,
  prompt: string,
  geminiModel = GEMINI_MODEL,
  openRouterModel = OPENROUTER_MODEL
): Promise<string> {
  const canUseGemini = hasGeminiForConfig();
  const canUseOpenRouter = hasOpenRouter();

  if (!canUseGemini && !canUseOpenRouter) {
    throw new MissingAiProviderError();
  }

  if (canUseGemini) {
    try {
      return await generateWithGemini(system, prompt, geminiModel);
    } catch (err) {
      if (!canUseOpenRouter || !isRetryableGeminiError(err)) throw err;
      // Fall through to OpenRouter
    }
  }

  return generateWithOpenRouter(system, prompt, openRouterModel);
}

/** Kept for backward compatibility — delegates to hasAiProvider. */
export function hasGemini(): boolean {
  return hasAiProvider();
}

function hasGeminiForConfig(): boolean {
  return Boolean(geminiKey());
}

/**
 * Generate a JSON object and parse it.
 * Tries Gemini first, then falls back to OpenRouter.
 */
export async function generateJson<T>(
  system: string,
  prompt: string,
  geminiModel = GEMINI_MODEL
): Promise<T> {
  const raw = await generateText(
    `${system}\n\nReturn ONLY a valid JSON object. Do not wrap it in markdown fences and do not add any explanatory text before or after the JSON.`,
    prompt,
    geminiModel
  );
  return parseJson<T>(raw);
}

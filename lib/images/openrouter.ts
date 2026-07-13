import "server-only";
import { randomUUID } from "node:crypto";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

export class MissingOpenRouterKeyError extends Error {
  constructor() {
    super("No OpenRouter API key configured.");
    this.name = "MissingOpenRouterKeyError";
  }
}

interface OpenRouterImageResponse {
  data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
  error?: { message: string };
}

/**
 * Generate an image with OpenRouter and return a public URL or base64 data URL.
 * The caller is responsible for downloading/saving the image.
 */
export async function generateImageWithOpenRouter(
  prompt: string,
  model = process.env.OPENROUTER_IMAGE_MODEL || "black-forest-labs/flux-schnell"
): Promise<{ url: string; revisedPrompt?: string }> {
  const key = apiKey();
  if (!key) throw new MissingOpenRouterKeyError();

  const res = await fetch(`${OPENROUTER_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3010",
      "X-Title": "Itinerary Builder",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });

  const data = (await res.json()) as OpenRouterImageResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `OpenRouter image generation failed (${res.status})`);
  }

  const item = data.data?.[0];
  if (!item) throw new Error("OpenRouter returned no image data.");

  if (item.b64_json) {
    return { url: `data:image/png;base64,${item.b64_json}`, revisedPrompt: item.revised_prompt };
  }
  if (item.url) {
    return { url: item.url, revisedPrompt: item.revised_prompt };
  }
  throw new Error("OpenRouter returned neither URL nor base64 image.");
}

export function generateImageId(): string {
  return randomUUID();
}

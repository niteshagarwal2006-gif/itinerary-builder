import "server-only";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ImageRef } from "@/lib/itinerary/types";
import { fetchWikipediaImage } from "./web";
import { generateImageWithOpenRouter } from "./openrouter";
import { findGeneratedImage, saveGeneratedImage, toImageRef } from "./db";

export type ImageType = "city" | "sight" | "route" | "watercolor";

interface GetImageOptions {
  type: ImageType;
  key: string;
  /** Primary AI prompt. */
  prompt: string;
  /** Fallback prompt if the primary is too long / fails. */
  fallbackPrompt?: string;
  /** Optional caption stored with the image. */
  caption?: string;
  /** Skip web/Wikipedia lookup and go straight to AI. */
  skipWeb?: boolean;
}

function slugify(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function ensureDir(p: string): void {
  mkdirSync(path.dirname(p), { recursive: true });
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function saveLocalImage(type: ImageType, key: string, buffer: Buffer, ext = "png"): Promise<string> {
  const rel = path.join("uploads", "generated", type, `${slugify(key)}.${ext}`);
  const abs = path.join(process.cwd(), "public", rel);
  ensureDir(abs);
  writeFileSync(abs, buffer);
  return rel;
}

/**
 * Get an image for a subject. Order:
 * 1. Return cached generated image.
 * 2. Try Wikipedia/web thumbnail.
 * 3. Generate with OpenRouter and cache.
 *
 * Returns an ImageRef or undefined if all methods fail.
 */
export async function getImage(opts: GetImageOptions): Promise<ImageRef | undefined> {
  const { type, key, prompt, fallbackPrompt, caption, skipWeb } = opts;

  // 1. Cache
  const cached = findGeneratedImage(type, key);
  if (cached) {
    const ref = toImageRef(cached);
    if (ref.url) return ref;
  }

  // 2. Web fetch (only for city/sight, not route/watercolor)
  if (!skipWeb && (type === "city" || type === "sight")) {
    try {
      const webUrl = await fetchWikipediaImage(key);
      if (webUrl) {
        const buffer = await downloadImage(webUrl);
        const localPath = await saveLocalImage(type, key, buffer);
        saveGeneratedImage(type, key, "web", webUrl, localPath, { caption });
        return { url: `/${localPath}`, caption };
      }
    } catch {
      // fall through to AI
    }
  }

  // 3. AI generation
  try {
    const { url } = await generateImageWithOpenRouter(prompt);
    let localPath: string | null = null;
    let finalUrl = url;

    if (url.startsWith("data:")) {
      // base64 — decode and save locally
      const base64 = url.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      localPath = await saveLocalImage(type, key, buffer);
      finalUrl = `/${localPath}`;
    } else {
      // remote URL — download and save locally so the docx generator can read it
      try {
        const buffer = await downloadImage(url);
        localPath = await saveLocalImage(type, key, buffer);
        finalUrl = `/${localPath}`;
      } catch {
        // keep remote URL as fallback
      }
    }

    saveGeneratedImage(type, key, "ai", url, localPath, { caption });
    return { url: finalUrl, caption };
  } catch (err) {
    // Try fallback prompt
    if (fallbackPrompt && fallbackPrompt !== prompt) {
      try {
        const { url } = await generateImageWithOpenRouter(fallbackPrompt);
        const base64 = url.startsWith("data:") ? url.split(",")[1] : null;
        let localPath: string | null = null;
        let finalUrl = url;
        if (base64) {
          const buffer = Buffer.from(base64, "base64");
          localPath = await saveLocalImage(type, key, buffer);
          finalUrl = `/${localPath}`;
        } else {
          try {
            const buffer = await downloadImage(url);
            localPath = await saveLocalImage(type, key, buffer);
            finalUrl = `/${localPath}`;
          } catch { /* keep remote */ }
        }
        saveGeneratedImage(type, key, "ai", url, localPath, { caption });
        return { url: finalUrl, caption };
      } catch { /* fall through */ }
    }
    console.error("Image generation failed for", type, key, err);
    return undefined;
  }
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Convenience: get a watercolor-style city image. */
export async function getWatercolorCityImage(cityName: string): Promise<ImageRef | undefined> {
  const display = titleCase(cityName);
  const prompt = `A soft watercolor travel illustration of ${display}, India, warm pastel tones, dreamy atmosphere, no text, no labels, white background.`;
  return getImage({
    type: "watercolor",
    key: `watercolor:${cityName}`,
    prompt,
    caption: display,
    skipWeb: true,
  });
}

/** Convenience: get a city photo (web first, then AI fallback). */
export async function getCityImage(cityName: string): Promise<ImageRef | undefined> {
  return getImage({
    type: "city",
    key: cityName,
    prompt: `A beautiful travel photograph of ${cityName}, India, iconic landmark, golden hour light, no text, no labels.`,
    caption: cityName,
  });
}

/** Convenience: get a sight photo (web first, then AI fallback). */
export async function getSightImage(title: string, cityName?: string): Promise<ImageRef | undefined> {
  const key = cityName ? `${cityName}:${title}` : title;
  const subject = cityName ? `${title} in ${cityName}` : title;
  return getImage({
    type: "sight",
    key,
    prompt: `A stunning travel photograph of ${subject}, India, clear composition, no text, no labels.`,
    caption: title,
  });
}

/** Download a user-selected external image (e.g. Pexels) and cache it as a sight image. */
export async function saveSightImageFromUrl(url: string, title: string, cityName?: string): Promise<ImageRef | undefined> {
  const key = cityName ? `${cityName}:${title}` : title;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase() === "png" ? "png" : "jpg";
    const localPath = await saveLocalImage("sight", key, buffer, ext);
    saveGeneratedImage("sight", key, "web", url, localPath, { caption: title });
    return { url: `/${localPath}`, caption: title };
  } catch {
    return undefined;
  }
}

/** Convenience: generate a route map image. */
export async function getRouteMapImage(cities: string[]): Promise<ImageRef | undefined> {
  if (cities.length < 2) return undefined;
  const displayCities = cities.map(titleCase);
  const route = displayCities.join(" → ");
  const prompt = `A clean minimalist illustrated map of India showing a travel route connecting ${displayCities.join(", ")}, with dotted lines and small landmark icons for each city, soft watercolor style, no text labels, warm colors.`;
  return getImage({
    type: "route",
    key: cities.join("-").toLowerCase(),
    prompt,
    caption: route,
    skipWeb: true,
  });
}

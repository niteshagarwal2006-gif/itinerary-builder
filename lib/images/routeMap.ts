import "server-only";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ImageRef } from "@/lib/itinerary/types";
import { geocodeCities, type GeoCoord } from "@/lib/geo";
import { logActivity } from "@/lib/ai/log";
import { findGeneratedImage, saveGeneratedImage, toImageRef } from "./db";

// staticmaps is a CommonJS package; import lazily so it only loads when needed.
let StaticMaps: typeof import("staticmaps") | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StaticMaps = require("staticmaps");
} catch {
  StaticMaps = null;
}

interface GeocodedCity {
  name: string;
  coord: GeoCoord;
}

function slugifyRoute(cities: string[]): string {
  return cities
    .map((c) =>
      c
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 30)
    )
    .join("-");
}

function ensureDir(p: string): void {
  mkdirSync(path.dirname(p), { recursive: true });
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function pinMarkerSvg(color = "#B8860B"): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32c0-8.8-7.2-16-16-16z" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
  </svg>`;
  return Buffer.from(svg);
}

async function renderStaticMapsRoute(cities: GeocodedCity[]): Promise<Buffer | null> {
  if (!StaticMaps) return null;

  if (cities.length < 2) return null;

  const map = new StaticMaps({
    width: 900,
    height: 550,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileSubdomains: ["a", "b", "c"],
  });

  const pin = pinMarkerSvg();
  for (const c of cities) {
    const coord: [number, number] = [c.coord.lon, c.coord.lat];
    map.addMarker({
      coord,
      img: pin,
      height: 48,
      width: 32,
      offsetX: 16,
      offsetY: 48,
    });
    // staticmaps type declarations don't expose addText, but the runtime does.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).addText({
      coord,
      text: titleCase(c.name),
      color: "#1B2A2A",
      fill: "#1B2A2A",
      size: 13,
      anchor: "middle",
      offsetX: 0,
      offsetY: 14,
    });
  }

  const coords: [number, number][] = cities.map((c) => [c.coord.lon, c.coord.lat]);
  if (coords.length > 1) {
    map.addLine({ coords, color: "#B8860B", width: 3 });
  }

  try {
    await map.render();
    return await map.image.buffer("png");
  } catch {
    return null;
  }
}

/**
 * Generate a real geographic route map image for the given cities.
 * Results are cached by the ordered city list so the map is only rendered once.
 * Optional pre-computed coordinates avoid duplicate Nominatim calls.
 */
export async function getRealRouteMapImage(
  cities: string[],
  precomputedCoords?: Map<string, GeoCoord>
): Promise<ImageRef | undefined> {
  if (cities.length < 2) return undefined;

  const key = slugifyRoute(cities);
  const cached = findGeneratedImage("route", key);
  if (cached) {
    const ref = toImageRef(cached);
    if (ref.url) {
      logActivity({
        category: "image",
        provider: "cache",
        cacheKey: `route-map:${key}`,
        input: { cities },
        output: { url: ref.url, caption: ref.caption },
        savedTo: cached.localPath ?? "generated_images",
        status: "cached",
      });
      return ref;
    }
  }

  const start = Date.now();
  let geocoded: GeocodedCity[] = [];
  if (precomputedCoords && precomputedCoords.size >= cities.length) {
    geocoded = cities
      .map((name) => ({ name, coord: precomputedCoords.get(name)! }))
      .filter((c) => c.coord);
  } else {
    geocoded = await geocodeCities(cities);
  }

  if (geocoded.length < 2) {
    logActivity({
      category: "image",
      provider: "nominatim",
      cacheKey: `route-map:${key}`,
      input: { cities },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: "Could not geocode enough cities",
    });
    return undefined;
  }

  const buffer = await renderStaticMapsRoute(geocoded);
  if (!buffer) {
    logActivity({
      category: "image",
      provider: "web",
      cacheKey: `route-map:${key}`,
      input: { cities, geocoded: geocoded.map((g) => g.name) },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: "staticmaps render failed",
    });
    return undefined;
  }

  const rel = path.join("uploads", "generated", "route", `${key}.png`);
  const abs = path.join(process.cwd(), "public", rel);
  ensureDir(abs);
  writeFileSync(abs, buffer);

  const route = cities.map(titleCase).join(" → ");
  saveGeneratedImage("route", key, "web", `/${rel}`, rel, { caption: route });
  logActivity({
    category: "image",
    provider: "web",
    cacheKey: `route-map:${key}`,
    input: { cities, geocoded: geocoded.map((g) => g.name) },
    output: { localPath: rel, caption: route, bytes: buffer.length },
    savedTo: rel,
    durationMs: Date.now() - start,
    status: "success",
  });
  return { url: `/${rel}`, caption: route };
}

import "server-only";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ImageRef } from "@/lib/itinerary/types";
import { geocodeCities, type GeoCoord } from "@/lib/geo";
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

async function renderStaticMapsRoute(cities: GeocodedCity[]): Promise<Buffer | null> {
  if (!StaticMaps) return null;

  const coords: [number, number][] = cities.map((c) => [c.coord.lon, c.coord.lat]);
  if (coords.length < 2) return null;

  const map = new StaticMaps({
    width: 900,
    height: 550,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileSubdomains: ["a", "b", "c"],
  });

  for (const c of coords) {
    map.addCircle({
      coord: c,
      radius: 8000,
      color: "#B8860B",
      fill: "#B8860B66",
      width: 2,
    });
  }

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
    if (ref.url) return ref;
  }

  let geocoded: GeocodedCity[] = [];
  if (precomputedCoords && precomputedCoords.size >= cities.length) {
    geocoded = cities
      .map((name) => ({ name, coord: precomputedCoords.get(name)! }))
      .filter((c) => c.coord);
  } else {
    geocoded = await geocodeCities(cities);
  }

  if (geocoded.length < 2) return undefined;

  const buffer = await renderStaticMapsRoute(geocoded);
  if (!buffer) return undefined;

  const rel = path.join("uploads", "generated", "route", `${key}.png`);
  const abs = path.join(process.cwd(), "public", rel);
  ensureDir(abs);
  writeFileSync(abs, buffer);

  const route = cities.map(titleCase).join(" → ");
  saveGeneratedImage("route", key, "web", `/${rel}`, rel, { caption: route });
  return { url: `/${rel}`, caption: route };
}

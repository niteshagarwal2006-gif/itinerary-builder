import "server-only";
import { getDb } from "@/lib/db.server";

export interface GeoCoord { lat: number; lon: number }

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function getCached(name: string): GeoCoord | undefined {
  const row = getDb()
    .prepare("SELECT lat, lon FROM city_coords WHERE name = ?")
    .get(normName(name)) as { lat: number; lon: number } | undefined;
  if (row) return { lat: row.lat, lon: row.lon };
  return undefined;
}

function setCached(name: string, coord: GeoCoord): void {
  getDb()
    .prepare(
      `INSERT INTO city_coords (name, lat, lon, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET lat = ?, lon = ?, updated_at = ?`
    )
    .run(
      normName(name),
      coord.lat,
      coord.lon,
      new Date().toISOString(),
      coord.lat,
      coord.lon,
      new Date().toISOString()
    );
}

async function fetchNominatim(name: string): Promise<GeoCoord | undefined> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: `${name}, India`,
        format: "json",
        limit: "1",
      }).toString();
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ItineraryBuilder/1.0; +https://github.com/niteshagarwal2006-gif/itinerary-builder)",
        Accept: "application/json",
        Referer: "https://localhost:3010/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (!data.length) return undefined;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (err) {
    console.error("Geocoding failed for", name, err);
    return undefined;
  }
}

/**
 * Return the lat/lon for a city, using cache or Nominatim.
 */
export async function geocodeCity(name: string): Promise<GeoCoord | undefined> {
  const cached = getCached(name);
  if (cached) return cached;
  const coord = await fetchNominatim(name);
  if (coord) setCached(name, coord);
  return coord;
}

/** Haversine distance in km. */
function haversine(a: GeoCoord, b: GeoCoord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

export interface DistanceResult {
  km: number;
  hrs: number;
}

/**
 * Calculate road distance and estimated driving time between two cities.
 * Falls back to straight-line Haversine * 1.25 when no road API is available.
 */
export async function calculateDistance(from: string, to: string): Promise<DistanceResult | null> {
  const a = await geocodeCity(from);
  const b = await geocodeCity(to);
  if (!a || !b) return null;
  return calculateDistanceBetween(a, b);
}


/**
 * Calculate road distance between two already-known coordinates.
 * Falls back to straight-line Haversine * 1.25 when OSRM is unavailable.
 */
export async function calculateDistanceBetween(a: GeoCoord, b: GeoCoord): Promise<DistanceResult | null> {
  // Try OSRM car routing first
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { routes?: { distance: number; duration: number }[] };
      const route = data.routes?.[0];
      if (route) {
        return {
          km: Math.round(route.distance / 1000),
          hrs: Math.round((route.duration / 3600) * 10) / 10,
        };
      }
    }
  } catch {
    // fall through to haversine estimate
  }

  const km = Math.round(haversine(a, b) * 1.25);
  const hrs = Math.round((km / 55) * 10) / 10; // ~55 km/h average on Indian highways
  return { km, hrs };
}

/**
 * Return coordinates for a list of cities, in order.
 */
export async function geocodeCities(cities: string[]): Promise<{ name: string; coord: GeoCoord }[]> {
  const results: { name: string; coord: GeoCoord }[] = [];
  for (const city of cities) {
    const coord = await geocodeCity(city);
    if (coord) results.push({ name: city, coord });
    // Nominatim usage policy: max 1 request per second for unauthenticated use.
    if (cities.length > 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return results;
}

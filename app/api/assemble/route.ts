import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Activity, DayBlock, Hotel, ImageRef, Itinerary, Lang, Sight, TripSummary } from "@/lib/itinerary/types";
import { ensureCityDescription } from "@/lib/agent/cityDescriptions";
import { getHighlightsCollageImage, getSightImage, getWatercolorCityImage, saveSightImageFromUrl } from "@/lib/images/imageService";
import { getRealRouteMapImage } from "@/lib/images/routeMap";
import { checkSightOnDate } from "@/lib/closureDays";
import {
  addSuggestedActivity,
  getCachedActivityDescription,
  saveActivityDescription,
} from "@/lib/cityActivities";
import { generateText, hasAiProvider } from "@/lib/ai/gemini";
import { logActivity } from "@/lib/ai/log";
import { getDb } from "@/lib/db.server";
import { geocodeCities, calculateDistanceBetween, type DistanceResult, type GeoCoord } from "@/lib/geo";
import { recordRoute, recordHotel, recordFlowStyle } from "@/lib/memory";
import { addSuggestedSight } from "@/lib/citySights";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Input shape from the wizard
// ---------------------------------------------------------------------------
interface MealFlags { b: boolean; l: boolean; d: boolean }

interface CityHotel { name: string; url: string }

interface AssembleInput {
  client: string;
  lang: Lang;
  dates: string;
  startDate?: string;
  mealPlan: MealFlags;
  route: string[];
  nights: number[];
  visits: string[][];
  activities: string[][];
  hotels: CityHotel[];
  includeWeather: boolean;
  sightImages?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Output review note
// ---------------------------------------------------------------------------
export interface ReviewNote {
  type: "warning" | "info" | "ok";
  scope: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normCity(name: string): string {
  return name.trim().toLowerCase();
}

function upperCity(name: string): string {
  return name.trim().toUpperCase();
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateForDisplay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear());
  return `${day}-${month}-${year}`;
}

const MEAL_PARTS: Record<Lang, { b: string; l: string; d: string; night: string }> = {
  fr: { b: "petit-déjeuner", l: "déjeuner", d: "dîner", night: "Nuit à l'hôtel." },
  en: { b: "breakfast", l: "lunch", d: "dinner", night: "Night at the hotel." },
  de: { b: "Frühstück", l: "Mittagessen", d: "Abendessen", night: "Übernachtung im Hotel." },
};

function closingLine(meals: MealFlags, lang: Lang): string {
  const m = MEAL_PARTS[lang];
  const included = [meals.b && m.b, meals.l && m.l, meals.d && m.d].filter(Boolean) as string[];
  if (included.length === 0) return m.night;
  const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);
  const parts = [cap(included[0]), ...included.slice(1)].join(", ");
  if (lang === "fr") return `${parts} et nuit à l'hôtel.`;
  if (lang === "en") return `${parts} and night at the hotel.`;
  return `${parts} und Übernachtung im Hotel.`;
}

function mealPlanText(meals: MealFlags, lang: Lang): string {
  if (lang === "fr") {
    if (meals.b && meals.l && meals.d) return "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS";
    if (meals.b && meals.d) return "SÉJOUR EN DEMI-PENSION – PETIT-DÉJEUNER ET DÎNER INCLUS";
    if (meals.b) return "SÉJOUR EN CHAMBRE ET PETIT-DÉJEUNER INCLUS";
    return "SÉJOUR SANS REPAS INCLUS";
  }
  if (lang === "en") {
    if (meals.b && meals.l && meals.d) return "FULL BOARD – BREAKFAST, LUNCH AND DINNER INCLUDED";
    if (meals.b && meals.d) return "HALF BOARD – BREAKFAST AND DINNER INCLUDED";
    if (meals.b) return "BED AND BREAKFAST INCLUDED";
    return "ROOM ONLY";
  }
  if (meals.b && meals.l && meals.d) return "VOLLPENSION – FRÜHSTÜCK, MITTAGESSEN UND ABENDESSEN INKLUSIVE";
  if (meals.b && meals.d) return "HALBPENSION – FRÜHSTÜCK UND ABENDESSEN INKLUSIVE";
  if (meals.b) return "ÜBERNACHTUNG MIT FRÜHSTÜCK INKLUSIVE";
  return "ÜBERNACHTUNG OHNE MAHLZEITEN";
}

function titleForDay(dayIndex: number, city: string, prevCity: string | null): string {
  const cityUp = upperCity(city);
  if (dayIndex === 0) return `ARRIVAL IN ${cityUp}`;
  if (prevCity && upperCity(prevCity) !== cityUp) return `${upperCity(prevCity)} – ${cityUp}`;
  return `FULL DAY IN ${cityUp}`;
}

// ---------------------------------------------------------------------------
// Distance formatting
// ---------------------------------------------------------------------------
function formatLegText(info: DistanceResult | null): string {
  if (!info) return "";
  const totalMins = Math.round(info.hrs * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${info.km} KMS – ${m} MINS`;
  if (m === 0) return `${info.km} KMS – ${h} HR${h !== 1 ? "S" : ""}`;
  return `${info.km} KMS – ${h} HR${h !== 1 ? "S" : ""} ${m}`;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------
async function generateVisitDescription(title: string, city: string, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const system = "You are a luxury travel writer for the Indian subcontinent. Write concise, evocative descriptions.";
  const prompt = `Write a 2-3 sentence description in ${languageName} for "${title}" in ${city}, India, suitable for a high-end travel itinerary. Return only the description, no labels.`;
  const cacheKey = `desc:${lang}:${city}:${title}`;
  const start = Date.now();
  try {
    const text = (await generateText(system, prompt)).trim();
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return text;
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

async function generateTransition(from: string, to: string, info: DistanceResult | null, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const leg = info ? ` (${formatLegText(info)})` : "";
  const system = "You are a luxury travel writer. Write a single smooth transition sentence.";
  const prompt = `Write one elegant ${languageName} sentence describing the road journey from ${from} to ${to}${leg}. Mention breakfast and arrival/check-in naturally. Return only the sentence.`;
  const cacheKey = `transition:${lang}:${from}:${to}:${info?.km ?? 0}:${info?.hrs ?? 0}`;
  const start = Date.now();
  try {
    const text = (await generateText(system, prompt)).trim();
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { from, to, lang, leg },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return text;
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { from, to, lang, leg },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

async function generateWarmFlow(
  days: DayBlock[],
  lang: Lang
): Promise<{ days: DayBlock[]; styleRules: string }> {
  if (!hasAiProvider() || days.length === 0) {
    return { days, styleRules: "" };
  }

  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const summary = days
    .map(
      (d, i) =>
        `Day ${i + 1}: ${d.title}${d.date ? ` (${d.date})` : ""} | City: ${d.city} | ` +
        `Sights: ${d.sights.map((s) => s.title).join(", ") || "none"} | ` +
        `Current intro: ${d.intro || "(none)"}`
    )
    .join("\n");

  const system =
    "You are a senior luxury-travel writer. Rewrite the day intros so the whole itinerary reads as one warm, professional narrative. " +
    "Keep each intro concise (2-4 sentences), mention the previous-to-next city flow when relevant, and make the journey feel connected. " +
    "Return ONLY a valid JSON object with two fields: " +
    "\"intros\" — an array of strings, one per day, in the same order as the input; " +
    "\"styleRules\" — a short paragraph describing the tone and flow principles you applied (this will be saved to improve future itineraries).";
  const prompt = `Rewrite these day intros in ${languageName}:\n${summary}`;
  const cacheKey = `flow:${lang}:${days.map((d) => d.city).join("-")}`;
  const start = Date.now();

  try {
    const raw = await generateText(system, prompt);
    const parsed = JSON.parse(raw) as { intros?: string[]; styleRules?: string };
    const intros = Array.isArray(parsed.intros) ? parsed.intros : [];
    const styleRules = typeof parsed.styleRules === "string" ? parsed.styleRules : "";

    const rewritten = days.map((d, i) => ({
      ...d,
      intro: intros[i]?.trim() || d.intro,
    }));

    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { dayCount: days.length, lang },
      output: { styleRules, introPreviews: intros.map((t) => t.slice(0, 120)) },
      savedTo: "memory:flow",
      durationMs: Date.now() - start,
      status: "success",
    });

    return { days: rewritten, styleRules };
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { dayCount: days.length, lang },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { days, styleRules: "" };
  }
}

async function generateWeatherLine(city: string, isoDate: string, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const display = formatDateForDisplay(isoDate);
  const system = "You are a travel assistant. Provide a short, plausible weather note.";
  const prompt = `Give a short ${languageName} weather forecast summary for ${city}, India on ${display} (around that time of year). Format like "MÉTÉO: DELHI | 8–24°C | sunny and pleasant". Return only the line.`;
  const cacheKey = `weather:${lang}:${city}:${isoDate}`;
  const start = Date.now();
  try {
    const text = (await generateText(system, prompt)).trim();
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { city, isoDate, lang },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return text;
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { city, isoDate, lang },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

// ---------------------------------------------------------------------------
// Sight description cache
// ---------------------------------------------------------------------------
function getCachedSight(title: string, city: string, lang: Lang): string | undefined {
  const row = getDb()
    .prepare("SELECT description FROM sights WHERE title = ? AND city = ? AND lang = ?")
    .get(title, city, lang) as { description: string | null } | undefined;
  return row?.description ?? undefined;
}

function saveSightDescription(title: string, city: string, lang: Lang, description: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM sights WHERE title = ? AND city = ? AND lang = ?")
    .get(title, city, lang) as { id: string } | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE sights SET description = ?, updated_at = ? WHERE id = ?")
      .run(description, new Date().toISOString(), existing.id);
  } else {
    getDb()
      .prepare("INSERT INTO sights (id, title, city, description, lang, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), title, city, description, lang, new Date().toISOString());
  }
}

async function ensureSightDescription(title: string, city: string, lang: Lang): Promise<string> {
  const cached = getCachedSight(title, city, lang);
  if (cached?.trim()) {
    logActivity({
      category: "text",
      provider: "cache",
      cacheKey: `desc:${lang}:${city}:${title}`,
      input: { title, city, lang },
      output: { length: cached.length, preview: cached.slice(0, 200) },
      savedTo: "sights",
      status: "cached",
    });
    return cached;
  }
  const desc = await generateVisitDescription(title, city, lang);
  if (desc) saveSightDescription(title, city, lang, desc);
  return desc;
}

async function generateActivityDescription(title: string, city: string, lang: Lang): Promise<string> {
  if (!hasAiProvider()) return "";
  const languageName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const system = "You are a luxury travel writer for the Indian subcontinent. Write concise, evocative descriptions.";
  const prompt = `Write a 2-3 sentence description in ${languageName} for the activity "${title}" in ${city}, India, suitable for a high-end travel itinerary. Return only the description, no labels.`;
  const cacheKey = `activity-desc:${lang}:${city}:${title}`;
  const start = Date.now();
  try {
    const text = (await generateText(system, prompt)).trim();
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      output: { length: text.length, preview: text.slice(0, 200) },
      durationMs: Date.now() - start,
      status: "success",
    });
    return text;
  } catch (err) {
    logActivity({
      category: "text",
      provider: "gemini",
      cacheKey,
      input: { title, city, lang, prompt },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

async function ensureActivityDescription(title: string, city: string, lang: Lang): Promise<string> {
  const cached = getCachedActivityDescription(title, city, lang);
  if (cached?.trim()) {
    logActivity({
      category: "text",
      provider: "cache",
      cacheKey: `activity-desc:${lang}:${city}:${title}`,
      input: { title, city, lang },
      output: { length: cached.length, preview: cached.slice(0, 200) },
      savedTo: "activities",
      status: "cached",
    });
    return cached;
  }
  const desc = await generateActivityDescription(title, city, lang);
  if (desc) saveActivityDescription(title, city, lang, desc);
  return desc;
}

// ---------------------------------------------------------------------------
// Build itinerary
// ---------------------------------------------------------------------------
interface PlannedDay {
  city: string;
  dayIndex: number; // 0-based overall
  nightInCity: number; // 1-based within city
  totalNightsInCity: number;
  hotel: CityHotel;
  visits: string[];
  activities: string[];
  isoDate?: string;
  prevCity: string | null;
}

function dedupeStrings(items: string[], duplicates: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((v) => {
    const key = normCity(v);
    if (!key || seen.has(key)) {
      if (!duplicates.includes(v)) duplicates.push(v);
      return false;
    }
    seen.add(key);
    return true;
  });
}

function planDays(input: AssembleInput): { days: PlannedDay[]; duplicates: string[] } {
  const days: PlannedDay[] = [];
  let dayIndex = 0;
  const { route, nights, visits, activities, hotels, startDate } = input;
  const duplicates: string[] = [];

  for (let cityIdx = 0; cityIdx < route.length; cityIdx++) {
    const city = normCity(route[cityIdx]);
    const n = nights[cityIdx] ?? 0;
    const cityVisits = dedupeStrings(visits[cityIdx] ?? [], duplicates);
    const cityActivities = dedupeStrings(activities[cityIdx] ?? [], duplicates);
    const hotel = hotels[cityIdx] ?? { name: "", url: "" };

    if (n === 0 && cityIdx !== route.length - 1) continue; // skip non-terminal 0-night cities

    const daysForCity = n === 0 && cityIdx === route.length - 1 ? 1 : n;
    const prevCity = cityIdx === 0 ? null : normCity(route[cityIdx - 1]);

    // Distribute visits and activities across days in this city
    const perDayVisits: string[][] = Array.from({ length: daysForCity }, () => []);
    for (let i = 0; i < cityVisits.length; i++) {
      perDayVisits[i % daysForCity].push(cityVisits[i]);
    }

    const perDayActivities: string[][] = Array.from({ length: daysForCity }, () => []);
    for (let i = 0; i < cityActivities.length; i++) {
      perDayActivities[i % daysForCity].push(cityActivities[i]);
    }

    for (let d = 0; d < daysForCity; d++) {
      const isoDate = startDate ? addDays(startDate, dayIndex) : undefined;
      days.push({
        city,
        dayIndex,
        nightInCity: d + 1,
        totalNightsInCity: daysForCity,
        hotel,
        visits: perDayVisits[d],
        activities: perDayActivities[d],
        isoDate,
        prevCity: d === 0 ? prevCity : null,
      });
      dayIndex++;
    }
  }

  return { days, duplicates };
}

async function buildDayBlock(
  day: PlannedDay,
  input: AssembleInput,
  cityIntros: Map<string, string>,
  cityCoords: Map<string, GeoCoord>
): Promise<DayBlock> {
  const { lang, mealPlan, includeWeather } = input;
  const city = day.city;
  const cityUp = upperCity(city);
  const dayNum = day.dayIndex + 1;
  const isFirstDayInCity = day.nightInCity === 1;

  // Title
  const title = titleForDay(day.dayIndex, city, day.prevCity);

  // Hotel
  const hotel: Hotel | undefined = day.hotel.name
    ? {
        name: day.hotel.name,
        url: day.hotel.url || undefined,
        label: lang === "fr" ? "VOTRE HÔTEL" : lang === "en" ? "YOUR HOTEL" : "IHR HOTEL",
      }
    : undefined;

  // Leg + distance (real OSM/Haversine)
  let leg = undefined;
  let legInfo: DistanceResult | null = null;
  if (day.prevCity && day.prevCity.toLowerCase() !== city.toLowerCase()) {
    const fromCoord = cityCoords.get(day.prevCity);
    const toCoord = cityCoords.get(city);
    legInfo = fromCoord && toCoord ? await calculateDistanceBetween(fromCoord, toCoord) : null;
    leg = {
      fromCity: day.prevCity,
      toCity: city,
      text: formatLegText(legInfo),
      mapsUrl: `https://www.google.com/maps/dir/${encodeURIComponent(day.prevCity)},+India/${encodeURIComponent(city)},+India`,
    };
  }

  // Intro
  let intro = "";
  if (isFirstDayInCity && day.prevCity && day.prevCity.toLowerCase() !== city.toLowerCase()) {
    const transition = await generateTransition(day.prevCity, city, legInfo, lang);
    const cityDesc = cityIntros.get(city) || "";
    intro = transition ? (cityDesc ? `${transition}\n\n${cityDesc}` : transition) : cityDesc;
  } else if (isFirstDayInCity) {
    intro = cityIntros.get(city) || "";
  }

  // Sights with descriptions, images and closure notes
  const sights: Sight[] = [];
  for (const visit of day.visits) {
    const desc = await ensureSightDescription(visit, city, lang);
    const sightKey = `${city}:${visit}`.toLowerCase().trim();
    const selectedUrl = input.sightImages?.[sightKey];
    let image: ImageRef | undefined;
    if (selectedUrl) {
      image = await saveSightImageFromUrl(selectedUrl, visit, city);
    }
    if (!image) {
      image = await getSightImage(visit, city);
    }
    let closureNote: string | undefined;
    if (day.isoDate) {
      const check = await checkSightOnDate(visit, day.isoDate, city, lang);
      if (check.closed) {
        closureNote = lang === "fr"
          ? `Fermé le ${check.dayName.toLowerCase()}. ${check.note ?? ""}`
          : lang === "de"
          ? `Geschlossen am ${check.dayName}. ${check.note ?? ""}`
          : `Closed on ${check.dayName}s. ${check.note ?? ""}`;
      }
    }
    sights.push({
      id: randomUUID(),
      title: visit.toUpperCase(),
      description: desc,
      image,
      closureNote,
    });
  }

  // Activities with descriptions
  const activities: Activity[] = [];
  for (const act of day.activities) {
    const desc = await ensureActivityDescription(act, city, lang);
    activities.push({
      id: randomUUID(),
      title: act.toUpperCase(),
      description: desc,
    });
  }

  // Weather
  let weather: string | undefined;
  if (includeWeather && day.isoDate) {
    weather = await generateWeatherLine(city, day.isoDate, lang);
  }

  // Date display
  const date = day.isoDate ? formatDateForDisplay(day.isoDate) : undefined;

  return {
    id: randomUUID(),
    dayLabel: `JOUR ${dayNum}`,
    date,
    title,
    city: cityUp,
    leg,
    hotel,
    weather,
    intro: intro || undefined,
    sights,
    activities,
    closing: closingLine(mealPlan, lang),
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let input: AssembleInput;
  try {
    input = (await req.json()) as AssembleInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { client, lang, route, nights, visits, activities, hotels, mealPlan } = input;

  if (!client?.trim()) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }
  if (!route || route.length < 2) {
    return NextResponse.json({ error: "At least two cities are required." }, { status: 400 });
  }
  if (!nights || nights.length !== route.length) {
    return NextResponse.json({ error: "Nights array must match route cities." }, { status: 400 });
  }
  if (!visits || visits.length !== route.length) {
    return NextResponse.json({ error: "Visits array must match route cities." }, { status: 400 });
  }
  if (!activities || activities.length !== route.length) {
    return NextResponse.json({ error: "Activities array must match route cities." }, { status: 400 });
  }
  if (!hotels || hotels.length !== route.length) {
    return NextResponse.json({ error: "Hotels array must match route cities." }, { status: 400 });
  }

  // Remember route, hotels, sights and activities
  try {
    recordRoute(route.map(normCity));
    for (let i = 0; i < route.length; i++) {
      const h = hotels[i];
      if (h?.name.trim()) recordHotel(normCity(route[i]), h.name.trim(), h.url.trim() || undefined);
      for (const v of visits[i] ?? []) addSuggestedSight(normCity(route[i]), v);
      for (const a of activities[i] ?? []) addSuggestedActivity(normCity(route[i]), a);
    }
  } catch (err) {
    console.error("Memory recording failed", err);
  }

  // Plan days
  const { days: plannedDays, duplicates } = planDays(input);
  if (plannedDays.length === 0) {
    return NextResponse.json({ error: "No days could be planned from the route." }, { status: 400 });
  }

  // Pre-fetch city intros and watercolor images
  const uniqueCities = Array.from(new Set(plannedDays.map((d) => d.city)));
  const cityIntros = new Map<string, string>();
  const cityImages = new Map<string, ImageRef | undefined>();
  const cityCoords = new Map<string, GeoCoord>();

  await Promise.all(
    uniqueCities.map(async (city) => {
      const [intro, image] = await Promise.all([
        ensureCityDescription(city, lang),
        getWatercolorCityImage(city),
      ]);
      cityIntros.set(city, intro);
      cityImages.set(city, image);
    })
  );

  const geocoded = await geocodeCities(uniqueCities);
  for (const { name, coord } of geocoded) {
    cityCoords.set(name, coord);
  }

  // Build day blocks
  let dayBlocks: DayBlock[] = await Promise.all(
    plannedDays.map((day) => buildDayBlock(day, input, cityIntros, cityCoords))
  );

  // Polish the narrative flow so the whole trip reads professionally and warmly
  try {
    const { days: rewrittenDays, styleRules } = await generateWarmFlow(dayBlocks, lang);
    dayBlocks = rewrittenDays;
    if (styleRules) recordFlowStyle(styleRules);
  } catch (err) {
    console.error("Flow rewrite failed", err);
  }

  // Attach watercolor city images to the first day of each city
  const seenCities = new Set<string>();
  for (const day of dayBlocks) {
    const city = day.city.toLowerCase();
    if (!seenCities.has(city)) {
      seenCities.add(city);
      const image = cityImages.get(city) || cityImages.get(normCity(day.city)) || cityImages.get(day.city);
      if (image) day.cityImage = image;
    }
  }

  // Highlights: first 2 visits per unique city, described in one evocative sentence.
  const highlights: string[] = [];
  const seenHighlightCities = new Set<string>();
  for (let i = 0; i < route.length && highlights.length < 8; i++) {
    const city = normCity(route[i]);
    if (seenHighlightCities.has(city)) continue;
    seenHighlightCities.add(city);
    for (const v of (visits[i] ?? []).slice(0, 2)) {
      if (highlights.length >= 8) break;
      const desc = await ensureSightDescription(v, city, lang);
      const firstSentence = desc ? desc.split(/[.!?](\s|$)/, 1)[0].trim() : "";
      if (firstSentence) {
        const phrase = firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
        highlights.push(`${v} — ${phrase}`);
      } else {
        const prefix = lang === "fr" ? "Découvrez " : lang === "de" ? "Entdecken Sie " : "Discover ";
        highlights.push(`${prefix}${v} in ${titleCase(city)}.`);
      }
    }
  }

  // Watercolor highlights collage for the highlights page
  const highlightsImage = await getHighlightsCollageImage(highlights);

  // Route map (real OSM geography, full ordered route including return legs)
  const routeMap = await getRealRouteMapImage(route.map(normCity));

  // Trip summary
  const totalNights = nights.reduce((a, b) => a + (b || 0), 0);
  const totalDays = dayBlocks.length;
  const tripSummary: TripSummary = {
    origin: lang === "fr" ? "FRANCE" : lang === "de" ? "DEUTSCHLAND" : "ORIGIN",
    arrivalCity: upperCity(route[0]),
    departureCity: upperCity(route[route.length - 1]),
    finalDestination: lang === "fr" ? "FRANCE" : lang === "de" ? "DEUTSCHLAND" : "ORIGIN",
    dates: input.dates || undefined,
    nights: totalNights,
    days: totalDays,
    mealPlan: mealPlanText(mealPlan, lang),
  };

  const itinerary: Itinerary = {
    outputLanguage: lang,
    preparedFor: client,
    tripSummary,
    routeCities: route.map(upperCity),
    flightLegs: [],
    highlights,
    highlightsImage: highlightsImage ?? undefined,
    routeMap: routeMap ?? undefined,
    days: dayBlocks,
  };

  const review = await reviewItinerary(itinerary, plannedDays, duplicates);

  return NextResponse.json({ itinerary, review });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
async function reviewItinerary(it: Itinerary, plannedDays: PlannedDay[], duplicates: string[]): Promise<ReviewNote[]> {
  const notes: ReviewNote[] = [];

  if (duplicates.length > 0) {
    notes.push({
      type: "info",
      scope: "Overall",
      message: `Duplicate visits removed: ${duplicates.join(", ")}`,
    });
  }

  for (const d of it.days) {
    for (const w of d.closureWarnings ?? []) {
      notes.push({ type: "warning", scope: d.dayLabel, message: w });
    }
  }

  for (let i = 0; i < plannedDays.length; i++) {
    const pd = plannedDays[i];
    if (pd.visits.length === 0) {
      notes.push({ type: "info", scope: `JOUR ${i + 1}`, message: `No visits scheduled in ${pd.city}.` });
    }
    if (!pd.hotel.name.trim()) {
      notes.push({ type: "info", scope: `JOUR ${i + 1}`, message: `No hotel selected for ${pd.city}.` });
    }
  }

  if (!hasAiProvider()) return notes;

  const daysSummary = plannedDays
    .map((d, i) => `JOUR ${i + 1}: ${d.city} — ${d.visits.join(", ") || "no visits"}`)
    .join("\n");

  const system =
    "You are a senior India travel expert reviewing an itinerary. " +
    "Return ONLY a valid JSON array of up to 6 notes. Each note: {\"type\":\"warning\"|\"info\"|\"ok\",\"scope\":\"JOUR N or Overall\",\"message\":\"concise text\"}. " +
    "Flag unrealistic distances, missing must-sees, repeated sights, backtracking. Include one ok note if routing looks solid.";
  const prompt = `Review this routing:\n${daysSummary}`;

  const cacheKey = `review:${plannedDays.map((d) => d.city).join("-")}`;
  const start = Date.now();
  try {
    const raw = await generateText(system, prompt);
    const aiNotes = JSON.parse(raw) as ReviewNote[];
    if (Array.isArray(aiNotes)) {
      notes.push(...aiNotes.filter((n) => n && n.type && n.scope && n.message));
    }
    logActivity({
      category: "review",
      provider: "gemini",
      cacheKey,
      input: { daysSummary },
      output: { noteCount: aiNotes.length },
      durationMs: Date.now() - start,
      status: "success",
    });
  } catch (err) {
    logActivity({
      category: "review",
      provider: "gemini",
      cacheKey,
      input: { daysSummary },
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  return notes;
}

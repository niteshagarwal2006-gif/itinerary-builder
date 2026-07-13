import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { DayBlock, Itinerary, Lang, Sight, TripSummary } from "@/lib/itinerary/types";
import type { LibHotel, LibSight } from "@/lib/library-types";
import { getClient, hasAi, parseJson, textOf, AI_MODEL } from "@/lib/ai/client";
import { getCityImage } from "@/lib/library.server";
import { getClosureInfo, WEEKDAY_NAMES } from "@/lib/closureDays";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Input shape from the wizard (new flat per-night model)
// ---------------------------------------------------------------------------
interface MealFlags { b: boolean; l: boolean; d: boolean }

type SightInput = LibSight & { enRoute?: boolean };

interface DayStopInput {
  cityName: string;
  nightNum: number;      // 1-based within city
  totalNights: number;   // total nights in this city
  hotel: LibHotel | null;
  hotelUrl: string;
  sights: SightInput[];
  activities: SightInput[];
  meals: MealFlags;
}

interface AssembleInput {
  client: string;
  lang: Lang;
  nights: number;
  days: number;
  dates: string;
  /** ISO date of Day 1 (arrival), e.g. "2027-04-11". Used for closure-day checks. */
  startDate?: string;
  dayStops: DayStopInput[];
}

// ---------------------------------------------------------------------------
// Distance lookup table (km, approx hours by road)
// ---------------------------------------------------------------------------
interface LegInfo { km: number; hrs: number }

const DISTANCES: Record<string, LegInfo> = {
  // Golden Triangle
  "delhi-agra": { km: 233, hrs: 3.5 }, "agra-delhi": { km: 233, hrs: 3.5 },
  "delhi-jaipur": { km: 280, hrs: 5 }, "jaipur-delhi": { km: 280, hrs: 5 },
  "agra-jaipur": { km: 232, hrs: 4 }, "jaipur-agra": { km: 232, hrs: 4 },
  // Rajasthan
  "jaipur-jodhpur": { km: 345, hrs: 5 }, "jodhpur-jaipur": { km: 345, hrs: 5 },
  "jaipur-udaipur": { km: 393, hrs: 6 }, "udaipur-jaipur": { km: 393, hrs: 6 },
  "jaipur-jaisalmer": { km: 575, hrs: 9 }, "jaisalmer-jaipur": { km: 575, hrs: 9 },
  "jaipur-bikaner": { km: 330, hrs: 5 }, "bikaner-jaipur": { km: 330, hrs: 5 },
  "jodhpur-jaisalmer": { km: 285, hrs: 4.5 }, "jaisalmer-jodhpur": { km: 285, hrs: 4.5 },
  "jodhpur-udaipur": { km: 250, hrs: 4 }, "udaipur-jodhpur": { km: 250, hrs: 4 },
  "bikaner-jaisalmer": { km: 333, hrs: 5 }, "jaisalmer-bikaner": { km: 333, hrs: 5 },
  "bikaner-jodhpur": { km: 250, hrs: 4 }, "jodhpur-bikaner": { km: 250, hrs: 4 },
  "udaipur-bundi": { km: 164, hrs: 3 }, "bundi-udaipur": { km: 164, hrs: 3 },
  "jaipur-pushkar": { km: 145, hrs: 2.5 }, "pushkar-jaipur": { km: 145, hrs: 2.5 },
  "ajmer-pushkar": { km: 14, hrs: 0.5 }, "pushkar-ajmer": { km: 14, hrs: 0.5 },
  // UP / Varanasi
  "agra-varanasi": { km: 673, hrs: 10 }, "varanasi-agra": { km: 673, hrs: 10 },
  "delhi-varanasi": { km: 840, hrs: 13 }, "varanasi-delhi": { km: 840, hrs: 13 },
  "agra-khajuraho": { km: 395, hrs: 7 }, "khajuraho-agra": { km: 395, hrs: 7 },
  "varanasi-khajuraho": { km: 280, hrs: 5 }, "khajuraho-varanasi": { km: 280, hrs: 5 },
  "varanasi-bodhgaya": { km: 250, hrs: 5 }, "bodhgaya-varanasi": { km: 250, hrs: 5 },
  "agra-orchha": { km: 230, hrs: 4 }, "orchha-agra": { km: 230, hrs: 4 },
  // Himachal / Uttarakhand
  "delhi-shimla": { km: 370, hrs: 8 }, "shimla-delhi": { km: 370, hrs: 8 },
  "delhi-manali": { km: 540, hrs: 12 }, "manali-delhi": { km: 540, hrs: 12 },
  "delhi-rishikesh": { km: 240, hrs: 5 }, "rishikesh-delhi": { km: 240, hrs: 5 },
  "delhi-mussoorie": { km: 290, hrs: 6 }, "mussoorie-delhi": { km: 290, hrs: 6 },
  "rishikesh-mussoorie": { km: 75, hrs: 2 }, "mussoorie-rishikesh": { km: 75, hrs: 2 },
  // Kerala
  "kochi-munnar": { km: 130, hrs: 4 }, "munnar-kochi": { km: 130, hrs: 4 },
  "kochi-thekkady": { km: 190, hrs: 5 }, "thekkady-kochi": { km: 190, hrs: 5 },
  "kochi-kumarakom": { km: 55, hrs: 1.5 }, "kumarakom-kochi": { km: 55, hrs: 1.5 },
  "kochi-alleppey": { km: 53, hrs: 1.5 }, "alleppey-kochi": { km: 53, hrs: 1.5 },
  "kumarakom-thekkady": { km: 75, hrs: 3 }, "thekkady-kumarakom": { km: 75, hrs: 3 },
  "thekkady-munnar": { km: 85, hrs: 3 }, "munnar-thekkady": { km: 85, hrs: 3 },
  "munnar-alleppey": { km: 155, hrs: 5 }, "alleppey-munnar": { km: 155, hrs: 5 },
  "alleppey-kovalam": { km: 155, hrs: 3 }, "kovalam-alleppey": { km: 155, hrs: 3 },
  "kovalam-kochi": { km: 216, hrs: 5 }, "kochi-kovalam": { km: 216, hrs: 5 },
  // Tamil Nadu
  "chennai-pondicherry": { km: 155, hrs: 3 }, "pondicherry-chennai": { km: 155, hrs: 3 },
  "chennai-mahabalipuram": { km: 55, hrs: 1.5 }, "mahabalipuram-chennai": { km: 55, hrs: 1.5 },
  "pondicherry-thanjavur": { km: 210, hrs: 4 }, "thanjavur-pondicherry": { km: 210, hrs: 4 },
  "thanjavur-madurai": { km: 155, hrs: 3 }, "madurai-thanjavur": { km: 155, hrs: 3 },
  "madurai-kochi": { km: 190, hrs: 4 }, "kochi-madurai": { km: 190, hrs: 4 },
  // Amritsar / Punjab
  "delhi-amritsar": { km: 450, hrs: 7 }, "amritsar-delhi": { km: 450, hrs: 7 },
  // Ranthambore / Sawai Madhopur
  "jaipur-ranthambore": { km: 180, hrs: 3 }, "ranthambore-jaipur": { km: 180, hrs: 3 },
  "agra-ranthambore": { km: 235, hrs: 4 }, "ranthambore-agra": { km: 235, hrs: 4 },
};

function normCity(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/é|è|ê/g, "e").replace(/â/g, "a").replace(/î/g, "i").replace(/ô/g, "o").replace(/û/g, "u")
    .replace("pondichéry", "pondicherry").replace("pondichéri", "pondicherry")
    .replace("cochi", "kochi").replace("cochin", "kochi")
    .replace("alleppey", "alleppey").replace("alappuzha", "alleppey")
    .replace("thekkady", "thekkady").replace("periyar", "thekkady")
    .replace("sawaimadhopur", "ranthambore").replace("ranthambhore", "ranthambore");
}

function legDistance(from: string, to: string): LegInfo | null {
  const key = `${normCity(from)}-${normCity(to)}`;
  return DISTANCES[key] ?? null;
}

function formatLegText(info: LegInfo): string {
  const totalMins = Math.round(info.hrs * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${info.km} KMS – ${m} MINS`;
  if (m === 0) return `${info.km} KMS – ${h} HR${h !== 1 ? "S" : ""}`;
  return `${info.km} KMS – ${h} HR${h !== 1 ? "S" : ""} ${m}`;
}

// ---------------------------------------------------------------------------
// Transition sentences — multiple templates per language to avoid repetition
// ---------------------------------------------------------------------------
type TransitionFn = (from: string, to: string, info: LegInfo | null) => string;

const TRAVEL_TEMPLATES: Record<Lang, TransitionFn[]> = {
  fr: [
    (from, to) =>
      `Après le petit-déjeuner, départ par la route en direction de ${to}. À l'arrivée, enregistrement à l'hôtel.`,
    (from, to) =>
      `Ce matin, nous quittons ${from} en direction de ${to}. À l'arrivée, installation à l'hôtel et le reste de la journée est libre pour découvrir les environs.`,
    (_from, to) =>
      `Départ après le petit-déjeuner pour rejoindre ${to}. La route vous offrira de magnifiques paysages avant d'arriver à destination.`,
  ],
  en: [
    (_from, to) =>
      `After breakfast, we drive towards ${to}. On arrival, check in at your hotel and enjoy the rest of the day at leisure.`,
    (from, to) =>
      `This morning we bid farewell to ${from} and make our way to ${to}. On reaching, settle in and spend the afternoon exploring at your own pace.`,
    (_from, to) =>
      `Following breakfast, we depart for ${to}. The scenic drive sets the tone for the experiences that await you.`,
  ],
  de: [
    (_from, to) =>
      `Nach dem Frühstück fahren wir nach ${to}. Bei Ankunft einchecken und den Rest des Tages zur freien Verfügung.`,
    (from, to) =>
      `Wir verlassen ${from} nach dem Frühstück und fahren weiter nach ${to}. Nach der Ankunft haben Sie die Möglichkeit, die Umgebung auf eigene Faust zu erkunden.`,
  ],
};

// Full-day (same city) templates for nightNum > 1
const FULL_DAY_TEMPLATES: Record<Lang, ((city: string) => string)[]> = {
  fr: [
    (c) => `Petit-déjeuner à l'hôtel, puis journée consacrée à la découverte de ${c} et de ses richesses culturelles.`,
    (c) => `Petit-déjeuner à l'hôtel. Nouvelle journée pour explorer les trésors cachés de ${c} à votre rythme.`,
    (c) => `Après le petit-déjeuner, découverte approfondie de ${c} et de ses nombreux trésors historiques.`,
  ],
  en: [
    (c) => `After breakfast, a full day dedicated to exploring the many wonders of ${c} at your leisure.`,
    (c) => `Breakfast at the hotel, followed by a full day to immerse ourselves in the culture and heritage of ${c}.`,
    (c) => `After breakfast, another day in ${c} to uncover its hidden gems and iconic landmarks.`,
  ],
  de: [
    (c) => `Nach dem Frühstück ein ganzer Tag zur Erkundung der vielen Sehenswürdigkeiten von ${c}.`,
    (c) => `Frühstück im Hotel, danach den gesamten Tag, um die Kultur und Geschichte von ${c} zu erleben.`,
  ],
};

function pickTransition(templates: TransitionFn[], dayIndex: number, from: string, to: string, info: LegInfo | null): string {
  return templates[dayIndex % templates.length](from, to, info);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MEAL_PARTS: Record<Lang, { b: string; l: string; d: string; night: string }> = {
  fr: { b: "petit-déjeuner", l: "déjeuner", d: "dîner", night: "Nuit à l'hôtel." },
  en: { b: "breakfast", l: "lunch", d: "dinner", night: "Night at the hotel." },
  de: { b: "Frühstück", l: "Mittagessen", d: "Abendessen", night: "Übernachtung im Hotel." },
};

function closingLine(meals: MealFlags, lang: Lang): string {
  const m = MEAL_PARTS[lang];
  const included = [
    meals.b && m.b,
    meals.l && m.l,
    meals.d && m.d,
  ].filter(Boolean) as string[];

  if (included.length === 0) return m.night;

  const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);
  const parts = [cap(included[0]), ...included.slice(1)].join(", ");

  if (lang === "fr") return `${parts} et nuit à l'hôtel.`;
  if (lang === "en") return `${parts} and night at the hotel.`;
  return `${parts} und Übernachtung im Hotel.`;
}

function mealPlanText(stops: DayStopInput[], lang: Lang): string {
  const allB = stops.every((s) => s.meals.b);
  const allL = stops.every((s) => s.meals.l);
  const allD = stops.every((s) => s.meals.d);

  if (lang === "fr") {
    if (allB && allL && allD) return "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS";
    if (allB && allD) return "SÉJOUR EN DEMI-PENSION – PETIT-DÉJEUNER ET DÎNER INCLUS";
    if (allB) return "SÉJOUR EN CHAMBRE ET PETIT-DÉJEUNER INCLUS";
    return "SÉJOUR SANS REPAS INCLUS";
  }
  if (lang === "en") {
    if (allB && allL && allD) return "FULL BOARD – BREAKFAST, LUNCH AND DINNER INCLUDED";
    if (allB && allD) return "HALF BOARD – BREAKFAST AND DINNER INCLUDED";
    if (allB) return "BED AND BREAKFAST INCLUDED";
    return "ROOM ONLY";
  }
  if (allB && allL && allD) return "VOLLPENSION – FRÜHSTÜCK, MITTAGESSEN UND ABENDESSEN INKLUSIVE";
  if (allB && allD) return "HALBPENSION – FRÜHSTÜCK UND ABENDESSEN INKLUSIVE";
  if (allB) return "ÜBERNACHTUNG MIT FRÜHSTÜCK INKLUSIVE";
  return "ÜBERNACHTUNG OHNE MAHLZEITEN";
}

// Day-title strings per language
const ARRIVAL: Record<Lang, (c: string) => string> = {
  fr: (c) => `ARRIVÉE À ${c}`,
  en: (c) => `ARRIVAL IN ${c}`,
  de: (c) => `ANKUNFT IN ${c}`,
};
const FULL_DAY: Record<Lang, (c: string) => string> = {
  fr: (c) => `JOURNÉE À ${c}`,
  en: (c) => `FULL DAY IN ${c}`,
  de: (c) => `GANZTAG IN ${c}`,
};

// ---------------------------------------------------------------------------
// Wikipedia: auto-fetch thumbnail for sights without images
// ---------------------------------------------------------------------------
async function fetchWikipediaImage(title: string): Promise<string | null> {
  // Try multiple slugifications: original, and a simplified English-friendly version
  const candidates = [
    title,
    // Try simplified form: strip French articles, collapse spaces
    title.replace(/ de /gi, " ").replace(/ d'/gi, " ").replace(/ l'/gi, " ").replace(/\s+/g, " ").trim(),
    // Try with comma (e.g. "City Palace Jaipur" → "City Palace, Jaipur")
    title.replace(/ de /gi, ", ").replace(/ d'/gi, " d'").replace(/\s+/g, " ").trim(),
  ].filter((t, i, arr) => arr.indexOf(t) === i) // dedupe
   .map((t) => t.replace(/\s+/g, "_"));

  for (const slug of candidates) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { thumbnail?: { source?: string } };
      const src = data?.thumbnail?.source;
      if (src) return src;
    } catch {
      // ignore timeout or network errors, try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Claude: fill missing descriptions
// ---------------------------------------------------------------------------
interface DescNeeded {
  key: string;
  type: "hotel" | "city" | "sight" | "activity";
  name: string;
  city?: string;
}

async function fillDescriptions(needed: DescNeeded[], lang: Lang): Promise<Record<string, string>> {
  if (needed.length === 0 || !hasAi()) return {};

  const langName = lang === "fr" ? "French" : lang === "en" ? "English" : "German";
  const list = needed
    .map((n) => `- key "${n.key}": ${n.type} "${n.name}"${n.city ? ` in ${n.city}` : ""}`)
    .join("\n");

  const prompt = `You are a travel writer specialising in Indian subcontinent itineraries.
Write short, vivid descriptions in ${langName} for the following places.
Each description should be 2–3 sentences, evocative and informative, in the style of a luxury travel brochure.
Return ONLY valid JSON with each key mapping to its description string.
Do not add any extra text or explanation outside the JSON.

Places needed:
${list}`;

  try {
    const client = getClient();
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg);
    return parseJson<Record<string, string>>(raw);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main assembly
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let input: AssembleInput;
  try {
    input = (await req.json()) as AssembleInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { client, lang, nights, days, dates, startDate, dayStops } = input;

  // Pre-compute per-day weekday (0=Sun…6=Sat) when a start date is supplied
  const startMs = startDate ? Date.parse(startDate) : NaN;
  const dayWeekday = (idx: number): number | null => {
    if (isNaN(startMs)) return null;
    return new Date(startMs + idx * 86_400_000).getDay();
  };
  if (!dayStops || dayStops.length === 0) {
    return NextResponse.json({ error: "At least one day stop is required." }, { status: 400 });
  }

  // --- Collect what needs descriptions from Claude -------------------------
  const needed: DescNeeded[] = [];
  const seenCities = new Set<string>();

  for (const stop of dayStops) {
    if (!seenCities.has(stop.cityName)) {
      seenCities.add(stop.cityName);
      needed.push({ key: `city__${stop.cityName}`, type: "city", name: stop.cityName });
    }
    if (stop.hotel && !stop.hotel.description) {
      needed.push({
        key: `hotel__${stop.hotel.id}`,
        type: "hotel",
        name: stop.hotel.name,
        city: stop.cityName,
      });
    }
    for (const s of stop.sights) {
      if (!s.description) {
        needed.push({ key: `sight__${s.id}`, type: "sight", name: s.title, city: stop.cityName });
      }
    }
    for (const a of stop.activities) {
      if (!a.description) {
        needed.push({ key: `act__${a.id}`, type: "activity", name: a.title, city: stop.cityName });
      }
    }
  }

  const generated = await fillDescriptions(needed, lang);

  // --- Auto-fetch Wikipedia images for sights without one -----------------
  // Collect unique sights that need images, then fetch in parallel
  const sightsNeedingImages: { id: string; title: string }[] = [];
  const seenSightIds = new Set<string>();
  for (const stop of dayStops) {
    for (const s of [...stop.sights, ...stop.activities]) {
      if (!s.image && !seenSightIds.has(s.id)) {
        seenSightIds.add(s.id);
        sightsNeedingImages.push({ id: s.id, title: s.title });
      }
    }
  }
  const wikiImages: Record<string, string> = {};
  if (sightsNeedingImages.length > 0) {
    const results = await Promise.all(
      sightsNeedingImages.map(async ({ id, title }) => {
        const url = await fetchWikipediaImage(title);
        return { id, url };
      })
    );
    for (const { id, url } of results) {
      if (url) wikiImages[id] = url;
    }
  }

  // --- Build one DayBlock per dayStop -------------------------------------
  const dayBlocks: DayBlock[] = [];
  let travelDayIndex = 0; // tracks which travel-sentence template to use

  for (let i = 0; i < dayStops.length; i++) {
    const stop = dayStops[i];
    const prevStop = i > 0 ? dayStops[i - 1] : null;
    const dayNum = i + 1;

    // Day title logic:
    // - Continuing in same city (nightNum > 1) → JOURNÉE À CITY
    // - First stop overall → ARRIVÉE À CITY
    // - Moving to a new city → PREV – CITY
    let title: string;
    const cityUp = stop.cityName.toUpperCase();
    if (stop.nightNum > 1) {
      title = FULL_DAY[lang](cityUp);
    } else if (i === 0) {
      title = ARRIVAL[lang](cityUp);
    } else {
      const prevCityUp = prevStop!.cityName.toUpperCase();
      title = `${prevCityUp} – ${cityUp}`;
    }

    // Hotel
    const hotelDesc = stop.hotel?.description || generated[`hotel__${stop.hotel?.id}`] || undefined;
    const hotel = stop.hotel
      ? {
          name: stop.hotel.name,
          url: stop.hotelUrl || stop.hotel.url || undefined,
          category: stop.hotel.category || undefined,
          description: hotelDesc,
          label: lang === "fr" ? "VOTRE HÔTEL" : lang === "en" ? "YOUR HOTEL" : "IHR HOTEL",
        }
      : undefined;

    // Sights + activities merged — include auto-fetched Wikipedia images
    const sightBlocks: Sight[] = [
      ...stop.sights.map((s) => ({
        id: s.id,
        title: s.title.toUpperCase(),
        image: s.image ?? (wikiImages[s.id] ? { url: wikiImages[s.id], caption: s.title } : undefined),
        description: s.description || generated[`sight__${s.id}`] || "",
        enRoute: s.enRoute ?? false,
      })),
      ...stop.activities.map((a) => ({
        id: a.id,
        title: a.title.toUpperCase(),
        image: a.image ?? (wikiImages[a.id] ? { url: wikiImages[a.id], caption: a.title } : undefined),
        description: a.description || generated[`act__${a.id}`] || "",
        enRoute: a.enRoute ?? false,
      })),
    ];

    // Distance info + leg (computed first so intro can reference it)
    const distInfo = prevStop && prevStop.cityName !== stop.cityName
      ? legDistance(prevStop.cityName, stop.cityName)
      : null;
    const leg =
      prevStop && prevStop.cityName !== stop.cityName
        ? {
            fromCity: prevStop.cityName,
            toCity: stop.cityName,
            text: distInfo ? formatLegText(distInfo) : "",
          }
        : undefined;

    // City intro: transition sentence for travel days, then Claude city description
    let intro: string | undefined;
    if (stop.nightNum === 1 && prevStop && prevStop.cityName !== stop.cityName) {
      const transitSentence = pickTransition(TRAVEL_TEMPLATES[lang], travelDayIndex, prevStop.cityName, stop.cityName, distInfo);
      travelDayIndex++;
      const cityDesc = generated[`city__${stop.cityName}`];
      intro = cityDesc ? `${transitSentence}\n\n${cityDesc}` : transitSentence;
    } else if (stop.nightNum === 1) {
      intro = generated[`city__${stop.cityName}`] || undefined;
    } else {
      // Full-day (same city, nightNum > 1): use varied full-day sentences
      const fullDayTemplates = FULL_DAY_TEMPLATES[lang];
      const sentence = fullDayTemplates[(stop.nightNum - 2) % fullDayTemplates.length](stop.cityName);
      const cityDesc = generated[`city__${stop.cityName}`];
      intro = cityDesc ? `${sentence}\n\n${cityDesc}` : sentence;
    }

    // Closure-day warnings
    const weekday = dayWeekday(i);
    const closureWarnings: string[] = [];
    if (weekday !== null) {
      const dayName = WEEKDAY_NAMES[weekday];
      for (const s of [...stop.sights, ...stop.activities]) {
        const info = getClosureInfo(s.title);
        if (info && info.closedDays.includes(weekday)) {
          closureWarnings.push(`${s.title} — closed on ${dayName}s. ${info.note}`);
        }
      }
    }

    const block: DayBlock = {
      id: randomUUID(),
      dayLabel: `JOUR ${dayNum}`,
      title,
      city: cityUp,
      leg,
      hotel,
      cityImage: getCityImage(stop.cityName),
      intro,
      sights: sightBlocks,
      closureWarnings: closureWarnings.length > 0 ? closureWarnings : undefined,
      closing: closingLine(stop.meals, lang),
    };

    dayBlocks.push(block);
  }

  // --- Highlights (up to 8, first 2 sights per unique city) ---------------
  const highlights: string[] = [];
  const highlightPrefixes: Record<Lang, (t: string) => string> = {
    fr: (t) => `Visite de ${t.replace(/^(le |la |les |l'|un |une )/i, "").trim()}`,
    en: (t) => `Visit to ${t}`,
    de: (t) => `Besuch von ${t}`,
  };
  const addHighlight = highlightPrefixes[lang];
  const seenHighlightCities = new Set<string>();

  for (const stop of dayStops) {
    const cityKey = stop.cityName;
    const sightsForCity = seenHighlightCities.has(cityKey) ? [] : stop.sights.slice(0, 2);
    seenHighlightCities.add(cityKey);
    for (const s of sightsForCity) {
      if (highlights.length >= 8) break;
      highlights.push(addHighlight(s.title));
    }
    if (highlights.length >= 8) break;
  }

  // --- Trip summary -------------------------------------------------------
  const firstStop = dayStops[0];
  const lastStop = dayStops[dayStops.length - 1];

  const tripSummary: TripSummary = {
    origin: lang === "fr" ? "FRANCE" : lang === "de" ? "DEUTSCHLAND" : "ORIGIN",
    arrivalCity: firstStop.cityName.toUpperCase(),
    departureCity: lastStop.cityName.toUpperCase(),
    finalDestination: lang === "fr" ? "FRANCE" : lang === "de" ? "DEUTSCHLAND" : "ORIGIN",
    dates: dates || undefined,
    nights,
    days,
    mealPlan: mealPlanText(dayStops, lang),
  };

  // --- Route cities (unique, in order) ------------------------------------
  const routeCities: string[] = [];
  for (const stop of dayStops) {
    const up = stop.cityName.toUpperCase();
    if (routeCities[routeCities.length - 1] !== up) routeCities.push(up);
  }

  // --- Assemble -----------------------------------------------------------
  const itinerary: Itinerary = {
    outputLanguage: lang,
    preparedFor: client,
    tripSummary,
    routeCities,
    flightLegs: [],
    highlights,
    days: dayBlocks,
  };

  // --- AI Review (Claude reads and verifies) ------------------------------
  const review = await reviewItinerary(itinerary, dayStops, lang);

  return NextResponse.json({ itinerary, review });
}

// ---------------------------------------------------------------------------
// Claude final review
// ---------------------------------------------------------------------------
export interface ReviewNote {
  type: "warning" | "info" | "ok";
  scope: string; // e.g. "JOUR 3" or "Overall"
  message: string;
}

async function reviewItinerary(
  it: Itinerary,
  stops: DayStopInput[],
  lang: Lang,
): Promise<ReviewNote[]> {
  // Always include structural checks (no AI needed)
  const notes: ReviewNote[] = [];

  // 1. Closure warnings from day blocks
  for (const d of it.days) {
    for (const w of d.closureWarnings ?? []) {
      notes.push({ type: "warning", scope: d.dayLabel, message: w });
    }
  }

  // 2. Days with no sights or activities
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.sights.length === 0 && s.activities.length === 0) {
      notes.push({
        type: "info",
        scope: `JOUR ${i + 1}`,
        message: `No sights or activities scheduled in ${s.cityName}.`,
      });
    }
  }

  // 3. Days with no hotel
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s.hotel) {
      notes.push({ type: "info", scope: `JOUR ${i + 1}`, message: `No hotel selected for ${s.cityName}.` });
    }
  }

  // 4. Claude reads the full day sequence for logical issues
  if (!hasAi()) return notes;

  const daysSummary = it.days
    .map((d, i) => {
      const stop = stops[i];
      const sights = stop ? [...stop.sights, ...stop.activities].map((s) => s.title).join(", ") || "none" : "none";
      return `${d.dayLabel}: ${d.title} — sights: ${sights}`;
    })
    .join("\n");

  const prompt = `You are a senior India travel expert reviewing a ${lang === "fr" ? "French" : lang === "en" ? "English" : "German"}-language itinerary.

ROUTING & DAY SEQUENCE:
${daysSummary}

Review this itinerary critically. Return a JSON array of up to 8 notes. Each note must be:
{ "type": "warning"|"info"|"ok", "scope": "JOUR N or Overall", "message": "concise English text" }

Flag:
- Unrealistic distance in one day (e.g. > 400 km without noting it)
- Famous must-see sight missing for a key city (Taj Mahal in Agra, Amber Fort in Jaipur, etc.)
- Same sight repeated across days
- Very long stays in a minor city with nothing to do
- Logical routing issues (backtracking unnecessarily)
- Positive confirmation if routing looks solid (type: "ok", scope: "Overall")

Return ONLY a valid JSON array, no other text.`;

  try {
    const client = getClient();
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const aiNotes = parseJson<ReviewNote[]>(textOf(msg));
    if (Array.isArray(aiNotes)) {
      notes.push(...aiNotes.filter((n) => n && n.type && n.scope && n.message));
    }
  } catch { /* ignore AI errors — structural notes already collected */ }

  return notes;
}

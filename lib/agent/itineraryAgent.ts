import "server-only";
import { randomUUID } from "node:crypto";
import type {
  DayBlock,
  Hotel,
  Itinerary,
  Lang,
  Leg,
  Sight,
  TripSummary,
} from "@/lib/itinerary/types";
import type { LibActivity, LibCity, LibHotel, LibSight } from "@/lib/library-types";
import {
  listCities,
  listHotels,
  listSights,
  listActivities,
  getCityImage,
} from "@/lib/library.server";
import { generateJson, hasAiProvider, MissingAiProviderError } from "@/lib/ai/gemini";
import { getClosureInfo, WEEKDAY_NAMES } from "@/lib/closureDays";
import { mapsDirectionsUrl } from "@/lib/itinerary/types";

// ---------------------------------------------------------------------------
// Public input / output
// ---------------------------------------------------------------------------

export interface AgentTripInput {
  client: string;
  lang: Lang;
  startCity: string;
  endCity: string;
  totalNights: number;
  arrivalDate: string; // ISO, e.g. "2027-04-11"
  style: "culture" | "nature" | "luxury" | "family" | "adventure" | "romantic";
  budget: "standard" | "premium" | "luxury";
  travelers: number;
  notes?: string;
}

export interface AgentResult {
  itinerary: Itinerary;
}

// ---------------------------------------------------------------------------
// Road distance lookup (same data as assemble/route.ts)
// ---------------------------------------------------------------------------

interface LegInfo { km: number; hrs: number }

const DISTANCES: Record<string, LegInfo> = {
  "delhi-agra": { km: 233, hrs: 3.5 }, "agra-delhi": { km: 233, hrs: 3.5 },
  "delhi-jaipur": { km: 280, hrs: 5 }, "jaipur-delhi": { km: 280, hrs: 5 },
  "agra-jaipur": { km: 232, hrs: 4 }, "jaipur-agra": { km: 232, hrs: 4 },
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
  "agra-varanasi": { km: 673, hrs: 10 }, "varanasi-agra": { km: 673, hrs: 10 },
  "delhi-varanasi": { km: 840, hrs: 13 }, "varanasi-delhi": { km: 840, hrs: 13 },
  "agra-khajuraho": { km: 395, hrs: 7 }, "khajuraho-agra": { km: 395, hrs: 7 },
  "varanasi-khajuraho": { km: 280, hrs: 5 }, "khajuraho-varanasi": { km: 280, hrs: 5 },
  "varanasi-bodhgaya": { km: 250, hrs: 5 }, "bodhgaya-varanasi": { km: 250, hrs: 5 },
  "agra-orchha": { km: 230, hrs: 4 }, "orchha-agra": { km: 230, hrs: 4 },
  "delhi-shimla": { km: 370, hrs: 8 }, "shimla-delhi": { km: 370, hrs: 8 },
  "delhi-manali": { km: 540, hrs: 12 }, "manali-delhi": { km: 540, hrs: 12 },
  "delhi-rishikesh": { km: 240, hrs: 5 }, "rishikesh-delhi": { km: 240, hrs: 5 },
  "delhi-mussoorie": { km: 290, hrs: 6 }, "mussoorie-delhi": { km: 290, hrs: 6 },
  "rishikesh-mussoorie": { km: 75, hrs: 2 }, "mussoorie-rishikesh": { km: 75, hrs: 2 },
  "kochi-munnar": { km: 130, hrs: 4 }, "munnar-kochi": { km: 130, hrs: 4 },
  "kochi-thekkady": { km: 190, hrs: 5 }, "thekkady-kochi": { km: 190, hrs: 5 },
  "kochi-kumarakom": { km: 55, hrs: 1.5 }, "kumarakom-kochi": { km: 55, hrs: 1.5 },
  "kochi-alleppey": { km: 53, hrs: 1.5 }, "alleppey-kochi": { km: 53, hrs: 1.5 },
  "kumarakom-thekkady": { km: 75, hrs: 3 }, "thekkady-kumarakom": { km: 75, hrs: 3 },
  "thekkady-munnar": { km: 85, hrs: 3 }, "munnar-thekkady": { km: 85, hrs: 3 },
  "munnar-alleppey": { km: 155, hrs: 5 }, "alleppey-munnar": { km: 155, hrs: 5 },
  "alleppey-kovalam": { km: 155, hrs: 3 }, "kovalam-alleppey": { km: 155, hrs: 3 },
  "kovalam-kochi": { km: 216, hrs: 5 }, "kochi-kovalam": { km: 216, hrs: 5 },
  "chennai-pondicherry": { km: 155, hrs: 3 }, "pondicherry-chennai": { km: 155, hrs: 3 },
  "chennai-mahabalipuram": { km: 55, hrs: 1.5 }, "mahabalipuram-chennai": { km: 55, hrs: 1.5 },
  "pondicherry-thanjavur": { km: 210, hrs: 4 }, "thanjavur-pondicherry": { km: 210, hrs: 4 },
  "thanjavur-madurai": { km: 155, hrs: 3 }, "madurai-thanjavur": { km: 155, hrs: 3 },
  "madurai-kochi": { km: 190, hrs: 4 }, "kochi-madurai": { km: 190, hrs: 4 },
  "delhi-amritsar": { km: 450, hrs: 7 }, "amritsar-delhi": { km: 450, hrs: 7 },
  "jaipur-ranthambore": { km: 180, hrs: 3 }, "ranthambore-jaipur": { km: 180, hrs: 3 },
  "agra-ranthambore": { km: 235, hrs: 4 }, "ranthambore-agra": { km: 235, hrs: 4 },
};

function normCity(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/é|è|ê/g, "e").replace(/â/g, "a").replace(/î/g, "i").replace(/ô/g, "o").replace(/û/g, "u")
    .replace("pondichéry", "pondicherry").replace("pondichéri", "pondicherry")
    .replace("cochi", "kochi").replace("cochin", "kochi")
    .replace("alappuzha", "alleppey")
    .replace("periyar", "thekkady")
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
// Date / weekday helpers
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): Date {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatPdfDate(d: Date, lang: Lang): string {
  const monthsFr = ["JAN", "FÉV", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];
  const monthsEn = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const months = lang === "fr" ? monthsFr : monthsEn;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = months[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day} ${month}'${year}`;
}

function weekdayName(d: Date, lang: Lang): string {
  if (lang === "fr") {
    const names = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    return names[d.getUTCDay()];
  }
  if (lang === "de") {
    const names = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    return names[d.getUTCDay()];
  }
  return WEEKDAY_NAMES[d.getUTCDay()];
}

// ---------------------------------------------------------------------------
// Library querying
// ---------------------------------------------------------------------------

interface LibraryContext {
  cities: LibCity[];
  hotels: LibHotel[];
  sights: LibSight[];
  activities: LibActivity[];
}

function loadLibrary(lang: Lang): LibraryContext {
  return {
    cities: listCities(undefined, lang),
    hotels: listHotels(undefined, lang),
    sights: listSights(undefined, lang),
    activities: listActivities(undefined, lang),
  };
}

function summarizeLibrary(lib: LibraryContext): string {
  const cityLines = lib.cities.map((c) => `- ${c.name}${c.country ? ` (${c.country})` : ""}`).join("\n");
  const hotelLines = lib.hotels.map((h) => `- ${h.name}${h.city ? ` [${h.city}]` : ""}${h.category ? ` — ${h.category}` : ""}`).join("\n");
  const sightLines = lib.sights.map((s) => `- ${s.title}${s.city ? ` [${s.city}]` : ""}`).join("\n");
  const activityLines = lib.activities.map((a) => `- ${a.title}${a.city ? ` [${a.city}]` : ""}`).join("\n");
  return [
    "CITIES:\n" + (cityLines || "(none)"),
    "\nHOTELS:\n" + (hotelLines || "(none)"),
    "\nSIGHTS:\n" + (sightLines || "(none)"),
    "\nACTIVITIES:\n" + (activityLines || "(none)"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Post-processing: merge library images, closure warnings, leg distances
// ---------------------------------------------------------------------------

function findHotel(lib: LibraryContext, name: string, city?: string): LibHotel | undefined {
  const n = name.toLowerCase().trim();
  const c = city?.toLowerCase().trim();
  return lib.hotels.find((h) => {
    const matchName = h.name.toLowerCase().trim() === n;
    const matchCity = !c || !h.city || h.city.toLowerCase().trim() === c;
    return matchName && matchCity;
  });
}

function findSight(lib: LibraryContext, title: string, city?: string): LibSight | undefined {
  const t = title.toLowerCase().trim();
  const c = city?.toLowerCase().trim();
  return [...lib.sights, ...lib.activities].find((s) => {
    const matchTitle = s.title.toLowerCase().trim() === t;
    const matchCity = !c || !s.city || s.city.toLowerCase().trim() === c;
    return matchTitle && matchCity;
  });
}

function backfillImages(it: Itinerary, lib: LibraryContext): Itinerary {
  const days = it.days.map((d) => {
    const cityImg = d.cityImage || getCityImage(d.city) || undefined;
    const hotel = d.hotel
      ? { ...d.hotel, image: d.hotel.image || findHotel(lib, d.hotel.name, d.city)?.image }
      : undefined;
    const sights = d.sights.map((s) => ({
      ...s,
      image: s.image || findSight(lib, s.title, d.city)?.image,
    }));
    return { ...d, cityImage: cityImg, hotel, sights };
  });
  return { ...it, days };
}

function addLegsAndClosures(it: Itinerary, input: AgentTripInput): Itinerary {
  const days = it.days.map((d, i) => {
    const date = input.arrivalDate ? addDays(input.arrivalDate, i) : undefined;
    const weekday = date?.getUTCDay();

    // Add or correct leg distance
    let leg: Leg | undefined = d.leg;
    if (i > 0 && d.city !== it.days[i - 1].city) {
      const fromCity = it.days[i - 1].city;
      const toCity = d.city;
      const info = legDistance(fromCity, toCity);
      leg = {
        fromCity,
        toCity,
        text: info ? formatLegText(info) : d.leg?.text || "",
        mapsUrl: mapsDirectionsUrl(fromCity, toCity),
      };
    }

    // Closure warnings
    const closureWarnings: string[] = [];
    if (weekday !== undefined) {
      for (const s of d.sights) {
        const info = getClosureInfo(s.title);
        if (info && info.closedDays.includes(weekday)) {
          const dayName = weekdayName(date!, input.lang);
          const prefix = input.lang === "fr"
            ? `${s.title} — fermé le ${dayName}. ${info.note}`
            : input.lang === "de"
            ? `${s.title} — geschlossen am ${dayName}. ${info.note}`
            : `${s.title} — closed on ${dayName}s. ${info.note}`;
          closureWarnings.push(prefix);
        }
      }
    }

    return {
      ...d,
      leg,
      date: d.date || (date ? formatPdfDate(date, input.lang) : undefined),
      closureWarnings: closureWarnings.length > 0 ? closureWarnings : d.closureWarnings,
    };
  });
  return { ...it, days };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an expert luxury-travel itinerary writer for the Indian subcontinent.
Your job is to produce a complete travel itinerary in a specific JSON format.

Rules:
1. Use the supplied content library as much as possible for cities, hotels, sights and activities.
2. If the library is missing a needed entry, you may invent a plausible one with a vivid description.
3. Pick a logical route from the start city to the end city. Distribute the total nights across cities in a sensible way (usually 1–3 nights per city).
4. IMPORTANT: The trip has TOTAL NIGHTS = N. You must generate exactly N + 1 day blocks (Day 1 is arrival, then one day per remaining night, ending with the departure day).
5. Use internal flight legs only when the distance between two cities is very large (> 500 km) or when the route jumps regions.
6. Each day must have 2–5 sightseeing/activity entries with evocative descriptions.
7. Each city must use exactly ONE hotel name. Do not combine multiple hotels with "and", ",", or "/". Pick a single real hotel name.
8. Descriptions should read like a luxury travel brochure: 2–5 sentences, rich and evocative.
9. All text must be in the requested language (French or English). Keep French accents correct.
10. The output must be valid JSON only — no markdown, no commentary.`;
}

function buildUserPrompt(input: AgentTripInput, lib: LibraryContext): string {
  const languageName = input.lang === "fr" ? "French" : input.lang === "en" ? "English" : "German";
  const endDate = input.arrivalDate
    ? addDays(input.arrivalDate, input.totalNights)
    : undefined;
  const datesLabel = input.arrivalDate && endDate
    ? `${formatPdfDate(addDays(input.arrivalDate, 0), input.lang)} – ${formatPdfDate(endDate, input.lang)}`
    : "";

  return `Build a luxury travel itinerary in ${languageName} for:

CLIENT: ${input.client}
TRAVELERS: ${input.travelers}
STYLE: ${input.style}
BUDGET TIER: ${input.budget}
START CITY: ${input.startCity}
END CITY: ${input.endCity}
TOTAL NIGHTS: ${input.totalNights}
ARRIVAL DATE: ${input.arrivalDate || "not specified"}
TRIP DATES LABEL: ${datesLabel}
${input.notes ? `EXTRA NOTES: ${input.notes}` : ""}

AVAILABLE CONTENT LIBRARY:
${summarizeLibrary(lib)}

Return a JSON object that exactly matches this schema:

{
  "outputLanguage": "${input.lang}",
  "preparedFor": "${input.client}",
  "tripSummary": {
    "origin": "FRANCE or ORIGIN",
    "arrivalCity": "START CITY UPPERCASE",
    "departureCity": "END CITY UPPERCASE",
    "finalDestination": "FRANCE or ORIGIN",
    "dates": "e.g. 11 – 22 AVRIL 2027",
    "nights": number,
    "days": nights + 1,
    "mealPlan": "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS" (or equivalent in English)
  },
  "routeCities": ["CITY1", "CITY2", ...],
  "flightLegs": ["CITY / CITY"],
  "highlights": ["6–10 short bullet highlights in the document language"],
  "days": [
    {
      "dayLabel": "JOUR 1",
      "date": "17 DEC'26",
      "title": "ARRIVÉE À DELHI or DELHI – AGRA or JOURNÉE À DELHI",
      "city": "DELHI",
      "weather": "MÉTÉO: DELHI | 6–23°C | CIEL CLAIR | LEVER: 07H10 | COUCHER: 17H27",
      "intro": "1–2 paragraph introduction to the day/city",
      "hotel": {
        "name": "Hotel Name",
        "category": "HERITAGE ROOM",
        "description": "Niché au cœur... style paragraph",
        "label": "VOTRE HÔTEL"
      },
      "sights": [
        {
          "title": "SIGHT TITLE UPPERCASE",
          "description": "2–5 sentence evocative description",
          "enRoute": false
        }
      ],
      "closing": "Dîner et nuit à l'hôtel."
    }
  ]
}

Formatting rules:
- Generate EXACTLY ${input.totalNights + 1} day blocks, labeled JOUR 1 through JOUR ${input.totalNights + 1}.
- dayLabel must be "JOUR N" (or "DAY N" for English).
- title for day 1: "ARRIVÉE À {city}" (or "ARRIVAL IN {city}"); for travel days between cities: "{from} – {to}"; for extra nights in the same city: "JOURNÉE À {city}" (or "FULL DAY IN {city}").
- city, routeCities and flightLegs values must be UPPERCASE.
- Each city must have exactly ONE hotel name. Do not combine names like "Hotel A and Hotel B".
- weather line must include plausible temperature range, condition, sunrise and sunset for the date and city.
- closing line must mention meals in the document language (e.g. "Dîner et nuit à l'hôtel.", "Breakfast and night at the hotel.")
- descriptions should be vivid, 2–5 sentences, brochure style.
- highlights should be 6–10 short bullets like "Visite du Taj Mahal" / "Visit to the Taj Mahal".

Produce the complete itinerary now.`;
}

// ---------------------------------------------------------------------------
// Defaults / validation
// ---------------------------------------------------------------------------

/**
 * Clean up hotel names that accidentally combine multiple hotels.
 * e.g. "Dera Rawatsar and Dilip Kothi and Fort Barli" → "Dera Rawatsar"
 */
function cleanHotelName(name: string): string {
  if (!name) return name;
  // Split on common conjunctions/punctuation and take the first segment
  const separators = /\s+(?:and|et|und|or|ou|oder)\s+|\s*[,/]\s*/i;
  const first = name.split(separators)[0].trim();
  return first || name;
}

function normalizeItinerary(it: Itinerary, input: AgentTripInput): Itinerary {
  const days = (it.days || []).map((d, i) => {
    const dayLabel = d.dayLabel || `JOUR ${i + 1}`;
    const city = (d.city || input.startCity).toUpperCase();
    const title = d.title || (i === 0 ? `ARRIVÉE À ${city}` : `JOURNÉE À ${city}`);
    const sights: Sight[] = (d.sights || []).map((s, j) => ({
      id: s.id || randomUUID(),
      title: s.title?.toUpperCase() || `SIGHT ${j + 1}`,
      description: s.description || "",
      image: s.image,
      enRoute: s.enRoute ?? false,
    }));
    const hotel: Hotel | undefined = d.hotel
      ? {
          name: cleanHotelName(d.hotel.name) || "Hôtel",
          url: d.hotel.url,
          category: d.hotel.category,
          description: d.hotel.description,
          image: d.hotel.image,
          label: d.hotel.label || (input.lang === "fr" ? "VOTRE HÔTEL" : input.lang === "en" ? "YOUR HOTEL" : "IHR HOTEL"),
        }
      : undefined;
    return {
      ...d,
      id: d.id || randomUUID(),
      dayLabel,
      title,
      city,
      sights,
      hotel,
      intro: d.intro || undefined,
      closing: d.closing || (input.lang === "fr" ? "Nuit à l'hôtel." : input.lang === "en" ? "Night at the hotel." : "Übernachtung im Hotel."),
    };
  });

  const tripSummary: TripSummary = {
    origin: it.tripSummary?.origin || (input.lang === "fr" ? "FRANCE" : input.lang === "de" ? "DEUTSCHLAND" : "ORIGIN"),
    arrivalCity: it.tripSummary?.arrivalCity || input.startCity.toUpperCase(),
    departureCity: it.tripSummary?.departureCity || input.endCity.toUpperCase(),
    finalDestination: it.tripSummary?.finalDestination || (input.lang === "fr" ? "FRANCE" : input.lang === "de" ? "DEUTSCHLAND" : "ORIGIN"),
    dates: it.tripSummary?.dates || datesLabel(input),
    nights: it.tripSummary?.nights ?? input.totalNights,
    days: days.length || (it.tripSummary?.days ?? input.totalNights + 1),
    mealPlan: it.tripSummary?.mealPlan || defaultMealPlan(input.lang),
  };

  return {
    outputLanguage: input.lang,
    preparedFor: it.preparedFor || input.client,
    tripSummary,
    routeCities: it.routeCities?.length ? it.routeCities : days.map((d) => d.city),
    flightLegs: it.flightLegs || [],
    highlights: it.highlights?.length ? it.highlights : deriveHighlights(days, input.lang),
    days,
  };
}

function datesLabel(input: AgentTripInput): string {
  if (!input.arrivalDate) return "";
  const end = addDays(input.arrivalDate, input.totalNights);
  return `${formatPdfDate(addDays(input.arrivalDate, 0), input.lang)} – ${formatPdfDate(end, input.lang)}`;
}

function defaultMealPlan(lang: Lang): string {
  if (lang === "fr") return "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS";
  if (lang === "en") return "FULL BOARD – BREAKFAST, LUNCH AND DINNER INCLUDED";
  return "VOLLPENSION – FRÜHSTÜCK, MITTAGESSEN UND ABENDESSEN INKLUSIVE";
}

function deriveHighlights(days: DayBlock[], lang: Lang): string[] {
  const prefix = lang === "fr" ? "Visite de " : lang === "en" ? "Visit to " : "Besuch von ";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of days) {
    for (const s of d.sights) {
      const key = s.title.toLowerCase();
      if (!seen.has(key) && out.length < 8) {
        seen.add(key);
        out.push(`${prefix}${s.title.replace(/EN ROUTE :\s*/i, "").trim()}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildItinerary(input: AgentTripInput): Promise<AgentResult> {
  if (!hasAiProvider()) {
    throw new MissingAiProviderError();
  }

  const lib = loadLibrary(input.lang);

  const raw = await generateJson<Itinerary>(
    buildSystemPrompt(),
    buildUserPrompt(input, lib)
  );

  let it = normalizeItinerary(raw, input);
  it = backfillImages(it, lib);
  it = addLegsAndClosures(it, input);

  // Ensure route cities are unique and in order
  const routeCities: string[] = [];
  for (const city of it.routeCities.length ? it.routeCities : it.days.map((d) => d.city)) {
    if (routeCities[routeCities.length - 1] !== city) routeCities.push(city);
  }

  return {
    itinerary: {
      ...it,
      routeCities,
    },
  };
}

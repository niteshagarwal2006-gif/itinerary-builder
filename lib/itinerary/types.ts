/**
 * Data model for a travel itinerary, modelled on the "IndeduSud v3" template.
 *
 * The document this produces has, top to bottom:
 *   1. Cover  — "ITINÉRAIRE SPÉCIALEMENT PRÉPARÉ POUR" + client, logo, trip
 *               summary line, meal plan, ROUTE line and a routing map.
 *   2. Highlights — "LES POINTS FORTS DE VOTRE VOYAGE", a bulleted list.
 *   3. Day blocks — one per day: a banner header (jour/date/leg/distance/hotel),
 *               the hotel line with a website hyperlink, a Google Maps directions
 *               link, an intro paragraph and a list of sightseeing entries
 *               (title + image + description).
 */

/** Languages the itinerary document can be produced in. French is the base. */
export type Lang = "fr" | "en" | "de";

/** Display metadata for the supported languages (French is always first/base).
 * German stays in the Lang type so old data loads, but is hidden from pickers. */
export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "fr", label: "French", native: "Français" },
  { code: "en", label: "English", native: "English" },
];

/** A picture, supplied either as an uploaded file or a remote URL. */
export interface ImageRef {
  /** Remote URL (used directly, or downloaded server-side when building docx). */
  url?: string;
  /** Path/key of an uploaded image stored by the app. */
  uploadId?: string;
  /** Optional caption shown under the image. */
  caption?: string;
  /** Natural width/height in px, when known, to preserve aspect ratio. */
  width?: number;
  height?: number;
}

/** The distance/time between two stops, rendered as a Google Maps link. */
export interface Leg {
  /** Display text, e.g. "160 KMS – 3 HRS 30" or "30 MINS". */
  text: string;
  /** Origin city/place for the auto-generated Maps directions link. */
  fromCity?: string;
  /** Destination city/place for the auto-generated Maps directions link. */
  toCity?: string;
  /** Explicit Maps URL; overrides the auto-generated one when set. */
  mapsUrl?: string;
}

export interface Hotel {
  name: string;
  /** Official hotel website. */
  url?: string;
  /** Optional room/category, e.g. "HERITAGE SUITE". */
  category?: string;
  image?: ImageRef;
  /** The "Niché au cœur des backwaters…" style descriptive paragraph. */
  description?: string;
  /** Label preceding the hotel, e.g. "VOTRE HÔTEL" or "VOTRE MAISON". */
  label?: string;
}

export type TimeOfDay = "morning" | "afternoon" | "evening";

export interface Sight {
  /** Stable identity for React keys and reordering (backfilled if missing). */
  id?: string;
  /** Uppercased title, e.g. "BASILIQUE SAN THOMÉ – SUR LES PAS DE L'APÔTRE". */
  title: string;
  image?: ImageRef;
  description: string;
  /** When true the title is prefixed "EN ROUTE :" in the document. */
  enRoute?: boolean;
  /** Optional closure note shown after the description, e.g. "Closed on Fridays". */
  closureNote?: string;
  /** Time slot for the visit: morning, afternoon or evening. */
  timeOfDay?: TimeOfDay;
}

export interface Activity {
  /** Stable identity for React keys and reordering. */
  id?: string;
  title: string;
  description: string;
  image?: ImageRef;
}

export interface DayBlock {
  /** Stable identity for React keys and reordering (backfilled if missing). */
  id?: string;
  /** e.g. "JOUR 1", "JOUR 6,7", "JOUR 09-12". */
  dayLabel: string;
  /** e.g. "DIM. 11 AVRIL 2027" or "17 DEC'26". Optional. */
  date?: string;
  /** Leg/activity title, e.g. "ARRIVÉE À CHENNAI" or "CHENNAI – PONDICHÉRY". */
  title: string;
  /** City shown in the banner. */
  city: string;
  /** Travel for the day (airport→hotel or city→city). Optional for static days. */
  leg?: Leg;
  hotel?: Hotel;
  /** Optional weather line ("MÉTÉO: DELHI | 6–23°C | …"). Premium variant. */
  weather?: string;
  /** Hero photo for the city (from library or Incredible India). */
  cityImage?: ImageRef;
  /** Intro / city description paragraph(s). */
  intro?: string;
  sights: Sight[];
  /** Experiences such as rickshaw rides, cooking classes, boat cruises. */
  activities: Activity[];
  /** Closure-day alerts, e.g. ["⚠ Taj Mahal — closed on Fridays"]. */
  closureWarnings?: string[];
  /** Closing line, e.g. "Dîner et nuit à l'hôtel." */
  closing?: string;
}

export interface TripSummary {
  /** Departure country/city of the international flight in, e.g. "PARIS". */
  origin?: string;
  /** First Indian city, e.g. "CHENNAI". */
  arrivalCity?: string;
  /** Last Indian city before flying home, e.g. "BOMBAY". */
  departureCity?: string;
  /** Final destination of the return flight, e.g. "PARIS". */
  finalDestination?: string;
  /** Free-text dates, e.g. "11 – 22 AVRIL 2027". */
  dates?: string;
  nights?: number;
  days?: number;
  /** Meal plan line, e.g. "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER…". */
  mealPlan?: string;
}

export interface MealFlags {
  b: boolean;
  l: boolean;
  d: boolean;
}

export interface Itinerary {
  /** Output language of the generated document. Defaults to French. */
  outputLanguage?: Lang;
  /** Client the itinerary is prepared for, e.g. "Madame Marti". */
  preparedFor: string;
  /** Company / agency logo shown on the cover. */
  logo?: ImageRef;
  tripSummary: TripSummary;
  /** Ordered route cities, e.g. ["CHENNAI", "PONDICHÉRY", …]. */
  routeCities: string[];
  /** Internal flight legs, e.g. ["JAIPUR / JAISALMER"]. */
  flightLegs: string[];
  /** Map image of the whole routing. */
  routeMap?: ImageRef;
  /** "LES POINTS FORTS DE VOTRE VOYAGE" bullets. */
  highlights: string[];
  /** Watercolor collage image shown at the top of the highlights page. */
  highlightsImage?: ImageRef;
  /** Meal plan flags used to humanize day intros and closings. */
  mealPlan?: MealFlags;
  days: DayBlock[];
}

/** Build a Google Maps directions URL between two place names. */
export function mapsDirectionsUrl(from?: string, to?: string): string | undefined {
  if (!from || !to) return undefined;
  const enc = (s: string) => encodeURIComponent(s.trim());
  return `https://www.google.com/maps/dir/${enc(from)}/${enc(to)}`;
}

/** Resolve the best Maps URL for a leg (explicit override wins). */
export function legMapsUrl(leg?: Leg): string | undefined {
  if (!leg) return undefined;
  return leg.mapsUrl || mapsDirectionsUrl(leg.fromCity, leg.toCity);
}

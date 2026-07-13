import type { Lang } from "../itinerary/types";

/**
 * Fixed structural labels printed in the generated document (and mirrored in the
 * live preview). These are authored, verified translations — they are NOT the
 * user's free-text content (which is translated/grammar-checked separately).
 */
export interface DocStrings {
  /** Cover heading. */
  preparedFor: string;
  /** Highlights section heading. */
  highlights: string;
  /** "ROUTE" label before the lettered city list. */
  route: string;
  /** Flight-leg label. */
  flight: string;
  /** Default hotel label ("VOTRE HÔTEL"). */
  yourHotel: string;
  /** Prefix before the Google Maps directions link. */
  directionsPrefix: string;
  /** Fallback link text when no from/to cities are set. */
  viewRoute: string;
  /** Trip-summary "nights" word. */
  nights: string;
  /** Trip-summary "days" word. */
  days: string;
}

export const DOC_STRINGS: Record<Lang, DocStrings> = {
  fr: {
    preparedFor: "ITINÉRAIRE SPÉCIALEMENT PRÉPARÉ POUR",
    highlights: "LES POINTS FORTS DE VOTRE VOYAGE",
    route: "ROUTE",
    flight: "VOL",
    yourHotel: "VOTRE HÔTEL",
    directionsPrefix: "Itinéraire :",
    viewRoute: "Voir l'itinéraire",
    nights: "NUITS",
    days: "JOURS",
  },
  en: {
    preparedFor: "ITINERARY SPECIALLY PREPARED FOR",
    highlights: "HIGHLIGHTS OF YOUR JOURNEY",
    route: "ROUTE",
    flight: "FLIGHT",
    yourHotel: "YOUR HOTEL",
    directionsPrefix: "Directions:",
    viewRoute: "View the route",
    nights: "NIGHTS",
    days: "DAYS",
  },
  de: {
    preparedFor: "REISEPROGRAMM SPEZIELL ZUSAMMENGESTELLT FÜR",
    highlights: "DIE HÖHEPUNKTE IHRER REISE",
    route: "ROUTE",
    flight: "FLUG",
    yourHotel: "IHR HOTEL",
    directionsPrefix: "Wegbeschreibung:",
    viewRoute: "Route ansehen",
    nights: "NÄCHTE",
    days: "TAGE",
  },
};

/** Resolve doc strings for an itinerary's output language (defaults to French). */
export function docStringsFor(lang: Lang | undefined): DocStrings {
  return DOC_STRINGS[lang ?? "fr"];
}

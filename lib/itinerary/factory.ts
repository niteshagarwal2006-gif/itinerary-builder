import type { DayBlock, Itinerary, Sight } from "./types";

/** Stable unique id for days/sights (crypto.randomUUID with a safe fallback). */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** A fresh, empty sightseeing entry. */
export function emptySight(): Sight {
  return { id: uid(), title: "", description: "" };
}

/** A fresh, empty day block. */
export function emptyDay(index = 0): DayBlock {
  return {
    id: uid(),
    dayLabel: `JOUR ${index + 1}`,
    title: "",
    city: "",
    sights: [],
  };
}

/** A blank itinerary with sensible defaults. */
export function emptyItinerary(): Itinerary {
  return {
    outputLanguage: "fr",
    preparedFor: "",
    tripSummary: {
      mealPlan: "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS",
    },
    routeCities: [],
    flightLegs: [],
    highlights: [],
    days: [emptyDay(0)],
  };
}

/**
 * Ensure every day and sight has a stable `id`. Itineraries loaded from the
 * sample, an imported JSON file, or localStorage may predate ids; backfill them
 * so React keys and reordering stay correct. Returns a new object only if it
 * had to add ids.
 */
export function ensureItineraryIds(it: Itinerary): Itinerary {
  let changed = false;
  const days = it.days.map((d) => {
    let dayChanged = false;
    const sights = d.sights.map((s) => {
      if (s.id) return s;
      dayChanged = true;
      return { ...s, id: uid() };
    });
    if (d.id && !dayChanged) return d;
    changed = true;
    return { ...d, id: d.id ?? uid(), sights };
  });
  return changed ? { ...it, days } : it;
}

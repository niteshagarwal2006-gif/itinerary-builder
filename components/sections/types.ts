import type { Itinerary } from "@/lib/itinerary/types";

/**
 * Contract every top-level form section is built against.
 *
 * Sections are fully controlled: they read what they need from `itinerary`
 * and apply changes by calling `patch` with a shallow partial. The parent
 * (app/page.tsx) owns all state and merges the patch immutably. Sections must
 * never mutate `itinerary` in place.
 */
export interface SectionProps {
  itinerary: Itinerary;
  patch: (partial: Partial<Itinerary>) => void;
}

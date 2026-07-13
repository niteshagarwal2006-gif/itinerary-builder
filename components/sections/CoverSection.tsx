"use client";

import { Section, Field, TextInput, TextArea, NumberInput, StringListEditor } from "@/components/ui";
import { ImageField } from "@/components/ImageField";
import type { SectionProps } from "./types";

/**
 * Edits the COVER + ROUTE data of the itinerary:
 *  - client name + company logo,
 *  - the trip-summary line (from/to cities, dates, nights/days, meal plan),
 *  - the printed "ROUTE" line (route cities), internal flight legs and the
 *    routing map.
 */
export function CoverSection({ itinerary, patch }: SectionProps) {
  const summary = itinerary.tripSummary;

  return (
    <div className="space-y-5">
      <Section
        title="Client & logo"
        description={'Cover heading: "ITINÉRAIRE SPÉCIALEMENT PRÉPARÉ POUR".'}
      >
        <Field label="Prepared for">
          <TextInput
            value={itinerary.preparedFor}
            onChange={(v) => patch({ preparedFor: v })}
            placeholder="e.g. Madame Marti"
          />
        </Field>

        <ImageField
          label="Company logo"
          value={itinerary.logo}
          onChange={(ref) => patch({ logo: ref })}
        />
      </Section>

      <Section
        title="Trip summary"
        description="The one-line route and stay summary printed on the cover."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From">
            <TextInput
              value={summary.origin ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, origin: v } })
              }
              placeholder="e.g. PARIS"
            />
          </Field>

          <Field label="Arrival city">
            <TextInput
              value={summary.arrivalCity ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, arrivalCity: v } })
              }
              placeholder="e.g. CHENNAI"
            />
          </Field>

          <Field label="Departure city">
            <TextInput
              value={summary.departureCity ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, departureCity: v } })
              }
              placeholder="e.g. BOMBAY"
            />
          </Field>

          <Field label="Back to">
            <TextInput
              value={summary.finalDestination ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, finalDestination: v } })
              }
              placeholder="e.g. PARIS"
            />
          </Field>

          <Field label="Dates">
            <TextInput
              value={summary.dates ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, dates: v } })
              }
              placeholder="e.g. 11 – 22 AVRIL 2027"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nights">
              <NumberInput
                value={summary.nights}
                onChange={(v) =>
                  patch({ tripSummary: { ...summary, nights: v } })
                }
                min={0}
              />
            </Field>

            <Field label="Days">
              <NumberInput
                value={summary.days}
                onChange={(v) =>
                  patch({ tripSummary: { ...summary, days: v } })
                }
                min={0}
              />
            </Field>
          </div>

          <Field label="Meal plan" className="sm:col-span-2">
            <TextArea
              value={summary.mealPlan ?? ""}
              onChange={(v) =>
                patch({ tripSummary: { ...summary, mealPlan: v } })
              }
              rows={2}
              placeholder="e.g. SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Route & flights"
        description={'Route cities print as the cover "ROUTE" line.'}
      >
        <Field label="Route cities">
          <StringListEditor
            items={itinerary.routeCities}
            onChange={(routeCities) => patch({ routeCities })}
            prefix={(i) => "(" + String.fromCharCode(65 + i) + ")"}
            placeholder="City name"
            addLabel="Add city"
          />
        </Field>

        <Field label="Flight legs">
          <StringListEditor
            items={itinerary.flightLegs}
            onChange={(flightLegs) => patch({ flightLegs })}
            placeholder="e.g. JAIPUR / JAISALMER"
            addLabel="Add flight leg"
          />
        </Field>

        <ImageField
          label="Routing map"
          value={itinerary.routeMap}
          onChange={(routeMap) => patch({ routeMap })}
        />
      </Section>
    </div>
  );
}

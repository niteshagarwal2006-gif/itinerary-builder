"use client";

import { Section, StringListEditor } from "@/components/ui";
import type { SectionProps } from "./types";

export function HighlightsSection({ itinerary, patch }: SectionProps) {
  const count = itinerary.highlights.length;

  return (
    <Section
      title="Highlights"
      description={'Prints as "LES POINTS FORTS DE VOTRE VOYAGE"'}
    >
      <StringListEditor
        multiline
        items={itinerary.highlights}
        onChange={(highlights) => patch({ highlights })}
        placeholder="One standout experience…"
        addLabel="Add highlight"
      />
      <p className="text-xs text-ink/50">
        {count} {count === 1 ? "highlight" : "highlights"}
      </p>
    </Section>
  );
}

"use client";

import { useState } from "react";
import { Section, Button, IconButton } from "@/components/ui";
import { emptyDay, uid } from "@/lib/itinerary/factory";
import type { DayBlock, Lang } from "@/lib/itinerary/types";
import type { SectionProps } from "./types";
import { DayEditor } from "./DayEditor";

/** A single collapsible day card with its own open/closed state. */
function DayCard({
  day,
  index,
  count,
  lang,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: {
  day: DayBlock;
  index: number;
  count: number;
  lang: Lang;
  onChange: (next: DayBlock) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);

  const summary = [day.dayLabel, day.title, day.city]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="rounded-lg border border-line bg-paper shadow-sm">
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden className="text-ink/50">
            {open ? "▾" : "▸"}
          </span>
          <span className="text-sm font-medium text-ink">
            {summary || `Day ${index + 1}`}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={<span aria-hidden>↑</span>}
            label="Move day up"
            onClick={() => onMove(-1)}
            disabled={index === 0}
          />
          <IconButton
            icon={<span aria-hidden>↓</span>}
            label="Move day down"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          />
          <IconButton
            icon={<span aria-hidden>⧉</span>}
            label="Duplicate day"
            onClick={onDuplicate}
          />
          <IconButton
            icon={<span aria-hidden>✕</span>}
            label="Remove day"
            variant="danger"
            onClick={onRemove}
            disabled={count <= 1}
          />
        </div>
      </header>

      {open && (
        <div className="border-t border-line px-4 py-4">
          <DayEditor day={day} onChange={onChange} lang={lang} />
        </div>
      )}
    </div>
  );
}

/**
 * The day-by-day itinerary section: a list of collapsible day cards with
 * add / duplicate / remove / reorder. All updates are immutable and applied
 * through `patch({ days })`.
 */
export function DaysSection({ itinerary, patch }: SectionProps) {
  const days = itinerary.days;
  const lang = itinerary.outputLanguage ?? "fr";

  const replaceAt = (i: number, next: DayBlock) =>
    patch({ days: days.map((d, idx) => (idx === i ? next : d)) });

  const add = () => patch({ days: [...days, emptyDay(days.length)] });

  const duplicate = (i: number) => {
    const clone = structuredClone(days[i]);
    // Fresh ids so the copy is a distinct React entity, not a key collision.
    clone.id = uid();
    clone.sights = clone.sights.map((s) => ({ ...s, id: uid() }));
    const next = days.slice();
    next.splice(i + 1, 0, clone);
    patch({ days: next });
  };

  const remove = (i: number) => {
    if (days.length <= 1) return;
    patch({ days: days.filter((_, idx) => idx !== i) });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= days.length) return;
    const next = days.slice();
    [next[i], next[j]] = [next[j], next[i]];
    patch({ days: next });
  };

  return (
    <Section
      title="Day-by-day itinerary"
      actions={
        <Button variant="primary" onClick={add}>
          + Add day
        </Button>
      }
    >
      {days.length === 0 ? (
        <p className="text-sm text-ink/45">No days yet. Add your first day.</p>
      ) : (
        <div className="space-y-2">
          {days.map((day, i) => (
            <DayCard
              key={day.id ?? i}
              day={day}
              index={i}
              count={days.length}
              lang={lang}
              onChange={(next) => replaceAt(i, next)}
              onDuplicate={() => duplicate(i)}
              onRemove={() => remove(i)}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

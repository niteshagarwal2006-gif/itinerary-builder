"use client";

import { useState } from "react";
import { Field, TextInput, TextArea, IconButton, Button } from "@/components/ui";
import { ImageField } from "@/components/ImageField";
import { LibraryPicker } from "@/components/LibraryPicker";
import { emptySight, uid } from "@/lib/itinerary/factory";
import { saveToLibrary } from "@/lib/libraryClient";
import type { Sight, Lang } from "@/lib/itinerary/types";
import type { LibSight } from "@/lib/library-types";

/**
 * Editor for a day's list of sightseeing entries. Each sight is a small card
 * with a title, photo and description, plus reorder/remove and library
 * save/insert. Fully controlled: never mutates `sights`.
 */
export function SightsEditor({
  sights,
  onChange,
  city,
  lang = "fr",
}: {
  sights: Sight[];
  onChange: (next: Sight[]) => void;
  city?: string;
  lang?: Lang;
}) {
  const [saved, setSaved] = useState<{ id: string; msg: string } | null>(null);

  const setAt = (i: number, patch: Partial<Sight>) =>
    onChange(sights.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const removeAt = (i: number) => onChange(sights.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sights.length) return;
    const next = sights.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const add = () => onChange([...sights, emptySight()]);

  /** Append a new sight populated from a saved library entry. */
  const insertFromLibrary = (e: LibSight) => {
    onChange([
      ...sights,
      { id: uid(), title: e.title, description: e.description ?? "", image: e.image },
    ]);
  };

  const saveSight = async (s: Sight) => {
    if (!s.title.trim()) return;
    const entry: LibSight = {
      id: uid(),
      title: s.title.trim(),
      city: city?.trim() || undefined,
      description: s.description,
      image: s.image,
      lang,
      updatedAt: new Date().toISOString(),
    };
    const r = await saveToLibrary("sights", entry);
    setSaved({ id: s.id ?? "", msg: r.ok ? "Saved ✓" : r.error || "Failed" });
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className="space-y-3">
      {sights.length === 0 && (
        <p className="text-xs text-ink/45">No sights yet.</p>
      )}

      {sights.map((sight, i) => (
        <div
          key={sight.id ?? i}
          className="space-y-3 rounded-lg border border-line bg-white p-3 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Field label={`Sight ${i + 1}`}>
                <TextInput
                  value={sight.title}
                  onChange={(v) => setAt(i, { title: v })}
                  placeholder="Sight title, e.g. BASILIQUE SAN THOMÉ – …"
                />
              </Field>
              {saved && saved.id === sight.id && (
                <span className="mt-1 block text-xs font-medium text-emerald-700">
                  {saved.msg}
                </span>
              )}
            </div>
            <div className="mt-6 flex shrink-0 flex-col gap-1">
              <IconButton
                icon={<span aria-hidden>↑</span>}
                label="Move sight up"
                onClick={() => move(i, -1)}
                disabled={i === 0}
              />
              <IconButton
                icon={<span aria-hidden>↓</span>}
                label="Move sight down"
                onClick={() => move(i, 1)}
                disabled={i === sights.length - 1}
              />
            </div>
            <div className="mt-6 flex shrink-0 flex-col gap-1">
              <IconButton
                icon={<span aria-hidden>💾</span>}
                label="Save this sight to the library"
                onClick={() => void saveSight(sight)}
                disabled={!sight.title.trim()}
              />
              <IconButton
                icon={<span aria-hidden>✕</span>}
                label="Remove sight"
                variant="danger"
                onClick={() => removeAt(i)}
              />
            </div>
          </div>

          <ImageField
            label="Photo"
            value={sight.image}
            onChange={(image) => setAt(i, { image })}
          />

          <Field label="Description">
            <TextArea
              value={sight.description}
              onChange={(v) => setAt(i, { description: v })}
              rows={3}
              placeholder="Description"
            />
          </Field>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={add}>
          + Add sight
        </Button>
        <LibraryPicker<LibSight>
          type="sights"
          onSelect={insertFromLibrary}
          label="From the library"
        />
      </div>
    </div>
  );
}

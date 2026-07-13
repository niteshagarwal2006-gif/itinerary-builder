"use client";

import { useState } from "react";
import { Field, TextInput, TextArea, Button } from "@/components/ui";
import { ImageField } from "@/components/ImageField";
import { LibraryPicker } from "@/components/LibraryPicker";
import { legMapsUrl } from "@/lib/itinerary/types";
import type { DayBlock, Hotel, Leg, Lang } from "@/lib/itinerary/types";
import type { LibHotel, LibCity } from "@/lib/library-types";
import { saveToLibrary } from "@/lib/libraryClient";
import { uid } from "@/lib/itinerary/factory";
import { SightsEditor } from "./SightsEditor";

/** Visual subheading for a grouped block of fields within a day. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-serif text-sm font-semibold uppercase tracking-wide text-deep">
      {children}
    </h4>
  );
}

/**
 * Full editor for a single day block. Controlled: it reads everything from
 * `day` and emits a brand-new DayBlock via `onChange` for every change.
 */
export function DayEditor({
  day,
  onChange,
  lang = "fr",
}: {
  day: DayBlock;
  onChange: (next: DayBlock) => void;
  lang?: Lang;
}) {
  const set = (p: Partial<DayBlock>) => onChange({ ...day, ...p });
  const [hotelSaved, setHotelSaved] = useState<string | null>(null);
  const [citySaved, setCitySaved] = useState<string | null>(null);

  // --- Travel / leg ---------------------------------------------------------
  const updateLeg = (p: Partial<Leg>) => {
    const current: Leg = day.leg ?? { text: "" };
    const merged: Leg = { ...current, ...p };
    const text = (merged.text ?? "").trim();
    const fromCity = (merged.fromCity ?? "").trim();
    const toCity = (merged.toCity ?? "").trim();
    const mapsUrl = (merged.mapsUrl ?? "").trim();

    if (!text && !fromCity && !toCity && !mapsUrl) {
      set({ leg: undefined });
      return;
    }

    const next: Leg = { text: merged.text ?? "" };
    if (merged.fromCity) next.fromCity = merged.fromCity;
    if (merged.toCity) next.toCity = merged.toCity;
    if (merged.mapsUrl) next.mapsUrl = merged.mapsUrl;
    set({ leg: next });
  };

  const mapsPreview = legMapsUrl(day.leg);

  // --- Hotel ----------------------------------------------------------------
  const updateHotel = (p: Partial<Hotel>) =>
    set({ hotel: { ...(day.hotel ?? { name: "" }), ...p } });

  /** Fill the hotel fields from a saved library entry (single immutable update). */
  const insertHotel = (e: LibHotel) => {
    const hotel: Hotel = {
      ...(day.hotel ?? { name: "" }),
      name: e.name,
      url: e.url,
      category: e.category,
      description: e.description,
      image: e.image,
    };
    const p: Partial<DayBlock> = { hotel };
    if (!day.city?.trim() && e.city) p.city = e.city;
    set(p);
  };

  const saveHotel = async () => {
    const h = day.hotel;
    if (!h?.name?.trim()) return;
    const entry: LibHotel = {
      id: uid(),
      name: h.name.trim(),
      city: day.city?.trim() || undefined,
      url: h.url,
      category: h.category,
      description: h.description,
      image: h.image,
      lang,
      updatedAt: new Date().toISOString(),
    };
    const r = await saveToLibrary("hotels", entry);
    setHotelSaved(r.ok ? "Saved ✓" : r.error || "Failed");
    setTimeout(() => setHotelSaved(null), 2500);
  };

  // --- City (name + intro) --------------------------------------------------
  const insertCity = (e: LibCity) => {
    const p: Partial<DayBlock> = { city: e.name };
    if (e.intro) p.intro = e.intro;
    set(p);
  };

  const saveCity = async () => {
    if (!day.city?.trim()) return;
    const entry: LibCity = {
      id: uid(),
      name: day.city.trim(),
      intro: day.intro,
      lang,
      updatedAt: new Date().toISOString(),
    };
    const r = await saveToLibrary("cities", entry);
    setCitySaved(r.ok ? "Saved ✓" : r.error || "Failed");
    setTimeout(() => setCitySaved(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Identity ----------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Day label">
          <TextInput
            value={day.dayLabel}
            onChange={(v) => set({ dayLabel: v })}
            placeholder="e.g. JOUR 1 or JOUR 6,7"
          />
        </Field>
        <Field label="Date (optional)">
          <TextInput
            value={day.date ?? ""}
            onChange={(v) => set({ date: v || undefined })}
            placeholder="e.g. DIM. 11 AVRIL 2027"
          />
        </Field>
        <Field label="Title / leg">
          <TextInput
            value={day.title}
            onChange={(v) => set({ title: v })}
            placeholder="e.g. Arrivée à Chennai or Chennai – Pondichéry"
          />
        </Field>
        <Field label="City">
          <TextInput
            value={day.city}
            onChange={(v) => set({ city: v })}
            placeholder="e.g. CHENNAI"
          />
        </Field>
      </div>

      {/* Travel / distance -------------------------------------------------- */}
      <div className="space-y-3 rounded-lg border border-line bg-cream/40 p-3">
        <GroupHeading>Travel / distance</GroupHeading>
        <Field label="Distance / time">
          <TextInput
            value={day.leg?.text ?? ""}
            onChange={(v) => updateLeg({ text: v })}
            placeholder="e.g. 160 kms – 3 hrs 30"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From city">
            <TextInput
              value={day.leg?.fromCity ?? ""}
              onChange={(v) => updateLeg({ fromCity: v })}
              placeholder="e.g. Chennai"
            />
          </Field>
          <Field label="To city">
            <TextInput
              value={day.leg?.toCity ?? ""}
              onChange={(v) => updateLeg({ toCity: v })}
              placeholder="e.g. Puducherry"
            />
          </Field>
        </div>
        <Field
          label="Maps URL override (optional)"
          hint="Leave empty to auto-generate from the cities above."
        >
          <TextInput
            type="url"
            value={day.leg?.mapsUrl ?? ""}
            onChange={(v) => updateLeg({ mapsUrl: v })}
            placeholder="https://www.google.com/maps/dir/…"
          />
        </Field>
        {mapsPreview && (
          <p className="text-xs text-ink/60">
            Maps link preview:{" "}
            <a
              href={mapsPreview}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-deep underline break-all"
            >
              {mapsPreview}
            </a>
          </p>
        )}
      </div>

      {/* Hotel -------------------------------------------------------------- */}
      <div className="space-y-3 rounded-lg border border-line bg-cream/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GroupHeading>Hotel</GroupHeading>
          <div className="flex items-center gap-2">
            {hotelSaved && (
              <span className="text-xs font-medium text-emerald-700">{hotelSaved}</span>
            )}
            <LibraryPicker<LibHotel> type="hotels" onSelect={insertHotel} />
            <Button
              variant="secondary"
              onClick={() => void saveHotel()}
              disabled={!day.hotel?.name?.trim()}
              title="Save this hotel to the library"
            >
              Save
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Label">
            <TextInput
              value={day.hotel?.label ?? ""}
              onChange={(v) => updateHotel({ label: v })}
              placeholder="VOTRE HÔTEL"
            />
          </Field>
          <Field label="Hotel name">
            <TextInput
              value={day.hotel?.name ?? ""}
              onChange={(v) => updateHotel({ name: v })}
              placeholder="Hotel name"
            />
          </Field>
          <Field label="Website">
            <TextInput
              type="url"
              value={day.hotel?.url ?? ""}
              onChange={(v) => updateHotel({ url: v })}
              placeholder="https://…"
            />
          </Field>
          <Field label="Category (optional)">
            <TextInput
              value={day.hotel?.category ?? ""}
              onChange={(v) => updateHotel({ category: v })}
              placeholder="e.g. HERITAGE SUITE"
            />
          </Field>
        </div>
        <ImageField
          label="Hotel photo"
          value={day.hotel?.image}
          onChange={(image) => updateHotel({ image })}
        />
        <Field label="Hotel description">
          <TextArea
            value={day.hotel?.description ?? ""}
            onChange={(v) => updateHotel({ description: v })}
            rows={3}
            placeholder="Niché au cœur des backwaters…"
          />
        </Field>
      </div>

      {/* Weather ------------------------------------------------------------ */}
      <Field label="Weather line (optional)">
        <TextInput
          value={day.weather ?? ""}
          onChange={(v) => set({ weather: v || undefined })}
          placeholder="MÉTÉO: DELHI | 6–23°C | …"
        />
      </Field>

      {/* Intro -------------------------------------------------------------- */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/70">
            Intro / city description
          </span>
          <div className="flex items-center gap-2">
            {citySaved && (
              <span className="text-xs font-medium text-emerald-700">{citySaved}</span>
            )}
            <LibraryPicker<LibCity> type="cities" onSelect={insertCity} label="City" />
            <Button
              variant="secondary"
              onClick={() => void saveCity()}
              disabled={!day.city?.trim()}
              title="Save this city to the library"
            >
              Save
            </Button>
          </div>
        </div>
        <TextArea
          value={day.intro ?? ""}
          onChange={(v) => set({ intro: v || undefined })}
          rows={4}
          placeholder="Intro / city description"
        />
      </div>

      {/* Sightseeing -------------------------------------------------------- */}
      <div className="space-y-3">
        <GroupHeading>Sightseeing</GroupHeading>
        <SightsEditor
          sights={day.sights}
          onChange={(sights) => set({ sights })}
          city={day.city}
          lang={lang}
        />
      </div>

      {/* Closing ------------------------------------------------------------ */}
      <Field label="Closing line">
        <TextInput
          value={day.closing ?? ""}
          onChange={(v) => set({ closing: v || undefined })}
          placeholder="e.g. Dîner et nuit à l'hôtel."
        />
      </Field>
    </div>
  );
}

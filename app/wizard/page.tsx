"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Lang } from "@/lib/itinerary/types";
import { LANGS } from "@/lib/itinerary/types";
import type { LibHotel, LibSight, LibCity } from "@/lib/library-types";
import type { ReviewNote } from "@/app/api/assemble/route";
import { LibraryPicker } from "@/components/LibraryPicker";
import { Button, NumberInput, TextInput } from "@/components/ui";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
interface MealFlags { b: boolean; l: boolean; d: boolean }

/** One city in the routing list (Step 0). */
interface CityEntry {
  _id: string;
  name: string;
  nights: number;
}

/** One wizard step = one night in one city (steps 1..M). */
interface DayStop {
  _id: string;
  cityName: string;
  nightNum: number;      // 1-based within this city
  totalNights: number;   // total nights in this city
  hotel: LibHotel | null;
  hotelUrl: string;
  sights: LibSight[];
  activities: LibSight[];
  /** Sight IDs that are visited en route (during the drive to this city). */
  enRouteSightIds: string[];
  meals: MealFlags;
}

interface WizardState {
  client: string;
  lang: Lang;
  nights: number;
  days: number;
  dates: string;
  /** ISO arrival date (YYYY-MM-DD) for closure-day checking. Optional. */
  startDate: string;
  cityEntries: CityEntry[];   // Step 0 routing list
  dayStops: DayStop[];        // computed when leaving Step 0
}

function newCityEntry(name = ""): CityEntry {
  return { _id: crypto.randomUUID(), name, nights: 1 };
}

function expandToDayStops(cities: CityEntry[]): DayStop[] {
  const stops: DayStop[] = [];
  for (const city of cities) {
    for (let n = 1; n <= Math.max(1, city.nights); n++) {
      stops.push({
        _id: crypto.randomUUID(),
        cityName: city.name,
        nightNum: n,
        totalNights: city.nights,
        hotel: null,
        hotelUrl: "",
        sights: [],
        activities: [],
        enRouteSightIds: [],
        meals: { b: true, l: false, d: true },
      });
    }
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i < current ? "w-2 bg-deep/40" : i === current ? "w-5 bg-deep" : "w-2 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function MealCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-cream has-[:checked]:border-deep has-[:checked]:bg-deep/5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-deep" />
      <span className="font-medium">{label}</span>
    </label>
  );
}

/** ImageRef as stored by the library (src) or the web (url). */
type AnyImg = { src?: string; url?: string; caption?: string };
const thumbOf = (img?: AnyImg): string | undefined => img?.src || img?.url;

interface PhotoEntry { src: string; title: string; city: string | null }

/** Modal grid of library photos for a city — lets the user pick the image
 * that will illustrate a sight/activity/hotel in the document. */
function PhotoChooser({
  city,
  title,
  onPick,
  onClear,
  onClose,
}: {
  city: string;
  title: string;
  onPick: (img: AnyImg) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/photos?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((d: { photos?: PhotoEntry[] }) => { if (active) setPhotos(d.photos ?? []); })
      .catch(() => { if (active) setPhotos([]); });
    return () => { active = false; };
  }, [city]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-deep/60">Choose a photo</p>
            <p className="font-serif text-base font-bold text-deep">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { onClear(); onClose(); }} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-cream">
              No photo / automatic
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-lg text-ink/40 hover:text-ink">×</button>
          </div>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-4">
          {photos === null ? (
            <p className="py-8 text-center text-sm text-ink/50">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/50">No photos for {city} yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {photos.map((p) => (
                <button
                  key={p.src}
                  type="button"
                  onClick={() => { onPick({ src: p.src, caption: p.title }); onClose(); }}
                  className="group overflow-hidden rounded-xl border border-line text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-deep/40"
                  title={p.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="block truncate px-1.5 py-1 text-[11px] text-ink/60">{p.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A selected sight/activity row: thumbnail, title, EN ROUTE toggle, photo picker. */
function ItemRow({ title, image, enRoute, onToggleEnRoute, onPhoto, onRemove }: {
  title: string;
  image?: AnyImg;
  enRoute?: boolean;
  onToggleEnRoute?: () => void;
  onPhoto: () => void;
  onRemove: () => void;
}) {
  const thumb = thumbOf(image);
  return (
    <li className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${enRoute ? "border-blue-300 bg-blue-50" : "border-line bg-white"}`}>
      <button type="button" onClick={onPhoto} title="Choose photo" className="group relative shrink-0 overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-deep/40">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-12 w-16 object-cover" loading="lazy" />
        ) : (
          <span className="flex h-12 w-16 items-center justify-center bg-cream text-lg text-ink/25">🖼</span>
        )}
        <span className="absolute inset-0 hidden items-center justify-center bg-ink/45 text-[10px] font-bold text-white group-hover:flex">CHANGE</span>
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{enRoute && <span className="font-bold text-blue-600">↗ </span>}{title}</span>
        {image?.caption && <span className="block truncate text-[11px] text-ink/45">{image.caption}</span>}
      </span>
      <button
        type="button"
        onClick={onPhoto}
        className="shrink-0 rounded-md border border-deep/30 bg-white px-2 py-1 text-[11px] font-semibold text-deep hover:bg-deep hover:text-white"
      >
        📷 Photo
      </button>
      {onToggleEnRoute && (
        <button
          type="button"
          onClick={onToggleEnRoute}
          title={enRoute ? "Remove EN ROUTE tag" : "Mark as EN ROUTE (visited during transfer)"}
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${enRoute ? "border-blue-400 text-blue-600 hover:bg-blue-100" : "border-line text-ink/40 hover:border-blue-400 hover:text-blue-600"}`}
        >
          EN ROUTE
        </button>
      )}
      <button type="button" onClick={onRemove} className="shrink-0 px-1 text-ink/35 hover:text-red-600">×</button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Step 0: Trip basics + city routing (pick from library, not free text)
// ---------------------------------------------------------------------------
function StepBasics({
  state,
  setState,
  onNext,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
}) {
  const [manualCity, setManualCity] = useState("");

  const addCityFromLibrary = (c: LibCity) => {
    setState((s) => ({ ...s, cityEntries: [...s.cityEntries, newCityEntry(c.name)] }));
  };

  const addManualCity = () => {
    const name = manualCity.trim();
    if (!name) return;
    setState((s) => ({ ...s, cityEntries: [...s.cityEntries, newCityEntry(name)] }));
    setManualCity("");
  };

  const removeCity = (idx: number) =>
    setState((s) => ({ ...s, cityEntries: s.cityEntries.filter((_, i) => i !== idx) }));

  const updateNights = (idx: number, nights: number) =>
    setState((s) => ({
      ...s,
      cityEntries: s.cityEntries.map((c, i) => (i === idx ? { ...c, nights } : c)),
    }));

  const canProceed = state.client.trim() && state.cityEntries.length > 0;

  const totalPlanned = state.cityEntries.reduce((a, c) => a + c.nights, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-serif text-lg font-bold text-deep">Trip Details</h2>
        <p className="text-sm text-ink/60">Basic information for the itinerary.</p>
      </div>

      <div className="space-y-4">
        {/* Client name */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">Client name</label>
          <TextInput value={state.client} onChange={(v) => setState((s) => ({ ...s, client: v }))} placeholder="e.g. Madame Dupont" />
        </div>

        {/* Language */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">Document language</label>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setState((s) => ({ ...s, lang: l.code }))}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  state.lang === l.code ? "border-deep bg-deep text-white" : "border-line bg-white text-ink hover:bg-cream"
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>

        {/* Nights / Days / Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Nights</label>
            <NumberInput
              value={state.nights}
              onChange={(v) => setState((s) => ({ ...s, nights: v ?? s.nights, days: (v ?? s.nights) + 1 }))}
              min={1} max={60}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Days</label>
            <NumberInput value={state.days} onChange={(v) => setState((s) => ({ ...s, days: v ?? s.days }))} min={1} max={61} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Arrival date <span className="font-normal text-ink/40">(for closure checks)</span></label>
            <input
              type="date"
              value={state.startDate}
              onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Dates label <span className="font-normal text-ink/40">(for document)</span></label>
            <TextInput value={state.dates} onChange={(v) => setState((s) => ({ ...s, dates: v }))} placeholder="e.g. 10–20 JAN 2027" />
          </div>
        </div>

        {/* City routing — pick from library */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">
            Cities in order
          </label>
          <p className="mb-2 text-xs text-ink/50">Select from library, or type a city name below.</p>

          {/* Library picker — filtered by chosen language to avoid duplicates */}
          <LibraryPicker<LibCity>
            type="cities"
            lang={state.lang}
            label="Choose a city"
            onSelect={addCityFromLibrary}
          />

          {/* Manual fallback */}
          <div className="mt-2 flex gap-2">
            <input
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualCity(); } }}
              placeholder="Or type a city name…"
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
            />
            <Button onClick={addManualCity} variant="secondary">+ Add</Button>
          </div>

          {/* Ordered list */}
          {state.cityEntries.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {state.cityEntries.map((c, i) => (
                <li key={c._id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-deep/10 text-xs font-bold text-deep">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  <label className="flex items-center gap-1 text-xs text-ink/60">
                    Nights:
                    <input
                      type="number" min={1} max={30} value={c.nights}
                      onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) updateNights(i, n); }}
                      className="w-12 rounded border border-line px-1 py-0.5 text-xs"
                    />
                  </label>
                  <button type="button" onClick={() => removeCity(i)} className="text-xs text-ink/40 hover:text-red-600">Remove</button>
                </li>
              ))}
            </ol>
          )}

          {state.cityEntries.length > 0 && (
            <p className={`mt-2 text-xs ${totalPlanned !== state.nights ? "text-amber-600" : "text-ink/50"}`}>
              Nights planned: <strong>{totalPlanned}</strong> / {state.nights} requested
              {totalPlanned !== state.nights && " — adjust nights per city to match"}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Link href="/" className="text-sm text-ink/50 hover:text-ink">← Back to editor</Link>
        <Button variant="primary" onClick={onNext} disabled={!canProceed}>
          Next: Hotels & sights →
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps 1..M: Per day stop (one night in one city)
// ---------------------------------------------------------------------------
function StepDay({
  stop,
  lang,
  nextLabel,
  prevCityName,
  onChange,
  onBack,
  onNext,
  isLast,
}: {
  stop: DayStop;
  lang: Lang;
  nextLabel: string;
  prevCityName?: string;
  onChange: (updated: DayStop) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const patch = (partial: Partial<DayStop>) => onChange({ ...stop, ...partial });
  const isTravelDay = !!prevCityName && prevCityName !== stop.cityName;

  // Photo chooser target: which item's image is being picked
  const [chooser, setChooser] = useState<null | { kind: "sight" | "activity" | "hotel"; id?: string; title: string }>(null);

  const addSight = (s: LibSight) => {
    if (stop.sights.find((x) => x.id === s.id)) return;
    patch({ sights: [...stop.sights, s] });
  };
  const removeSight = (id: string) => patch({
    sights: stop.sights.filter((s) => s.id !== id),
    enRouteSightIds: stop.enRouteSightIds.filter((i) => i !== id),
  });
  const toggleEnRoute = (id: string) => patch({
    enRouteSightIds: stop.enRouteSightIds.includes(id)
      ? stop.enRouteSightIds.filter((i) => i !== id)
      : [...stop.enRouteSightIds, id],
  });

  const addActivity = (a: LibSight) => {
    if (stop.activities.find((x) => x.id === a.id)) return;
    patch({ activities: [...stop.activities, a] });
  };
  const removeActivity = (id: string) => patch({ activities: stop.activities.filter((a) => a.id !== id) });

  const setItemImage = (img: AnyImg | undefined) => {
    if (!chooser) return;
    if (chooser.kind === "sight") {
      patch({ sights: stop.sights.map((s) => (s.id === chooser.id ? { ...s, image: img } : s)) });
    } else if (chooser.kind === "activity") {
      patch({ activities: stop.activities.map((a) => (a.id === chooser.id ? { ...a, image: img } : a)) });
    } else if (stop.hotel) {
      patch({ hotel: { ...stop.hotel, image: img } });
    }
  };

  const nightLabel =
    stop.totalNights > 1
      ? `Night ${stop.nightNum} of ${stop.totalNights} in ${stop.cityName}`
      : stop.cityName;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-deep/60">{nightLabel}</p>
        <h2 className="font-serif text-2xl font-bold text-deep">{stop.cityName}</h2>
      </div>

      <div className="space-y-5">
        {/* Hotel — city-filtered so only hotels for this city appear */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">Hotel</label>
          <LibraryPicker<LibHotel>
            type="hotels"
            cityFilter={stop.cityName}
            label="Pick from library"
            onSelect={(h) => patch({ hotel: h, hotelUrl: h.url ?? "" })}
          />
          {stop.hotel ? (
            <div className="mt-2 rounded-lg border border-deep/20 bg-deep/5 p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setChooser({ kind: "hotel", title: stop.hotel!.name })}
                  title="Choose photo"
                  className="group relative shrink-0 overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-deep/40"
                >
                  {thumbOf(stop.hotel.image as AnyImg) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbOf(stop.hotel.image as AnyImg)} alt="" className="h-14 w-20 object-cover" />
                  ) : (
                    <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-cream text-lg text-ink/25">🖼</span>
                  )}
                  <span className="absolute inset-0 hidden items-center justify-center bg-ink/45 text-[10px] font-bold text-white group-hover:flex">CHANGE</span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-deep">{stop.hotel.name}</p>
                  {stop.hotel.category && <p className="text-xs text-ink/60">{stop.hotel.category}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setChooser({ kind: "hotel", title: stop.hotel!.name })}
                  className="shrink-0 rounded-md border border-deep/30 bg-white px-2 py-1 text-[11px] font-semibold text-deep hover:bg-deep hover:text-white"
                >
                  📷 Photo
                </button>
                <button type="button" onClick={() => patch({ hotel: null, hotelUrl: "" })} className="shrink-0 text-xs text-ink/40 hover:text-red-600">Clear</button>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-ink/60">Hotel URL (override)</label>
                <TextInput value={stop.hotelUrl} onChange={(v) => patch({ hotelUrl: v })} placeholder={stop.hotel.url ?? "https://..."} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink/40">No hotel selected — will be left blank.</p>
          )}
        </div>

        {/* Sightseeing — filtered by language + city */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">Sightseeing</label>
          <LibraryPicker<LibSight>
            type="sights"
            lang={lang}
            cityFilter={stop.cityName}
            label="Add from library"
            onSelect={addSight}
          />
          {isTravelDay && stop.sights.length > 0 && (
            <p className="mt-1 text-xs text-blue-600">↗ EN ROUTE = visited on the way from {prevCityName}</p>
          )}
          {stop.sights.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {stop.sights.map((s) => (
                <ItemRow
                  key={s.id}
                  title={s.title}
                  image={s.image as AnyImg}
                  enRoute={stop.enRouteSightIds.includes(s.id)}
                  onToggleEnRoute={isTravelDay ? () => toggleEnRoute(s.id) : undefined}
                  onPhoto={() => setChooser({ kind: "sight", id: s.id, title: s.title })}
                  onRemove={() => removeSight(s.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink/40">No sights selected yet.</p>
          )}
        </div>

        {/* Activities — filtered by language + city */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">Activities</label>
          <LibraryPicker<LibSight>
            type="activities"
            lang={lang}
            cityFilter={stop.cityName}
            label="Add from library"
            onSelect={addActivity}
          />
          {stop.activities.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {stop.activities.map((a) => (
                <ItemRow
                  key={a.id}
                  title={a.title}
                  image={a.image as AnyImg}
                  onPhoto={() => setChooser({ kind: "activity", id: a.id, title: a.title })}
                  onRemove={() => removeActivity(a.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink/40">No activities selected yet.</p>
          )}
        </div>

        {/* Meals */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">Meals included</label>
          <div className="flex flex-wrap gap-2">
            <MealCheck label="Breakfast" checked={stop.meals.b} onChange={(v) => patch({ meals: { ...stop.meals, b: v } })} />
            <MealCheck label="Lunch" checked={stop.meals.l} onChange={(v) => patch({ meals: { ...stop.meals, l: v } })} />
            <MealCheck label="Dinner" checked={stop.meals.d} onChange={(v) => patch({ meals: { ...stop.meals, d: v } })} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button variant="primary" onClick={onNext}>
          {isLast ? "Build Itinerary →" : `Next: ${nextLabel} →`}
        </Button>
      </div>

      {chooser && (
        <PhotoChooser
          city={stop.cityName}
          title={chooser.title}
          onPick={(img) => setItemImage(img)}
          onClear={() => setItemImage(undefined)}
          onClose={() => setChooser(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assembling overlay
// ---------------------------------------------------------------------------
function AssemblingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-deep" />
      <div>
        <p className="font-semibold text-deep">Building your itinerary…</p>
        <p className="mt-1 text-sm text-ink/50">Assembling day blocks and descriptions</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step -1: Language selection (shown before anything else)
// ---------------------------------------------------------------------------
function StepLanguage({ onPick }: { onPick: (lang: Lang) => void }) {
  return (
    <div className="space-y-8 py-4 text-center">
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep">What language is this itinerary?</h2>
        <p className="mt-2 text-sm text-ink/50">
          This controls which library entries (cities, sights, activities) will be shown throughout the wizard.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onPick(l.code)}
            className="flex flex-col items-center gap-1 rounded-2xl border-2 border-line bg-white px-8 py-6 text-center transition-all hover:border-deep hover:bg-deep/5 hover:shadow-md"
          >
            <span className="text-3xl">{l.code === "fr" ? "🇫🇷" : l.code === "en" ? "🇬🇧" : "🇩🇪"}</span>
            <span className="mt-1 text-lg font-bold text-deep">{l.native}</span>
            <span className="text-xs text-ink/50">{l.label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink/40">You can change this on the next screen if needed.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------
export default function WizardPage() {
  const router = useRouter();

  const [langPicked, setLangPicked] = useState(false);

  const [state, setState] = useState<WizardState>({
    client: "",
    lang: "fr",
    nights: 7,
    days: 8,
    dates: "",
    startDate: "",
    cityEntries: [],
    dayStops: [],
  });

  // step 0 = basics/routing, step 1..M = dayStops[step-1]
  const [step, setStep] = useState(0);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewNote[] | null>(null);
  const [assembledItinerary, setAssembledItinerary] = useState<object | null>(null);

  const totalSteps = 1 + state.dayStops.length;

  const updateStop = (idx: number, updated: DayStop) => {
    setState((s) => ({ ...s, dayStops: s.dayStops.map((d, i) => (i === idx ? updated : d)) }));
  };

  function goFromBasics() {
    const expanded = expandToDayStops(state.cityEntries);
    setState((s) => ({ ...s, dayStops: expanded }));
    setStep(1);
  }

  async function assemble() {
    setAssembling(true);
    setError("");
    try {
      const payload = {
        client: state.client,
        lang: state.lang,
        nights: state.nights,
        days: state.days,
        dates: state.dates,
        startDate: state.startDate || undefined,
        dayStops: state.dayStops.map((d) => ({
          cityName: d.cityName,
          nightNum: d.nightNum,
          totalNights: d.totalNights,
          hotel: d.hotel,
          hotelUrl: d.hotelUrl,
          sights: d.sights.map((s) => ({ ...s, enRoute: d.enRouteSightIds.includes(s.id) })),
          activities: d.activities.map((a) => ({ ...a, enRoute: d.enRouteSightIds.includes(a.id) })),
          meals: d.meals,
        })),
      };
      const res = await fetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { itinerary?: object; review?: ReviewNote[]; error?: string };
      if (!res.ok || !data.itinerary) {
        setError(data.error ?? "Assembly failed.");
        setAssembling(false);
        return;
      }
      setAssembledItinerary(data.itinerary);
      setReview(data.review ?? []);
      setAssembling(false);
    } catch {
      setError("Could not reach the server.");
      setAssembling(false);
    }
  }

  function confirmAndOpen() {
    if (!assembledItinerary) return;
    try {
      const saved = {
        id: crypto.randomUUID(),
        name: state.client || "Wizard itinerary",
        savedAt: new Date().toISOString(),
        data: assembledItinerary,
      };
      const existing = JSON.parse(window.localStorage.getItem("itb:saved") ?? "[]") as object[];
      window.localStorage.setItem("itb:saved", JSON.stringify([saved, ...existing]));
      window.localStorage.setItem("itb:wizard", JSON.stringify(assembledItinerary));
    } catch { /* ignore storage errors */ }
    router.push("/?from=wizard");
  }

  if (assembling) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
          <AssemblingScreen />
        </div>
      </div>
    );
  }

  // Review screen — shown after assembly, before opening the editor
  if (review !== null && assembledItinerary !== null) {
    const warnings = review.filter((n) => n.type === "warning");
    const infos = review.filter((n) => n.type === "info");
    const oks = review.filter((n) => n.type === "ok");
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center px-5 py-4">
            <span className="font-serif text-xl font-bold text-deep">Itinerary Review</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 space-y-4">
          <p className="text-sm text-ink/60">Claude has reviewed your itinerary. Check any warnings before generating the document.</p>

          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Warnings</p>
              {warnings.map((n, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-semibold text-amber-700">{n.scope}</span>
                  <span className="text-amber-900">{n.message}</span>
                </div>
              ))}
            </div>
          )}

          {infos.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Suggestions</p>
              {infos.map((n, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-semibold text-blue-700">{n.scope}</span>
                  <span className="text-blue-900">{n.message}</span>
                </div>
              ))}
            </div>
          )}

          {oks.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
              {oks.map((n, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 text-green-600">✓</span>
                  <span className="text-green-900">{n.message}</span>
                </div>
              ))}
            </div>
          )}

          {review.length === 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              ✓ No issues found. Your itinerary looks good.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={confirmAndOpen} variant="primary">
              Open in editor →
            </Button>
            <Button onClick={() => { setReview(null); setAssembledItinerary(null); }} variant="secondary">
              Go back &amp; edit
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Language selection screen — shown before anything else
  if (!langPicked) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center px-5 py-4">
            <span className="font-serif text-xl font-bold text-deep">New Itinerary</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
          <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
            <StepLanguage
              onPick={(lang) => {
                setState((s) => ({ ...s, lang }));
                setLangPicked(true);
              }}
            />
          </div>
        </main>
      </div>
    );
  }

  const currentStop = step > 0 ? state.dayStops[step - 1] : null;
  const nextStop = step > 0 ? state.dayStops[step] : null;
  const nextLabel = nextStop
    ? nextStop.cityName !== currentStop?.cityName
      ? nextStop.cityName
      : `${nextStop.cityName} (night ${nextStop.nightNum})`
    : "";

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-xl font-bold text-deep">New Itinerary</span>
            <span className="hidden text-sm text-ink/50 sm:inline">Wizard</span>
          </div>
          {totalSteps > 1 && <StepIndicator current={step} total={totalSteps} />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {step === 0 && (
            <StepBasics state={state} setState={setState} onNext={goFromBasics} />
          )}

          {step > 0 && currentStop && (
            <StepDay
              stop={currentStop}
              lang={state.lang}
              nextLabel={nextLabel}
              prevCityName={step > 1 ? state.dayStops[step - 2]?.cityName : undefined}
              onChange={(updated) => updateStop(step - 1, updated)}
              onBack={() => setStep((s) => s - 1)}
              onNext={() => {
                if (step === state.dayStops.length) {
                  void assemble();
                } else {
                  setStep((s) => s + 1);
                }
              }}
              isLast={step === state.dayStops.length}
            />
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* City progress bar */}
        {step > 0 && state.dayStops.length > 1 && (
          <>
            <div className="mt-6 flex gap-1">
              {state.dayStops.map((d, i) => (
                <div key={d._id} className={`h-1 flex-1 rounded-full transition-colors ${i < step - 1 ? "bg-deep/40" : i === step - 1 ? "bg-deep" : "bg-line"}`} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-ink/40">
              <span>{state.dayStops[0].cityName}</span>
              <span>{state.dayStops[state.dayStops.length - 1].cityName}</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

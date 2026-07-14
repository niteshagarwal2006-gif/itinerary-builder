"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Lang, TimeOfDay } from "@/lib/itinerary/types";
import { LANGS } from "@/lib/itinerary/types";
import type { ReviewNote } from "@/app/api/assemble/route";
import { Button, Field, NumberInput, TextInput, TextArea, cn } from "@/components/ui";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
interface MealFlags { b: boolean; l: boolean; d: boolean }

interface CityHotel { name: string; url: string }

interface CityVisit {
  title: string;
  timeOfDay: TimeOfDay;
}

interface WizardState {
  client: string;
  lang: Lang;
  dates: string;
  startDate: string;
  mealPlan: MealFlags;
  routeMode: "manual" | "ai";
  routeCities: string[];
  cityNights: number[];
  cityVisits: CityVisit[][];
  cityActivities: string[][];
  cityHotels: CityHotel[];
  includeWeather: boolean | null;
  /** User-approved Pexels/library image URL per sight title (lowercased key). */
  sightImages: Record<string, string>;
}

function isValidDate(v: string): boolean {
  return /^\d{2}-\d{2}-\d{4}$/.test(v.trim());
}

function parseDate(v: string): string | undefined {
  const s = v.trim();
  if (!/^\d{2}-\d{2}-\d{4}$/.test(s)) return undefined;
  const [dayStr, monthStr, yearStr] = s.split("-");
  const day = parseInt(dayStr ?? "", 10);
  const month = parseInt(monthStr ?? "", 10);
  const year = parseInt(yearStr ?? "", 10);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    year < 1900 ||
    year > 2100
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function emptyState(): WizardState {
  return {
    client: "",
    lang: "fr",
    dates: "",
    startDate: "",
    mealPlan: { b: true, l: false, d: true },
    routeMode: "manual",
    routeCities: [],
    cityNights: [],
    cityVisits: [],
    cityActivities: [],
    cityHotels: [],
    includeWeather: null,
    sightImages: {},
  };
}

// ---------------------------------------------------------------------------
// UI helpers
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
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm hover:bg-cream has-[:checked]:border-deep has-[:checked]:bg-deep/5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-deep" />
      <span className="font-medium">{label}</span>
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-serif text-base font-semibold text-deep">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0: Trip basics
// ---------------------------------------------------------------------------
function StepTripBasics({ state, setState, onNext }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
}) {
  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));

  const canProceed = state.client.trim();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Trip basics</h2>
        <p className="text-sm text-ink/60">Start with the client and travel dates.</p>
      </div>

      <Field label="Client name" required>
        <TextInput
          value={state.client}
          onChange={(v) => patch({ client: v })}
          placeholder="e.g. Madame Dupont"
        />
      </Field>

      <Field label="Document language">
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => patch({ lang: l.code })}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                state.lang === l.code
                  ? "border-deep bg-deep text-white"
                  : "border-line bg-white text-ink hover:bg-cream"
              )}
            >
              {l.native}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Travel dates" hint="Format: dd-mm-yyyy - dd-mm-yyyy (e.g. 14-07-2027 - 20-07-2027)">
          <TextInput
            value={state.dates}
            onChange={(v) => patch({ dates: v })}
            placeholder="14-07-2027 - 20-07-2027"
          />
        </Field>
        <Field label="Arrival date" hint="Format: dd-mm-yyyy. Used for weather and closure checks.">
          <TextInput
            value={state.startDate}
            onChange={(v) => {
              const digits = v.replace(/\D/g, "");
              let formatted = v;
              if (digits.length <= 2) formatted = digits;
              else if (digits.length <= 4) formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
              else formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
              patch({ startDate: formatted });
            }}
            placeholder="14-07-2027"
          />
          {state.startDate && !isValidDate(state.startDate) && (
            <p className="mt-1 text-xs text-red-600">Arrival date must be dd-mm-yyyy</p>
          )}
        </Field>
      </div>

      <Field label="Meal plan included">
        <div className="flex flex-wrap gap-2">
          <MealCheck label="Breakfast" checked={state.mealPlan.b} onChange={(v) => patch({ mealPlan: { ...state.mealPlan, b: v } })} />
          <MealCheck label="Lunch" checked={state.mealPlan.l} onChange={(v) => patch({ mealPlan: { ...state.mealPlan, l: v } })} />
          <MealCheck label="Dinner" checked={state.mealPlan.d} onChange={(v) => patch({ mealPlan: { ...state.mealPlan, d: v } })} />
        </div>
      </Field>

      <div className="flex items-center justify-between pt-2">
        <Link href="/" className="text-sm text-ink/50 hover:text-ink">← Back to editor</Link>
        <Button onClick={onNext} variant="primary" disabled={!canProceed}>Next: Route →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Route
// ---------------------------------------------------------------------------
function parseRouteInput(raw: string): string[] {
  return raw
    .split(/[,\n\r\-|–>/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function StepRoute({ state, setState, onNext, onBack }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [rawRoute, setRawRoute] = useState(state.routeCities.join(" → "));
  const [aiStart, setAiStart] = useState("");
  const [aiEnd, setAiEnd] = useState("");
  const [aiNights, setAiNights] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));

  async function suggestRouteWithAi() {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/agent/suggest-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: aiStart, end: aiEnd, nights: aiNights, lang: state.lang }),
      });
      const data = (await res.json()) as { cities?: string[]; error?: string };
      const cities = data.cities;
      if (!res.ok || !cities) {
        setAiError(data.error ?? "Could not suggest route.");
        setAiLoading(false);
        return;
      }
      setRawRoute(cities.join(" → "));
      patch({
        routeCities: cities,
        cityNights: cities.map((_, i) => (i === cities.length - 1 ? 0 : 1)),
        cityVisits: cities.map(() => []),
        cityActivities: cities.map(() => []),
        cityHotels: cities.map(() => ({ name: "", url: "" })),
      });
    } catch {
      setAiError("Could not reach the server.");
    } finally {
      setAiLoading(false);
    }
  }

  const canProceed = state.routeCities.length >= 2;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Route</h2>
        <p className="text-sm text-ink/60">Enter the cities in order, or let AI suggest a route.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => patch({ routeMode: "manual" })}
          className={cn(
            "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
            state.routeMode === "manual" ? "border-deep bg-deep text-white" : "border-line bg-white text-ink hover:bg-cream"
          )}
        >
          Enter manually
        </button>
        <button
          type="button"
          onClick={() => patch({ routeMode: "ai" })}
          className={cn(
            "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
            state.routeMode === "ai" ? "border-deep bg-deep text-white" : "border-line bg-white text-ink hover:bg-cream"
          )}
        >
          ✨ Style my route
        </button>
      </div>

      {state.routeMode === "ai" ? (
        <SectionCard title="AI route suggestion">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start city">
              <TextInput value={aiStart} onChange={setAiStart} placeholder="Delhi" />
            </Field>
            <Field label="End city">
              <TextInput value={aiEnd} onChange={setAiEnd} placeholder="Jaipur" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Total nights">
              <NumberInput value={aiNights} onChange={(v) => setAiNights(v ?? 1)} min={1} max={30} />
            </Field>
          </div>
          <Button onClick={suggestRouteWithAi} variant="secondary" className="mt-3" disabled={aiLoading || !aiStart.trim() || !aiEnd.trim()}>
            {aiLoading ? "Thinking…" : "Suggest route"}
          </Button>
          {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
        </SectionCard>
      ) : null}

      <SectionCard title="Route cities">
        <TextArea
          value={rawRoute}
          onChange={(v) => {
            setRawRoute(v);
            const cities = parseRouteInput(v);
            patch({
              routeCities: cities,
              cityNights: cities.map((_, i) => (i === cities.length - 1 ? 0 : 1)),
              cityVisits: cities.map(() => []),
              cityActivities: cities.map(() => []),
              cityHotels: cities.map(() => ({ name: "", url: "" })),
            });
          }}
          rows={3}
          placeholder="Delhi → Agra → Jaipur → Delhi"
        />
        <p className="mt-2 text-xs text-ink/50">Tip: separate cities with commas, arrows or new lines.</p>
      </SectionCard>

      {state.routeCities.length > 0 && (
        <SectionCard title="Nights per city">
          <div className="space-y-3">
            {state.routeCities.map((city, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-cream/30 px-3 py-2">
                <span className="font-medium text-ink">{i + 1}. {city}</span>
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  Nights:
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={state.cityNights[i] ?? 1}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (isNaN(n) || n < 0) return;
                      setState((s) => ({
                        ...s,
                        cityNights: s.cityNights.map((v, idx) => (idx === i ? n : v)),
                      }));
                    }}
                    className="w-16 rounded border border-line px-2 py-1 text-sm"
                  />
                </label>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm font-medium text-deep">
            Total nights: {state.cityNights.reduce((a, b) => a + b, 0)}
          </p>
        </SectionCard>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost">← Back</Button>
        <Button onClick={onNext} variant="primary" disabled={!canProceed}>Next: Visits →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Visits per city
// ---------------------------------------------------------------------------
interface PexelsPhoto {
  id: number;
  thumb: string;
  url: string;
  full: string;
  photographer: string;
  photographerUrl: string;
  alt: string;
}

const TIME_SLOTS: { key: TimeOfDay; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

function StepVisits({ state, setState, onNext, onBack }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, PexelsPhoto[]>>({});
  const [photoLoading, setPhotoLoading] = useState<Record<string, boolean>>({});
  const [photoError, setPhotoError] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  const [learning, setLearning] = useState<Record<string, boolean>>({});

  function sightImageKey(city: string, sight: string): string {
    return `${city}:${sight}`.toLowerCase().trim();
  }

  function setVisits(cityIdx: number, updater: (prev: CityVisit[]) => CityVisit[]) {
    setState((s) => ({
      ...s,
      cityVisits: s.cityVisits.map((list, i) => (i === cityIdx ? updater(list || []) : list)),
    }));
  }

  function addVisit(cityIdx: number, title: string, timeOfDay: TimeOfDay) {
    const clean = title.trim();
    if (!clean) return;
    setVisits(cityIdx, (prev) => {
      if (prev.some((v) => v.title.toLowerCase() === clean.toLowerCase())) return prev;
      return [...prev, { title: clean, timeOfDay }];
    });
  }

  function removeVisit(cityIdx: number, title: string) {
    setVisits(cityIdx, (prev) => prev.filter((v) => v.title.toLowerCase() !== title.toLowerCase()));
  }

  function moveVisit(cityIdx: number, title: string, direction: -1 | 1) {
    const order: TimeOfDay[] = ["morning", "afternoon", "evening"];
    setVisits(cityIdx, (prev) =>
      prev.map((v) => {
        if (v.title.toLowerCase() !== title.toLowerCase()) return v;
        const idx = order.indexOf(v.timeOfDay);
        const next = idx + direction;
        if (next < 0 || next >= order.length) return v;
        return { ...v, timeOfDay: order[next] };
      })
    );
  }

  async function learnCustomVisit(cityIdx: number, city: string, slot: TimeOfDay) {
    const key = `${cityIdx}:${slot}`;
    const title = customInput[key]?.trim();
    if (!title) return;
    setLearning((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch("/api/sights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, title, lang: state.lang }),
      });
      const data = (await res.json()) as { title?: string; imageUrl?: string; error?: string };
      if (!res.ok) {
        console.error("Failed to learn sight:", data.error);
      } else {
        addVisit(cityIdx, data.title || title, slot);
        if (data.imageUrl) {
          selectPhoto(city, data.title || title, data.imageUrl);
        }
        setCustomInput((p) => ({ ...p, [key]: "" }));
      }
    } catch (err) {
      console.error("Learn sight error:", err);
    } finally {
      setLearning((p) => ({ ...p, [key]: false }));
    }
  }

  async function loadPhotos(city: string, sight: string) {
    const key = sightImageKey(city, sight);
    if (photos[key]?.length || photoLoading[key]) return;
    setPhotoLoading((p) => ({ ...p, [key]: true }));
    setPhotoError((p) => ({ ...p, [key]: "" }));
    try {
      const query = encodeURIComponent(`${sight} ${city} India`);
      const res = await fetch(`/api/photos/pexels?q=${query}`);
      const data = (await res.json()) as { photos?: PexelsPhoto[]; error?: string };
      if (!res.ok) {
        setPhotoError((p) => ({ ...p, [key]: data.error ?? "Could not load photos." }));
        setPhotos((p) => ({ ...p, [key]: [] }));
      } else {
        setPhotos((p) => ({ ...p, [key]: data.photos || [] }));
      }
    } catch {
      setPhotoError((p) => ({ ...p, [key]: "Could not load photos." }));
      setPhotos((p) => ({ ...p, [key]: [] }));
    } finally {
      setPhotoLoading((p) => ({ ...p, [key]: false }));
      setExpanded((p) => ({ ...p, [key]: true }));
    }
  }

  function selectPhoto(city: string, sight: string, url: string | null) {
    setState((s) => ({
      ...s,
      sightImages: {
        ...s.sightImages,
        [sightImageKey(city, sight)]: url ?? "",
      },
    }));
  }

  useEffect(() => {
    async function loadSuggestions() {
      const nextLoading: Record<number, boolean> = {};
      const nextSuggestions: Record<number, string[]> = {};
      for (let i = 0; i < state.routeCities.length; i++) {
        const city = state.routeCities[i];
        nextLoading[i] = true;
        try {
          const res = await fetch(`/api/sights?city=${encodeURIComponent(city)}`);
          const data = (await res.json()) as { sights?: string[] };
          nextSuggestions[i] = data.sights || [];
        } catch {
          nextSuggestions[i] = [];
        }
        nextLoading[i] = false;
      }
      setSuggestions(nextSuggestions);
      setLoading(nextLoading);
    }
    void loadSuggestions();
  }, [state.routeCities]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Visits</h2>
        <p className="text-sm text-ink/60">Choose sights for each time slot. Click a suggested sight to add it to Morning, then move it if needed. Type a custom visit to save it.</p>
      </div>

      <div className="space-y-4">
        {state.routeCities.map((city, i) => {
          const current = state.cityVisits[i] || [];
          const selectedTitles = new Set(current.map((v) => v.title.toLowerCase()));
          return (
            <SectionCard key={i} title={`${city} — ${state.cityNights[i] || 0} night${state.cityNights[i] === 1 ? "" : "s"}`}>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Suggested sights</p>
                {loading[i] ? (
                  <p className="text-sm text-ink/50">Loading suggestions…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set((suggestions[i] || []).map((s) => s.trim()))).map((sight) => {
                      const selected = selectedTitles.has(sight.toLowerCase());
                      return (
                        <button
                          key={sight}
                          type="button"
                          onClick={() => !selected && addVisit(i, sight, "morning")}
                          disabled={selected}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "border-deep bg-deep text-white"
                              : "border-line bg-white text-ink hover:bg-cream"
                          )}
                        >
                          {selected ? "✓ " : "+ "}{sight}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {TIME_SLOTS.map((slot) => {
                  const slotVisits = current.filter((v) => v.timeOfDay === slot.key);
                  const inputKey = `${i}:${slot.key}`;
                  return (
                    <div key={slot.key} className="rounded-lg border border-line bg-cream/20 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-deep">{slot.label}</p>
                      <div className="space-y-2">
                        {slotVisits.map((visit) => {
                          const key = sightImageKey(city, visit.title);
                          const chosen = state.sightImages[key];
                          return (
                            <div key={visit.title} className="rounded border border-line bg-white p-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-ink">{visit.title}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveVisit(i, visit.title, -1)}
                                    className="px-1 text-xs text-ink/60 hover:text-deep disabled:opacity-30"
                                    disabled={slot.key === "morning"}
                                  >←</button>
                                  <button
                                    type="button"
                                    onClick={() => moveVisit(i, visit.title, 1)}
                                    className="px-1 text-xs text-ink/60 hover:text-deep disabled:opacity-30"
                                    disabled={slot.key === "evening"}
                                  >→</button>
                                  <button
                                    type="button"
                                    onClick={() => removeVisit(i, visit.title)}
                                    className="px-1 text-xs text-red-600 hover:underline"
                                  >×</button>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                {chosen ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={chosen} alt={visit.title} className="h-10 w-14 rounded object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => loadPhotos(city, visit.title)}
                                      className="text-xs text-gold underline hover:text-deep"
                                    >Change</button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => loadPhotos(city, visit.title)}
                                    disabled={photoLoading[key]}
                                    className="text-xs text-gold underline hover:text-deep disabled:opacity-50"
                                  >{photoLoading[key] ? "Searching…" : "Add photo"}</button>
                                )}
                              </div>

                              {expanded[key] && photos[key] && photos[key].length > 0 && (
                                <div className="mt-2 grid grid-cols-4 gap-1">
                                  {photos[key].map((photo) => (
                                    <button
                                      key={photo.id}
                                      type="button"
                                      onClick={() => selectPhoto(city, visit.title, photo.url)}
                                      className={cn(
                                        "relative overflow-hidden rounded border-2 text-left",
                                        chosen === photo.url ? "border-deep" : "border-transparent hover:border-gold"
                                      )}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={photo.thumb} alt={photo.alt || visit.title} className="h-10 w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {expanded[key] && photos[key] && photos[key].length === 0 && !photoLoading[key] && (
                                <p className="mt-1 text-xs text-ink/50">No Pexels photos found.</p>
                              )}
                              {photoError[key] && <p className="mt-1 text-xs text-red-600">{photoError[key]}</p>}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-2 flex gap-2">
                        <TextInput
                          value={customInput[inputKey] || ""}
                          onChange={(v) => setCustomInput((p) => ({ ...p, [inputKey]: v }))}
                          placeholder="Add custom visit"
                          className="h-8 text-xs"
                        />
                        <Button
                          onClick={() => learnCustomVisit(i, city, slot.key)}
                          disabled={learning[inputKey] || !customInput[inputKey]?.trim()}
                          variant="primary"
                          className="h-8 px-2 text-xs"
                        >{learning[inputKey] ? "…" : "Add"}</Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2 text-xs text-ink/50">
                {current.length} visit{current.length === 1 ? "" : "s"} added
              </p>
            </SectionCard>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost">← Back</Button>
        <Button onClick={onNext} variant="primary">Next: Activities →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Activities
// ---------------------------------------------------------------------------
function StepActivities({ state, setState, onNext, onBack }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [customInput, setCustomInput] = useState<Record<number, string>>({});
  const [learning, setLearning] = useState<Record<number, boolean>>({});

  const updateActivities = (idx: number, activities: string[]) => {
    const seen = new Set<string>();
    const unique = activities.filter((v) => {
      const key = v.toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setState((s) => ({
      ...s,
      cityActivities: s.cityActivities.map((a, i) => (i === idx ? unique : a)),
    }));
  };

  const toggleActivity = (idx: number, activity: string) => {
    const current = state.cityActivities[idx] || [];
    const exists = current.map((v) => v.toLowerCase()).includes(activity.toLowerCase());
    const next = exists
      ? current.filter((v) => v.toLowerCase() !== activity.toLowerCase())
      : [...current, activity];
    updateActivities(idx, next);
  };

  async function learnCustomActivity(idx: number, city: string) {
    const title = customInput[idx]?.trim();
    if (!title) return;
    setLearning((p) => ({ ...p, [idx]: true }));
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, title, lang: state.lang }),
      });
      const data = (await res.json()) as { title?: string; error?: string };
      if (!res.ok) {
        console.error("Failed to learn activity:", data.error);
      } else {
        updateActivities(idx, [...(state.cityActivities[idx] || []), data.title || title]);
        setCustomInput((p) => ({ ...p, [idx]: "" }));
      }
    } catch (err) {
      console.error("Learn activity error:", err);
    } finally {
      setLearning((p) => ({ ...p, [idx]: false }));
    }
  }

  useEffect(() => {
    async function loadSuggestions() {
      const nextLoading: Record<number, boolean> = {};
      const nextSuggestions: Record<number, string[]> = {};
      for (let i = 0; i < state.routeCities.length; i++) {
        const city = state.routeCities[i];
        nextLoading[i] = true;
        try {
          const res = await fetch(`/api/activities?city=${encodeURIComponent(city)}`);
          const data = (await res.json()) as { activities?: string[] };
          nextSuggestions[i] = data.activities || [];
        } catch {
          nextSuggestions[i] = [];
        }
        nextLoading[i] = false;
      }
      setSuggestions(nextSuggestions);
      setLoading(nextLoading);
    }
    void loadSuggestions();
  }, [state.routeCities]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Activities & Experiences</h2>
        <p className="text-sm text-ink/60">Pick suggested experiences or add your own. Custom activities are saved with an AI-generated description.</p>
      </div>

      <div className="space-y-4">
        {state.routeCities.map((city, i) => {
          const current = state.cityActivities[i] || [];
          return (
            <SectionCard key={i} title={`${city} — ${state.cityNights[i] || 0} night${state.cityNights[i] === 1 ? "" : "s"}`}>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Suggested experiences</p>
                {loading[i] ? (
                  <p className="text-sm text-ink/50">Loading suggestions…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set((suggestions[i] || []).map((a) => a.trim()))).map((activity) => {
                      const selected = current.map((v) => v.toLowerCase()).includes(activity.toLowerCase());
                      return (
                        <button
                          key={activity}
                          type="button"
                          onClick={() => toggleActivity(i, activity)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "border-deep bg-deep text-white"
                              : "border-line bg-white text-ink hover:bg-cream"
                          )}
                        >
                          {selected ? "✓ " : "+ "}{activity}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {current.length > 0 && (
                <div className="mt-3 rounded-lg border border-line bg-cream/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Selected</p>
                  <div className="flex flex-wrap gap-2">
                    {current.map((activity) => (
                      <span
                        key={activity}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs"
                      >
                        {activity}
                        <button
                          type="button"
                          onClick={() => toggleActivity(i, activity)}
                          className="text-red-600 hover:underline"
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <TextInput
                  value={customInput[i] || ""}
                  onChange={(v) => setCustomInput((p) => ({ ...p, [i]: v }))}
                  placeholder="Add custom activity"
                  className="h-8 text-xs"
                />
                <Button
                  onClick={() => learnCustomActivity(i, city)}
                  disabled={learning[i] || !customInput[i]?.trim()}
                  variant="primary"
                  className="h-8 px-2 text-xs"
                >{learning[i] ? "…" : "Add"}</Button>
              </div>

              <p className="mt-2 text-xs text-ink/50">
                {current.length} experience{current.length === 1 ? "" : "s"} added
              </p>
            </SectionCard>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost">← Back</Button>
        <Button onClick={onNext} variant="primary">Next: Hotels →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Hotels
// ---------------------------------------------------------------------------
function StepHotels({ state, setState, onNext, onBack }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [fetching, setFetching] = useState<Record<number, boolean>>({});
  const [fetched, setFetched] = useState<Record<number, boolean>>({});

  const updateHotel = (idx: number, hotel: CityHotel) => {
    setState((s) => ({
      ...s,
      cityHotels: s.cityHotels.map((h, i) => (i === idx ? hotel : h)),
    }));
  };

  async function fetchHotelUrl(idx: number) {
    const city = state.routeCities[idx];
    const name = state.cityHotels[idx]?.name;
    if (!city?.trim() || !name?.trim()) return;
    setFetching((f) => ({ ...f, [idx]: true }));
    try {
      const res = await fetch(`/api/hotel/url?city=${encodeURIComponent(city)}&name=${encodeURIComponent(name)}`);
      const data = (await res.json()) as { url?: string; source?: string };
      if (data.url) {
        updateHotel(idx, { ...state.cityHotels[idx], url: data.url });
      }
      setFetched((f) => ({ ...f, [idx]: true }));
    } catch {
      setFetched((f) => ({ ...f, [idx]: true }));
    } finally {
      setFetching((f) => ({ ...f, [idx]: false }));
    }
  }

  const canProceed = state.cityHotels.every((h) => h.name.trim());

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Hotels</h2>
        <p className="text-sm text-ink/60">Enter the hotel name for each city. The website link will be fetched automatically.</p>
      </div>

      <div className="space-y-4">
        {state.routeCities.map((city, i) => (
          <SectionCard key={i} title={city}>
            <Field label="Hotel name" required>
              <TextInput
                value={state.cityHotels[i]?.name || ""}
                onChange={(v) => {
                  updateHotel(i, { ...state.cityHotels[i], name: v, url: "" });
                  setFetched((f) => ({ ...f, [i]: false }));
                }}
                placeholder="e.g. The Oberoi Amarvilas"
              />
            </Field>

            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={() => void fetchHotelUrl(i)}
                variant="secondary"
                disabled={!state.cityHotels[i]?.name.trim() || fetching[i] || fetched[i]}
              >
                {fetching[i] ? "Finding link…" : fetched[i] ? "Link found" : "Find website link"}
              </Button>
              {state.cityHotels[i]?.url && (
                <a
                  href={state.cityHotels[i].url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-gold underline"
                >
                  {state.cityHotels[i].url}
                </a>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost">← Back</Button>
        <Button onClick={onNext} variant="primary" disabled={!canProceed}>Next: Weather →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Weather (conditional)
// ---------------------------------------------------------------------------
function StepWeather({ state, setState, onNext, onBack }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  useEffect(() => {
    if (!state.startDate && state.includeWeather !== false) {
      setState((s) => ({ ...s, includeWeather: false }));
    }
  }, [state.startDate, state.includeWeather, setState]);

  if (!state.startDate) {
    return (
      <div className="space-y-5">
        <h2 className="font-serif text-xl font-bold text-deep">Weather</h2>
        <p className="text-sm text-ink/60">No arrival date was entered, so weather will not be added.</p>
        <div className="flex items-center justify-between pt-2">
          <Button onClick={onBack} variant="ghost">← Back</Button>
          <Button onClick={onNext} variant="primary">Next: Review →</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Weather</h2>
        <p className="text-sm text-ink/60">Arrival date: {state.startDate}</p>
      </div>

      <SectionCard title="Add weather to each day?">
        <p className="mb-3 text-sm text-ink/70">AI will generate a plausible weather line for each date and city.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, includeWeather: true }))}
            className={cn(
              "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
              state.includeWeather === true ? "border-deep bg-deep text-white" : "border-line bg-white text-ink hover:bg-cream"
            )}
          >
            Yes, add weather
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, includeWeather: false }))}
            className={cn(
              "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
              state.includeWeather === false ? "border-deep bg-deep text-white" : "border-line bg-white text-ink hover:bg-cream"
            )}
          >
            No, skip weather
          </button>
        </div>
      </SectionCard>

      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost">← Back</Button>
        <Button onClick={onNext} variant="primary" disabled={state.includeWeather === null}>Generate itinerary →</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Review
// ---------------------------------------------------------------------------
function StepReview({ state, itinerary, review, onBack, onConfirm, onRestart }: {
  state: WizardState;
  itinerary: object | null;
  review: ReviewNote[] | null;
  onBack: () => void;
  onConfirm: () => void;
  onRestart: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [savedQuestion, setSavedQuestion] = useState(false);

  async function submitQuestion() {
    if (!question.trim()) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: question }),
      });
      setSavedQuestion(true);
    } catch { /* ignore */ }
  }

  if (!itinerary) {
    return (
      <div className="space-y-5">
        <h2 className="font-serif text-xl font-bold text-deep">Review</h2>
        <p className="text-sm text-ink/60">Something went wrong while generating the itinerary.</p>
        <Button onClick={onBack} variant="secondary">Go back & edit</Button>
      </div>
    );
  }

  const warnings = (review || []).filter((n) => n.type === "warning");
  const infos = (review || []).filter((n) => n.type === "info");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-deep">Your itinerary is ready</h2>
        <p className="text-sm text-ink/60">Review it below. Any changes?</p>
      </div>

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
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Notes</p>
          {infos.map((n, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="shrink-0 font-semibold text-blue-700">{n.scope}</span>
              <span className="text-blue-900">{n.message}</span>
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Summary">
        <ul className="space-y-1 text-sm text-ink/80">
          <li><strong>Client:</strong> {state.client}</li>
          <li><strong>Route:</strong> {state.routeCities.join(" → ")}</li>
          <li><strong>Nights:</strong> {state.cityNights.reduce((a, b) => a + b, 0)}</li>
          <li><strong>Meals:</strong> {[
            state.mealPlan.b && "Breakfast",
            state.mealPlan.l && "Lunch",
            state.mealPlan.d && "Dinner",
          ].filter(Boolean).join(", ") || "None"}</li>
          <li><strong>Weather:</strong> {state.includeWeather ? "Yes" : "No"}</li>
        </ul>
      </SectionCard>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={onConfirm} variant="primary">Open in editor →</Button>
        <Button onClick={onBack} variant="secondary">Make changes</Button>
        <Button onClick={onRestart} variant="ghost">Start over</Button>
      </div>

      <SectionCard title="Any questions?">
        <TextArea
          value={question}
          onChange={setQuestion}
          rows={3}
          placeholder="Ask anything about this itinerary..."
        />
        <Button onClick={submitQuestion} variant="secondary" className="mt-3" disabled={!question.trim() || savedQuestion}>
          {savedQuestion ? "Question sent" : "Send question"}
        </Button>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------
export default function WizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(emptyState());
  const [assembling, setAssembling] = useState(false);

  // Load saved language after hydration to avoid SSR/client mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("itb:pref-lang");
      if (saved && (saved === "fr" || saved === "en" || saved === "de")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((s) => ({ ...s, lang: saved as Lang }));
      }
    } catch { /* ignore */ }
  }, []);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewNote[] | null>(null);
  const [itinerary, setItinerary] = useState<object | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const estimatedTotal = 60; // seconds, used for the progress estimate

  const totalSteps = 7;

  useEffect(() => {
    if (!assembling) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const seconds = (Date.now() - start) / 1000;
      setElapsed(seconds);
      // Ease-out progress: approach 90% over estimatedTotal, then crawl.
      const pct = seconds < estimatedTotal
        ? 90 * (1 - Math.exp(-3 * (seconds / estimatedTotal)))
        : 90 + 9 * (1 - Math.exp(-(seconds - estimatedTotal) / 30));
      setProgress(Math.min(pct, 99));
    }, 500);
    return () => clearInterval(interval);
  }, [assembling]);

  async function assemble() {
    setAssembling(true);
    setError("");
    setProgress(0);
    setElapsed(0);
    try {
      const payload = {
        client: state.client,
        lang: state.lang,
        dates: state.dates,
        startDate: parseDate(state.startDate),
        mealPlan: state.mealPlan,
        route: state.routeCities,
        nights: state.cityNights,
        visits: state.cityVisits,
        activities: state.cityActivities,
        hotels: state.cityHotels,
        includeWeather: state.includeWeather ?? false,
        sightImages: state.sightImages,
      };
      const res = await fetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { itinerary?: object; review?: ReviewNote[]; error?: string };
      if (!res.ok || !data.itinerary) {
        setError(data.error ?? "Assembly failed.");
        setAssembling(false);
        return;
      }
      setItinerary(data.itinerary);
      setReview(data.review ?? []);
      setProgress(100);
      setAssembling(false);
      setStep(6);
    } catch {
      setError("Could not reach the server.");
      setAssembling(false);
    }
  }

  function confirmAndOpen() {
    if (!itinerary) return;
    try {
      const saved = {
        id: crypto.randomUUID(),
        name: state.client || "Wizard itinerary",
        savedAt: new Date().toISOString(),
        data: itinerary,
      };
      const existing = JSON.parse(window.localStorage.getItem("itb:saved") ?? "[]") as object[];
      window.localStorage.setItem("itb:saved", JSON.stringify([saved, ...existing]));
      window.localStorage.setItem("itb:wizard", JSON.stringify(itinerary));
      window.localStorage.setItem("itb:pref-lang", state.lang);
    } catch { /* ignore storage errors */ }
    router.push("/?from=wizard");
  }

  if (assembling) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-deep mx-auto" />
          <p className="mt-4 font-semibold text-deep">Building your itinerary…</p>
          <p className="text-sm text-ink/50">AI is writing descriptions, transitions and finding images.</p>

          <div className="mt-6">
            <div className="flex justify-between text-xs text-ink/60 mb-1">
              <span>{Math.round(progress)}%</span>
              <span>{elapsed > estimatedTotal ? "Finalizing…" : `~${Math.max(1, Math.round(estimatedTotal - elapsed))}s remaining`}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-deep transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {elapsed > estimatedTotal && (
              <p className="mt-2 text-xs text-amber-600">Taking longer than usual — still working…</p>
            )}
          </div>

          <p className="mt-4 text-xs text-ink/40">First run can take 30–60 seconds while images are generated; subsequent runs reuse them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local logo asset */}
            <img
              src="/assets/orient-logo.jpg"
              alt="Orient Express Travels & Tours"
              className="h-9 w-auto rounded object-contain"
            />
            <span className="font-serif text-xl font-bold text-deep">New Itinerary</span>
            <span className="hidden text-sm text-ink/50 sm:inline">Wizard</span>
          </div>
          <StepIndicator current={step} total={totalSteps} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {step === 0 && (
            <StepTripBasics
              state={state}
              setState={setState}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <StepRoute
              state={state}
              setState={setState}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <StepVisits
              state={state}
              setState={setState}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StepActivities
              state={state}
              setState={setState}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <StepHotels
              state={state}
              setState={setState}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <StepWeather
              state={state}
              setState={setState}
              onNext={() => void assemble()}
              onBack={() => setStep(4)}
            />
          )}

          {step === 6 && (
            <StepReview
              state={state}
              itinerary={itinerary}
              review={review}
              onBack={() => setStep(0)}
              onConfirm={confirmAndOpen}
              onRestart={() => {
                setState(emptyState());
                setItinerary(null);
                setReview(null);
                setStep(0);
              }}
            />
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>
      </main>
    </div>
  );
}

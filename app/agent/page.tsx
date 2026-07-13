"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Itinerary, Lang } from "@/lib/itinerary/types";
import { LANGS } from "@/lib/itinerary/types";
import { Button, Field, NumberInput, TextInput, TextArea, cn } from "@/components/ui";
import { PreviewPane } from "@/components/PreviewPane";

const STYLES = [
  { value: "culture", label: "Culture & Heritage" },
  { value: "nature", label: "Nature & Wildlife" },
  { value: "luxury", label: "Luxury & Relaxation" },
  { value: "family", label: "Family" },
  { value: "adventure", label: "Adventure" },
  { value: "romantic", label: "Romantic" },
] as const;

const BUDGETS = [
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "luxury", label: "Luxury" },
] as const;

type FormState = {
  client: string;
  lang: Lang;
  startCity: string;
  endCity: string;
  totalNights: number;
  arrivalDate: string;
  style: (typeof STYLES)[number]["value"];
  budget: (typeof BUDGETS)[number]["value"];
  travelers: number;
  notes: string;
};

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function AgentPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    client: "",
    lang: "fr",
    startCity: "Delhi",
    endCity: "Jaipur",
    totalNights: 7,
    arrivalDate: todayIso(),
    style: "culture",
    budget: "luxury",
    travelers: 2,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [downloading, setDownloading] = useState(false);

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setItinerary(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: form.client,
          lang: form.lang,
          startCity: form.startCity,
          endCity: form.endCity,
          totalNights: form.totalNights,
          arrivalDate: form.arrivalDate,
          style: form.style,
          budget: form.budget,
          travelers: form.travelers,
          notes: form.notes,
        }),
      });
      const data = (await res.json()) as { itinerary?: Itinerary; error?: string };
      if (!res.ok || !data.itinerary) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setItinerary(data.itinerary);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function openInEditor() {
    if (!itinerary) return;
    try {
      const saved = {
        id: crypto.randomUUID(),
        name: itinerary.preparedFor || "Agent itinerary",
        savedAt: new Date().toISOString(),
        data: itinerary,
      };
      const existing = JSON.parse(window.localStorage.getItem("itb:saved") ?? "[]") as object[];
      window.localStorage.setItem("itb:saved", JSON.stringify([saved, ...existing]));
      window.localStorage.setItem("itb:wizard", JSON.stringify(itinerary));
    } catch { /* ignore storage errors */ }
    router.push("/?from=wizard");
  }

  async function downloadWord() {
    if (!itinerary) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itinerary),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to generate Word document.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Itineraire_${itinerary.preparedFor.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the Word document.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-xl font-bold text-deep">AI Itinerary Agent</span>
            <span className="hidden text-sm text-ink/50 sm:inline">Powered by Gemini</span>
          </div>
          <Link href="/" className="text-sm font-medium text-deep underline-offset-2 hover:underline">
            ← Back to editor
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* Form */}
          <div>
            <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h1 className="font-serif text-lg font-bold text-deep">Plan a new trip</h1>
              <p className="mt-1 text-sm text-ink/60">
                Tell us about the trip and the agent will build a complete itinerary.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <Field label="Client name" required>
                  <TextInput
                    value={form.client}
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
                          form.lang === l.code
                            ? "border-deep bg-deep text-white"
                            : "border-line bg-white text-ink hover:bg-cream"
                        )}
                      >
                        {l.native}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start city" required>
                    <TextInput
                      value={form.startCity}
                      onChange={(v) => patch({ startCity: v })}
                      placeholder="e.g. Delhi"
                    />
                  </Field>
                  <Field label="End city" required>
                    <TextInput
                      value={form.endCity}
                      onChange={(v) => patch({ endCity: v })}
                      placeholder="e.g. Jaipur"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Total nights" required>
                    <NumberInput
                      value={form.totalNights}
                      onChange={(v) => patch({ totalNights: v ?? 1 })}
                      min={1}
                      max={60}
                    />
                  </Field>
                  <Field label="Travelers" required>
                    <NumberInput
                      value={form.travelers}
                      onChange={(v) => patch({ travelers: v ?? 1 })}
                      min={1}
                      max={50}
                    />
                  </Field>
                </div>

                <Field label="Arrival date" required>
                  <TextInput
                    type="date"
                    value={form.arrivalDate}
                    onChange={(v) => patch({ arrivalDate: v })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Style">
                    <select
                      value={form.style}
                      onChange={(e) => patch({ style: e.target.value as FormState["style"] })}
                      className={cn(
                        "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
                      )}
                    >
                      {STYLES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Budget">
                    <select
                      value={form.budget}
                      onChange={(e) => patch({ budget: e.target.value as FormState["budget"] })}
                      className={cn(
                        "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
                      )}
                    >
                      {BUDGETS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Extra notes" hint="Any special requests, must-see places, or constraints.">
                  <TextArea
                    value={form.notes}
                    onChange={(v) => patch({ notes: v })}
                    rows={3}
                    placeholder="e.g. Avoid long drives, include a sunrise Taj Mahal visit..."
                  />
                </Field>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={loading || !form.client.trim() || !form.startCity.trim() || !form.endCity.trim()}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Building itinerary…
                    </span>
                  ) : (
                    "✨ Generate Itinerary"
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* Preview */}
          <div>
            {!itinerary ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-cream/30 p-8 text-center">
                <div className="text-4xl">✨</div>
                <p className="mt-3 font-serif text-lg font-semibold text-deep">
                  Your itinerary will appear here
                </p>
                <p className="mt-1 max-w-sm text-sm text-ink/60">
                  Fill in the form and click “Generate Itinerary”. The agent reads your content library and builds a complete Privilège Voyage-format document.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-deep/70">
                      {itinerary.tripSummary.dates}
                    </p>
                    <p className="font-serif text-base font-bold text-deep">
                      {itinerary.preparedFor}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={openInEditor} variant="secondary">
                      Open in editor
                    </Button>
                    <Button onClick={downloadWord} variant="primary" disabled={downloading}>
                      {downloading ? "Downloading…" : "Download Word"}
                    </Button>
                  </div>
                </div>

                <div className="scroll-thin max-h-[calc(100vh-220px)] overflow-y-auto rounded-xl border border-line bg-cream/40 p-3 shadow-inner">
                  <PreviewPane itinerary={itinerary} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Itinerary } from "@/lib/itinerary/types";
import { emptyItinerary, ensureItineraryIds } from "@/lib/itinerary/factory";
import { Toolbar, type VerifyNote } from "@/components/Toolbar";
import { LanguageBar } from "@/components/LanguageBar";
import { PreviewPane } from "@/components/PreviewPane";
import { CoverSection } from "@/components/sections/CoverSection";
import { HighlightsSection } from "@/components/sections/HighlightsSection";
import { DaysSection } from "@/components/sections/DaysSection";

export default function Home() {
  const [itinerary, setItinerary] = useState<Itinerary>(emptyItinerary);
  const [verifyNotes, setVerifyNotes] = useState<VerifyNote[] | null>(null);

  const patch = useCallback((partial: Partial<Itinerary>) => {
    setItinerary((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadItinerary = useCallback((it: Itinerary) => {
    setItinerary(ensureItineraryIds(it));
  }, []);

  const handleVerify = useCallback((notes: VerifyNote[]) => {
    setVerifyNotes(notes);
  }, []);

  // When redirected from the wizard, auto-load the assembled itinerary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "wizard") return;
    try {
      const raw = window.localStorage.getItem("itb:wizard");
      if (!raw) return;
      const it = JSON.parse(raw) as Itinerary;
      // This is a one-time hydration from localStorage on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItinerary(ensureItineraryIds(it));
      window.localStorage.removeItem("itb:wizard");
      // Clean up URL without triggering a navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []); // run once on mount

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Header + toolbar */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local logo asset */}
              <img
                src="/assets/orient-logo.jpg"
                alt="Orient Express Travels & Tours"
                className="h-10 w-auto rounded object-contain"
              />
              <h1 className="font-serif text-xl font-bold text-deep">Itinerary Builder</h1>
            </Link>
            <Link
              href="/wizard"
              className="rounded-lg bg-deep px-3 py-1 text-sm font-semibold text-white hover:bg-deep/90"
            >
              ✨ New Wizard
            </Link>
            <Link
              href="/agent"
              className="rounded-lg border border-deep bg-white px-3 py-1 text-sm font-semibold text-deep hover:bg-deep/5"
            >
              🤖 AI Agent
            </Link>
            <Link
              href="/library"
              className="text-sm font-medium text-deep underline-offset-2 hover:underline"
            >
              📚 Library
            </Link>
            <span className="hidden text-sm text-ink/55 sm:inline">
              Answer the questions · export a Word document
            </span>
          </div>
          <Toolbar itinerary={itinerary} onLoad={loadItinerary} onVerify={handleVerify} />
        </div>
      </header>

      {/* Verify notes */}
      {verifyNotes && verifyNotes.length > 0 && (
        <div className="mx-auto max-w-[1600px] px-5 pt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">AI Verification</p>
              <button
                type="button"
                onClick={() => setVerifyNotes(null)}
                className="text-xs text-amber-700 hover:text-amber-900"
              >
                Dismiss
              </button>
            </div>
            <ul className="space-y-1.5">
              {verifyNotes.map((n, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className={`shrink-0 font-semibold ${n.type === "warning" ? "text-red-600" : n.type === "ok" ? "text-emerald-600" : "text-amber-700"}`}>
                    {n.type === "warning" ? "⚠" : n.type === "ok" ? "✓" : "ℹ"} {n.scope}
                  </span>
                  <span className="text-amber-900">{n.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Two-pane editor */}
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: the form */}
        <div className="space-y-5">
          <LanguageBar itinerary={itinerary} onChange={loadItinerary} />
          <CoverSection itinerary={itinerary} patch={patch} />
          <HighlightsSection itinerary={itinerary} patch={patch} />
          <DaysSection itinerary={itinerary} patch={patch} />
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-[68px] lg:h-[calc(100vh-92px)]">
          <div className="scroll-thin h-full overflow-y-auto rounded-xl border border-line bg-cream/40 p-3 shadow-inner">
            <PreviewPane itinerary={itinerary} />
          </div>
        </div>
      </main>
    </div>
  );
}

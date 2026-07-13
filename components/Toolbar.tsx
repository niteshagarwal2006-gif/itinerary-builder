"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { sampleItinerary } from "@/lib/itinerary/sample";
import { emptyItinerary } from "@/lib/itinerary/factory";
import type { Itinerary } from "@/lib/itinerary/types";

const STORAGE_KEY = "itb:saved";

/** A single persisted itinerary entry kept in localStorage. */
interface SavedEntry {
  id: string;
  name: string;
  savedAt: string;
  data: Itinerary;
}

/** Read and validate the saved-entries array from localStorage. */
function readSaved(): SavedEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedEntry =>
        Boolean(e) &&
        typeof (e as SavedEntry).id === "string" &&
        typeof (e as SavedEntry).name === "string" &&
        typeof (e as SavedEntry).savedAt === "string" &&
        Boolean((e as SavedEntry).data)
    );
  } catch {
    return [];
  }
}

/** Persist the saved-entries array; returns true on success. */
function writeSaved(entries: SavedEntry[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Pull a filename out of a Content-Disposition header, if present. */
function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  // Prefer RFC 5987 filename*=UTF-8''... then fall back to plain filename="...".
  const star = /filename\*=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename="?([^"";]+)"?/i.exec(header);
  return plain?.[1];
}

/** Trigger a browser download for the given Blob under the given filename. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Toolbar({
  itinerary,
  onLoad,
}: {
  itinerary: Itinerary;
  onLoad: (it: Itinerary) => void;
}) {
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Hydration-safe: localStorage only exists on the client, so the saved list
    // is read after mount rather than during render to avoid an SSR mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readSaved());
  }, []);

  function refreshSaved(): SavedEntry[] {
    const next = readSaved();
    setSaved(next);
    return next;
  }

  async function handleGenerate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itinerary),
      });
      if (!res.ok) {
        let message = `Generation failed (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* response had no JSON body */
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const name =
        filenameFromDisposition(res.headers.get("Content-Disposition")) ??
        "Itineraire.docx";
      downloadBlob(blob, name);
    } catch {
      setError("Could not reach the server to generate the document.");
    } finally {
      setBusy(false);
    }
  }

  function handleSave(): void {
    setError(null);
    const defaultName = itinerary.preparedFor || "Untitled";
    const name = window.prompt("Name this saved itinerary:", defaultName);
    if (name === null) return; // user cancelled
    const entry: SavedEntry = {
      id: crypto.randomUUID(),
      name: name.trim() || defaultName,
      savedAt: new Date().toISOString(),
      data: itinerary,
    };
    const next = [entry, ...readSaved()];
    if (writeSaved(next)) {
      setSaved(next);
      setSelectedId(entry.id);
    } else {
      setError("Could not save to local storage.");
    }
  }

  function handleSelect(id: string): void {
    setSelectedId(id);
    if (!id) return;
    setError(null);
    const entry = refreshSaved().find((e) => e.id === id);
    if (entry) {
      onLoad(entry.data);
    } else {
      setError("That saved itinerary could not be found.");
    }
  }

  function handleDelete(): void {
    if (!selectedId) return;
    setError(null);
    const target = saved.find((e) => e.id === selectedId);
    const label = target ? `"${target.name}"` : "this itinerary";
    if (!window.confirm(`Delete the saved itinerary ${label}?`)) return;
    const next = readSaved().filter((e) => e.id !== selectedId);
    if (writeSaved(next)) {
      setSaved(next);
      setSelectedId("");
    } else {
      setError("Could not update local storage.");
    }
  }

  function handleExportJson(): void {
    setError(null);
    try {
      const base = itinerary.preparedFor.trim() || "itinerary";
      const slug =
        base
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 60) || "itinerary";
      const blob = new Blob([JSON.stringify(itinerary, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `${slug}.json`);
    } catch {
      setError("Could not export JSON.");
    }
  }

  function handleImportFile(file: File): void {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as Itinerary;
        if (
          !parsed ||
          typeof parsed.preparedFor !== "string" ||
          !Array.isArray(parsed.days)
        ) {
          setError("That file is not a valid itinerary.");
          return;
        }
        onLoad(parsed);
      } catch {
        setError("Could not read that file as JSON.");
      }
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(file);
  }

  function handleNew(): void {
    setError(null);
    if (window.confirm("Start a new itinerary? Unsaved changes will be lost.")) {
      onLoad(emptyItinerary());
    }
  }

  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void handleGenerate()}
          disabled={busy}
        >
          {busy ? "Generating…" : "Generate Word"}
        </Button>

        <span className="mx-1 h-6 w-px bg-line" aria-hidden />

        <Button onClick={handleSave} disabled={busy}>
          Save
        </Button>

        <div className="flex items-center gap-1">
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={busy || saved.length === 0}
            aria-label="Load a saved itinerary"
            className={cn(
              "rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink shadow-sm outline-none transition focus:border-deep focus:ring-2 focus:ring-deep/15 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <option value="">
              {saved.length === 0 ? "No saved itineraries" : "Load saved…"}
            </option>
            {saved.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {new Date(e.savedAt).toLocaleString()}
              </option>
            ))}
          </select>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={busy || !selectedId}
            title="Delete the selected saved itinerary"
          >
            Delete
          </Button>
        </div>

        <span className="mx-1 h-6 w-px bg-line" aria-hidden />

        <Button onClick={handleExportJson} disabled={busy}>
          Export JSON
        </Button>
        <Button
          onClick={() => importInputRef.current?.click()}
          disabled={busy}
        >
          Import JSON
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = "";
          }}
        />

        <span className="mx-1 h-6 w-px bg-line" aria-hidden />

        <Button onClick={() => onLoad(sampleItinerary)} disabled={busy}>
          Load sample
        </Button>
        <Button variant="ghost" onClick={handleNew} disabled={busy}>
          New
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { LibType, LibEntry } from "@/lib/library-types";
import type { Lang } from "@/lib/itinerary/types";
import { entryLabel } from "@/lib/library-types";
import { fetchLibrary } from "@/lib/libraryClient";
import { Button, cn } from "@/components/ui";

/**
 * A compact "insert from library" picker. Opens a searchable dropdown of saved
 * entries of `type`; selecting one calls `onSelect` with the full entry.
 * Pass `lang` to filter entries to a specific output language.
 * Pass `defaultQuery` to pre-fill the search box (e.g. the current city name).
 */
export function LibraryPicker<T extends LibEntry>({
  type,
  onSelect,
  label = "Library",
  lang,
  defaultQuery = "",
  cityFilter,
}: {
  type: LibType;
  onSelect: (entry: T) => void;
  label?: string;
  lang?: Lang;
  defaultQuery?: string;
  /** When set, only entries from this city are shown (strict filter). */
  cityFilter?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery);
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Fetch (debounced) whenever open and query or lang changes.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetchLibrary(type, q, lang, cityFilter);
      if (active) {
        setEntries(res);
        setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, q, type, lang, cityFilter]);

  return (
    <div className="relative inline-block" ref={ref}>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        📚 {label}
      </Button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-line bg-white p-2 shadow-lg">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="mb-2 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
          />
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <p className="px-1 py-2 text-xs text-ink/50">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink/50">
                {q ? "No results." : "Library is empty."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {entries.map((e) => {
                  const sub =
                    (e as { city?: string; country?: string }).city ||
                    (e as { country?: string }).country ||
                    "";
                  const img = (e as { image?: { src?: string; url?: string } }).image;
                  const thumb = img?.src || img?.url;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(e as T);
                          setOpen(false);
                          setQ(defaultQuery);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-cream"
                        )}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-md object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cream text-xs text-ink/30">—</span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">
                          {entryLabel(type, e)}
                        </span>
                        {sub && (
                          <span className="shrink-0 text-xs uppercase tracking-wide text-ink/45">
                            {sub}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

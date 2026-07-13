"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  LibType,
  LibEntry,
  LibHotel,
  LibSight,
  LibCity,
} from "@/lib/library-types";
import { entryLabel } from "@/lib/library-types";
import { fetchLibrary, deleteFromLibrary } from "@/lib/libraryClient";
import { Button, cn } from "@/components/ui";

const TABS: { type: LibType; label: string }[] = [
  { type: "hotels", label: "Hotels" },
  { type: "sights", label: "Sights" },
  { type: "activities", label: "Activities" },
  { type: "cities", label: "Cities" },
];

export default function LibraryPage() {
  const [type, setType] = useState<LibType>("hotels");
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: LibType, query: string) => {
    setLoading(true);
    const res = await fetchLibrary(t, query);
    setEntries(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(type, q), 150);
    return () => clearTimeout(id);
  }, [type, q, load]);

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this entry from the library?")) return;
    if (await deleteFromLibrary(type, id)) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <h1 className="font-serif text-xl font-bold text-deep">Content library</h1>
          <Link href="/">
            <Button variant="secondary">← Back to editor</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        {/* Tabs */}
        <div className="mb-4 flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => {
                setType(t.type);
                setQ("");
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                type === t.type
                  ? "border-transparent bg-deep text-white"
                  : "border-line bg-white text-deep hover:bg-cream"
              )}
            >
              {t.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="ml-auto w-56 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-deep focus:ring-2 focus:ring-deep/15"
          />
        </div>

        {loading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-paper p-8 text-center text-sm text-ink/50">
            {q
              ? "No results."
              : "No entries yet. Save hotels and sights from the editor to reuse them."}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-lg border border-line bg-white p-3 shadow-sm"
              >
                <EntryThumb type={type} entry={e} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-serif font-semibold text-deep">
                      {entryLabel(type, e)}
                    </h3>
                    <span className="rounded bg-cream px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink/55">
                      {e.lang}
                    </span>
                  </div>
                  <EntryMeta type={type} entry={e} />
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(e.id)}
                  className="shrink-0 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function EntryThumb({ type, entry }: { type: LibType; entry: LibEntry }) {
  const img =
    type === "hotels"
      ? (entry as LibHotel).image
      : type === "sights" || type === "activities"
        ? (entry as LibSight).image
        : undefined;
  if (!img?.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.url}
      alt=""
      className="h-14 w-20 shrink-0 rounded object-cover ring-1 ring-line"
    />
  );
}

function EntryMeta({ type, entry }: { type: LibType; entry: LibEntry }) {
  if (type === "hotels") {
    const h = entry as LibHotel;
    return (
      <p className="mt-0.5 line-clamp-2 text-sm text-ink/65">
        {[h.city, h.category].filter(Boolean).join(" · ")}
        {h.url && (
          <>
            {" "}
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-gold underline">
              site
            </a>
          </>
        )}
        {h.description ? ` — ${h.description}` : ""}
      </p>
    );
  }
  if (type === "sights" || type === "activities") {
    const s = entry as LibSight;
    return (
      <p className="mt-0.5 line-clamp-2 text-sm text-ink/65">
        {s.city ? `${s.city} — ` : ""}
        {s.description}
      </p>
    );
  }
  const c = entry as LibCity;
  return (
    <p className="mt-0.5 line-clamp-2 text-sm text-ink/65">
      {c.country ? `${c.country} — ` : ""}
      {c.intro}
    </p>
  );
}

import type { LibType, LibEntry } from "./library-types";
import type { Lang } from "./itinerary/types";

/** Search the library for entries of a given type, optionally filtered by language and/or city. */
export async function fetchLibrary(
  type: LibType,
  q: string,
  lang?: Lang,
  city?: string
): Promise<LibEntry[]> {
  try {
    const url = new URL("/api/library", window.location.origin);
    url.searchParams.set("type", type);
    url.searchParams.set("q", q);
    if (lang) url.searchParams.set("lang", lang);
    if (city) url.searchParams.set("city", city);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return (data.entries as LibEntry[]) ?? [];
  } catch {
    return [];
  }
}

/** Save (insert or update) an entry in the library. */
export async function saveToLibrary(
  type: LibType,
  entry: LibEntry
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, entry }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, error: data?.error };
  } catch {
    return { ok: false, error: "Service indisponible." };
  }
}

/** Delete an entry from the library. */
export async function deleteFromLibrary(type: LibType, id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/library?type=${type}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    return res.ok;
  } catch {
    return false;
  }
}

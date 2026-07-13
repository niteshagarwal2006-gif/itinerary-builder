import "server-only";

/**
 * Try to fetch a Wikipedia thumbnail for a given title.
 * Returns the image URL or null if not found.
 */
export async function fetchWikipediaImage(title: string): Promise<string | null> {
  const candidates = [
    title,
    title.replace(/ de /gi, " ").replace(/ d'/gi, " ").replace(/ l'/gi, " ").replace(/\s+/g, " ").trim(),
    title.replace(/ de /gi, ", ").replace(/\s+/g, " ").trim(),
  ].filter((t, i, arr) => arr.indexOf(t) === i)
   .map((t) => t.replace(/\s+/g, "_"));

  for (const slug of candidates) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { thumbnail?: { source?: string } };
      const src = data?.thumbnail?.source;
      if (src) return src;
    } catch {
      // ignore timeout or network errors, try next
    }
  }
  return null;
}

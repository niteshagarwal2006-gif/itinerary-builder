import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface PexelsPhoto {
  id: number;
  src: {
    tiny: string;
    small: string;
    medium: string;
    large: string;
    original: string;
  };
  photographer: string;
  photographer_url: string;
  alt: string;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ photos: [] });
  }

  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Pexels API key is not configured. Add PEXELS_API_KEY to .env.local." },
      { status: 503 }
    );
  }

  try {
    const url =
      `https://api.pexels.com/v1/search?` +
      new URLSearchParams({ query, per_page: "6", orientation: "landscape" }).toString();

    const res = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Pexels API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    const photos = (data.photos || []).map((p) => ({
      id: p.id,
      thumb: p.src.tiny || p.src.small || p.src.medium,
      url: p.src.small || p.src.medium,
      full: p.src.large || p.src.original,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      alt: p.alt,
    }));

    return NextResponse.json({ photos });
  } catch {
    return NextResponse.json({ error: "Could not reach Pexels." }, { status: 502 });
  }
}

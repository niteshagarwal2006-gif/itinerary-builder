import type { ImageRef, Lang } from "./itinerary/types";

/** The reusable content types in the library. */
export type LibType = "hotels" | "sights" | "activities" | "cities";

export interface LibHotel {
  id: string;
  name: string;
  city?: string;
  url?: string;
  category?: string;
  description?: string;
  image?: ImageRef;
  lang: Lang;
  updatedAt: string;
}

export interface LibSight {
  id: string;
  title: string;
  city?: string;
  description?: string;
  image?: ImageRef;
  lang: Lang;
  updatedAt: string;
}

/** An experience/activity — same shape as a sight. */
export type LibActivity = LibSight;

export interface LibCity {
  id: string;
  name: string;
  country?: string;
  intro?: string;
  image?: ImageRef;
  lang: Lang;
  updatedAt: string;
}

export type LibEntry = LibHotel | LibSight | LibCity;

/** The primary display label for any entry type. */
export function entryLabel(type: LibType, e: LibEntry): string {
  if (type === "hotels") return (e as LibHotel).name;
  if (type === "cities") return (e as LibCity).name;
  return (e as LibSight).title; // sights & activities
}

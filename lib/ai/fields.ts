import type { Itinerary } from "../itinerary/types";

/**
 * The free-text fields of an itinerary that get translated / grammar-checked.
 *
 * City names, hotel names, the client name, route cities and flight legs are
 * deliberately EXCLUDED — they are proper nouns that must stay verbatim.
 * Each field has a stable `id` so translations can be reapplied positionally.
 */
export interface TextField {
  id: string;
  /** Human label for the verify panel, e.g. "Day 2 · intro". */
  label: string;
  text: string;
}

/** A grammar/spelling/typography issue found by the verifier. */
export interface VerifyIssue {
  id: string;
  label: string;
  severity: "error" | "warning";
  message: string;
  suggestion: string;
  original: string;
}

const nonEmpty = (s?: string): s is string => Boolean(s && s.trim());

/** Collect every translatable, non-empty text field with a stable id. */
export function collectFields(it: Itinerary): TextField[] {
  const out: TextField[] = [];
  const add = (id: string, label: string, text?: string) => {
    if (nonEmpty(text)) out.push({ id, label, text });
  };

  add("mealPlan", "Meal plan", it.tripSummary.mealPlan);
  add("dates", "Dates", it.tripSummary.dates);
  add("logo.caption", "Logo caption", it.logo?.caption);
  add("routeMap.caption", "Route map caption", it.routeMap?.caption);
  it.highlights.forEach((h, i) => add(`highlight.${i}`, `Highlight ${i + 1}`, h));

  it.days.forEach((d, di) => {
    const p = `Day ${di + 1}`;
    add(`day.${di}.dayLabel`, `${p} · label`, d.dayLabel);
    add(`day.${di}.date`, `${p} · date`, d.date);
    add(`day.${di}.title`, `${p} · title`, d.title);
    add(`day.${di}.legText`, `${p} · distance`, d.leg?.text);
    add(`day.${di}.hotelLabel`, `${p} · hotel label`, d.hotel?.label);
    add(`day.${di}.hotelCategory`, `${p} · hotel category`, d.hotel?.category);
    add(`day.${di}.hotelDescription`, `${p} · hotel description`, d.hotel?.description);
    add(`day.${di}.hotelCaption`, `${p} · hotel caption`, d.hotel?.image?.caption);
    add(`day.${di}.weather`, `${p} · weather`, d.weather);
    add(`day.${di}.intro`, `${p} · intro`, d.intro);
    add(`day.${di}.closing`, `${p} · closing`, d.closing);
    d.sights.forEach((s, si) => {
      add(`day.${di}.sight.${si}.title`, `${p} · sight ${si + 1} title`, s.title);
      add(`day.${di}.sight.${si}.description`, `${p} · sight ${si + 1} text`, s.description);
      add(`day.${di}.sight.${si}.caption`, `${p} · sight ${si + 1} caption`, s.image?.caption);
    });
  });

  return out;
}

/**
 * Return a new itinerary with translated text applied by id. Works on a deep
 * clone, so the original is never mutated. Ids absent from `map` keep their
 * original text.
 */
export function applyFields(it: Itinerary, map: Record<string, string>): Itinerary {
  const clone: Itinerary = structuredClone(it);
  const pick = (id: string, cur?: string) =>
    map[id] !== undefined ? map[id] : cur;

  if (nonEmpty(clone.tripSummary.mealPlan))
    clone.tripSummary.mealPlan = pick("mealPlan", clone.tripSummary.mealPlan);
  if (nonEmpty(clone.tripSummary.dates))
    clone.tripSummary.dates = pick("dates", clone.tripSummary.dates);
  if (clone.logo && nonEmpty(clone.logo.caption))
    clone.logo.caption = pick("logo.caption", clone.logo.caption);
  if (clone.routeMap && nonEmpty(clone.routeMap.caption))
    clone.routeMap.caption = pick("routeMap.caption", clone.routeMap.caption);

  clone.highlights = clone.highlights.map((h, i) => pick(`highlight.${i}`, h) ?? h);

  clone.days.forEach((d, di) => {
    if (nonEmpty(d.dayLabel)) d.dayLabel = pick(`day.${di}.dayLabel`, d.dayLabel) ?? d.dayLabel;
    if (nonEmpty(d.date)) d.date = pick(`day.${di}.date`, d.date);
    if (nonEmpty(d.title)) d.title = pick(`day.${di}.title`, d.title) ?? d.title;
    if (d.leg && nonEmpty(d.leg.text)) d.leg.text = pick(`day.${di}.legText`, d.leg.text) ?? d.leg.text;
    if (d.hotel) {
      if (nonEmpty(d.hotel.label)) d.hotel.label = pick(`day.${di}.hotelLabel`, d.hotel.label);
      if (nonEmpty(d.hotel.category)) d.hotel.category = pick(`day.${di}.hotelCategory`, d.hotel.category);
      if (nonEmpty(d.hotel.description)) d.hotel.description = pick(`day.${di}.hotelDescription`, d.hotel.description);
      if (d.hotel.image && nonEmpty(d.hotel.image.caption))
        d.hotel.image.caption = pick(`day.${di}.hotelCaption`, d.hotel.image.caption);
    }
    if (nonEmpty(d.weather)) d.weather = pick(`day.${di}.weather`, d.weather);
    if (nonEmpty(d.intro)) d.intro = pick(`day.${di}.intro`, d.intro);
    if (nonEmpty(d.closing)) d.closing = pick(`day.${di}.closing`, d.closing);
    d.sights.forEach((s, si) => {
      if (nonEmpty(s.title)) s.title = pick(`day.${di}.sight.${si}.title`, s.title) ?? s.title;
      if (nonEmpty(s.description)) s.description = pick(`day.${di}.sight.${si}.description`, s.description) ?? s.description;
      if (s.image && nonEmpty(s.image.caption))
        s.image.caption = pick(`day.${di}.sight.${si}.caption`, s.image.caption);
    });
  });

  return clone;
}

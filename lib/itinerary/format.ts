/**
 * Shared formatting helpers used by BOTH the .docx generator and the live
 * preview, so the two render paths cannot diverge.
 */

/**
 * The "11 NUITS / 12 JOURS" stay segment. Each side is included only when
 * present (using `!= null` so a legitimate 0 is honored), and a missing value
 * is omitted rather than printed as "?". Returns null when neither is set.
 */
export function staySegment(
  nights: number | undefined,
  days: number | undefined,
  nightsWord: string,
  daysWord: string
): string | null {
  const parts: string[] = [];
  if (nights != null) parts.push(`${nights} ${nightsWord}`);
  if (days != null) parts.push(`${days} ${daysWord}`);
  return parts.length ? parts.join(" / ") : null;
}

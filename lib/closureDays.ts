/**
 * Weekly closure days for major monuments/sights in India.
 *
 * Sources: ASI official site, TripAdvisor, state tourism boards (June 2026).
 * Each pattern is matched against the sight title (case-insensitive).
 * Days are expressed as JS Date.getDay() integers: 0=Sun … 6=Sat.
 */

export interface ClosureInfo {
  closedDays: number[]; // 0-6, JS weekday numbers
  note: string;
}

const DAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

type Pattern = [RegExp, (keyof typeof DAY)[], string];

/** Returns { closedDays, note } for a sight title, or null if no known closure. */
export function getClosureInfo(sightTitle: string): ClosureInfo | null {
  const t = sightTitle.toLowerCase();
  for (const [re, days, note] of PATTERNS) {
    if (re.test(t)) {
      return { closedDays: days.map((d) => DAY[d]), note };
    }
  }
  return null;
}

/** Returns true if the sight is closed on the given weekday (0=Sun). */
export function isClosedOn(sightTitle: string, weekday: number): boolean {
  const info = getClosureInfo(sightTitle);
  return info?.closedDays.includes(weekday) ?? false;
}

export interface DateCheckResult {
  closed: boolean;
  weekday: number;
  dayName: string;
  note?: string;
}

/**
 * Check whether a sight is closed on a specific calendar date.
 * Returns the weekday number, day name, and closure note if closed.
 */
export function checkSightOnDate(sightTitle: string, isoDate: string): DateCheckResult {
  const d = new Date(isoDate + "T00:00:00Z");
  const weekday = d.getUTCDay();
  const info = getClosureInfo(sightTitle);
  const closed = info ? info.closedDays.includes(weekday) : false;
  return {
    closed,
    weekday,
    dayName: WEEKDAY_NAMES[weekday],
    note: closed ? info?.note : undefined,
  };
}

/** Day-of-week name (English) for display. */
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_NAMES_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const WEEKDAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const PATTERNS: Pattern[] = [
  // Agra
  [/taj\s*mahal/i, ["friday"], "Closed for Friday prayers at the mosque"],
  // Delhi
  [/qutub?\s*minar|qutb\s*minar/i, ["monday"], "Closed Mondays (ASI)"],
  [/lotus\s*temple|temp[l]e.*lotus/i, ["monday"], "Closed Mondays for maintenance"],
  // Kochi
  [/synagogue\s*paradesi|paradesi\s*synagogue|jew\s*town.*synagogue|synagogue.*jew/i, ["friday", "saturday"], "Closed Fri & Sat (Jewish Sabbath)"],
  [/mattancherry|palais\s*hollandais|dutch\s*palace/i, ["friday", "saturday"], "Closed Fri & Sat"],
  [/indo.?portuguese\s*museum/i, ["monday"], "Closed Mondays"],
  // Chennai
  [/government\s*museum.*chennai|chennai.*government\s*museum|mus[ée]e?\s*du\s*gouvernement/i, ["friday"], "Closed Fridays and national holidays"],
  [/vivekanandar?\s*(illam|house)|vivekananda\s*house/i, ["monday"], "Closed Mondays"],
  // Munnar
  [/tea\s*museum|kdhp|tata\s*tea\s*museum/i, ["monday"], "Closed Mondays and Good Fridays"],
  // Pondicherry / Pondichéry
  [/mus[ée]e?\s*(de\s*)?pondich[eé]r[yi]|pondich[eé]r[yi]\s*mus[ée]e?/i, ["monday"], "Closed Mondays and national holidays"],
  // Generic ASI state museum pattern (catches many state museums)
  [/state\s*museum/i, ["monday"], "Most state museums closed Mondays"],
];

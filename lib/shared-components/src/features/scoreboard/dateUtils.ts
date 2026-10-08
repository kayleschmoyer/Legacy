/**
 * Date helpers for the live Scoreboard, shared across web and native.
 *
 * Dates are handled as `YYYY-MM-DD` strings in the user's local calendar so the
 * displayed slate always matches "today" wherever the user is — the same
 * representation the `GetScoreboard` query expects for its `date` variable.
 */

/** Today's date as a local `YYYY-MM-DD` string. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Local `Date` for a `YYYY-MM-DD` string. Uses `setFullYear` rather than the
 * `new Date(y, m, d)` constructor, which maps years 0–99 to 1900–1999 and
 * would render "0001-01-01" as January 1, 1901 (LS-10649).
 */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(y, m - 1, d);
  return dt;
}

/** Shift a `YYYY-MM-DD` string by `days` (may be negative), staying local. */
export function offsetDate(iso: string, days: number): string {
  const dt = parseLocalDate(iso);
  dt.setDate(dt.getDate() + days);
  return `${String(dt.getFullYear()).padStart(4, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * How far ahead the date picker may browse (LS-10456). MLB publishes the next
 * season's schedule well under a year out, so a one-year window covers every
 * date the schedule feed can return; dates inside the window that have no
 * published games simply render the empty state.
 */
export const SCOREBOARD_MAX_FUTURE_DAYS = 365;

/**
 * Earliest selectable scoreboard date (LS-10649). MLB game data starts with
 * the 1876 National League season; earlier dates can never return games.
 */
export const SCOREBOARD_MIN_DATE_ISO = '1876-01-01';

/** Latest selectable scoreboard date as a local `YYYY-MM-DD` string. */
export function maxScoreboardDateISO(): string {
  return offsetDate(todayISO(), SCOREBOARD_MAX_FUTURE_DAYS);
}

/** Long, human-readable form of a `YYYY-MM-DD` string (e.g. "Monday, April 1, 2026"). */
export function formatDisplayDate(iso: string): string {
  try {
    return parseLocalDate(iso).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Short clock form of an ISO timestamp (e.g. "7:05 PM"), or null if absent/invalid. */
export function formatLastUpdated(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

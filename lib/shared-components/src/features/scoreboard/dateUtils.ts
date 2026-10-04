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

/** Shift a `YYYY-MM-DD` string by `days` (may be negative), staying local. */
export function offsetDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * How far ahead the date picker may browse (LS-10456). MLB publishes the next
 * season's schedule well under a year out, so a one-year window covers every
 * date the schedule feed can return; dates inside the window that have no
 * published games simply render the empty state.
 */
export const SCOREBOARD_MAX_FUTURE_DAYS = 365;

/** Latest selectable scoreboard date as a local `YYYY-MM-DD` string. */
export function maxScoreboardDateISO(): string {
  return offsetDate(todayISO(), SCOREBOARD_MAX_FUTURE_DAYS);
}

/** Long, human-readable form of a `YYYY-MM-DD` string (e.g. "Monday, April 1, 2026"). */
export function formatDisplayDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
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

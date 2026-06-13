/**
 * Injury-data freshness formatting (LS-6251 / FPD-027).
 *
 * Stale injury data is worse than no injury data: a "Questionable" badge that
 * silently fails to refresh through Sunday morning can mislead a roster
 * decision. This pure helper turns a last-synced timestamp into a relative,
 * human-readable freshness label so the player detail view can warn when the
 * data is old.
 */

export interface InjuryFreshness {
  /** Human-readable label, e.g. "Last updated: 6 min ago" or "Stale (12 hours old)". */
  label: string;
  /** True when the data is older than the staleness threshold (1 hour). */
  isStale: boolean;
}

/**
 * Sync lag beyond this is considered stale. Matches the FPD-027 recommendation
 * ("Alert ops if sync lag > 1 hour during NFL Sundays").
 */
export const INJURY_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Build a freshness descriptor from an ISO-8601 timestamp.
 *
 * @param syncedAtIso ISO-8601 timestamp injury data was last synced, or
 *   null/undefined when never synced.
 * @param now Current time in epoch ms — injectable for deterministic tests;
 *   defaults to `Date.now()`.
 * @returns A {@link InjuryFreshness} descriptor, or `null` when there is no
 *   valid timestamp to render (the caller should render nothing).
 */
export function formatInjuryFreshness(
  syncedAtIso: string | null | undefined,
  now: number = Date.now(),
): InjuryFreshness | null {
  if (!syncedAtIso) return null;

  const syncedMs = Date.parse(syncedAtIso);
  if (Number.isNaN(syncedMs)) return null;

  // Clamp future timestamps (clock skew) to "now" rather than rendering a
  // nonsensical negative age.
  const ageMs = Math.max(0, now - syncedMs);

  if (ageMs < INJURY_STALE_THRESHOLD_MS) {
    const minutes = Math.floor(ageMs / MS_PER_MINUTE);
    const label =
      minutes < 1
        ? 'Last updated: just now'
        : `Last updated: ${minutes} min ago`;
    return { label, isStale: false };
  }

  const hours = Math.floor(ageMs / MS_PER_HOUR);
  if (hours < 24) {
    return {
      label: `Stale (${hours} ${hours === 1 ? 'hour' : 'hours'} old)`,
      isStale: true,
    };
  }

  const days = Math.floor(ageMs / MS_PER_DAY);
  return {
    label: `Stale (${days} ${days === 1 ? 'day' : 'days'} old)`,
    isStale: true,
  };
}

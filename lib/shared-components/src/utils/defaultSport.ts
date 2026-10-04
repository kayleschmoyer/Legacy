/**
 * Default-sport preference parsing (shared across web and mobile).
 *
 * The Preferences screens persist the user's `defaultSport` inside the
 * serialized preferences blob under {@link USER_PREFERENCES_STORAGE_KEY}. This
 * module is intentionally storage-agnostic: it owns the key and the strict
 * validation, while each platform supplies its own backend (web:
 * `localStorage`; mobile: `AsyncStorage`) — the same split as
 * `lastVisitedLeague`. Sharing the parser keeps web and mobile Home ordering
 * identical (LS-10386, sliced from LS-7099).
 */

/** The sports a user can pick as their default. */
export type DefaultSport = 'baseball' | 'football';

/** Storage key the Preferences screens write the serialized preferences object under. */
export const USER_PREFERENCES_STORAGE_KEY = 'ls_user_preferences';

/** Fallback for absent, corrupt, or unrecognized values. */
export const DEFAULT_SPORT_FALLBACK: DefaultSport = 'baseball';

/**
 * Extract a validated `defaultSport` from the raw stored preferences string.
 * Anything missing, unparseable, or not exactly `'football'` resolves to
 * baseball so a corrupt blob can never produce an unsupported sport.
 */
export function parseDefaultSport(
  raw: string | null | undefined,
): DefaultSport {
  if (!raw) return DEFAULT_SPORT_FALLBACK;
  try {
    const parsed = JSON.parse(raw) as { defaultSport?: unknown } | null;
    return parsed?.defaultSport === 'football'
      ? 'football'
      : DEFAULT_SPORT_FALLBACK;
  } catch {
    return DEFAULT_SPORT_FALLBACK;
  }
}

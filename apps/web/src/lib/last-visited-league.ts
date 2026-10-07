/**
 * Web wrapper for last-visited-league persistence (LS-6694 / LGN-039).
 *
 * Persists the league a user most recently opened in `localStorage` so the
 * login flow can redirect a returning user straight to that league instead of
 * the generic `/` landing route. The canonical shape, key, route builder, and
 * validation rules live in `@legacy-sports/shared-components/utils` and are
 * shared with the mobile wrapper.
 *
 * Entries carry the id of the user who opened the league, and the login
 * redirect only honours an entry owned by the user signing in, so a shared
 * browser never sends the next account to the previous one's league
 * (LS-10787). An explicit Sign Out also removes the entry outright — see
 * `user-scoped-storage.ts`.
 */
import { LOGGER } from '@legacy-sports/logging';
import {
  LAST_VISITED_LEAGUE_KEY,
  type LastVisitedLeague,
  makeLastVisitedLeague,
  parseLastVisitedLeague,
  serializeLastVisitedLeague,
} from '@legacy-sports/shared-components/utils';

/** Read the persisted last-visited league, or `null` if none/unavailable/malformed. */
export function getLastVisitedLeague(): LastVisitedLeague | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return parseLastVisitedLeague(
      localStorage.getItem(LAST_VISITED_LEAGUE_KEY),
    );
  } catch {
    // localStorage can throw in privacy mode / when disabled — treat as absent.
    return null;
  }
}

/**
 * Read the persisted last-visited league only when it was written by
 * `userId`. Returns `null` for a different user, an entry without an owner
 * (written before LS-10787), or when `userId` is unknown.
 */
export function getLastVisitedLeagueForUser(
  userId: number | null | undefined,
): LastVisitedLeague | null {
  if (userId == null) return null;
  const league = getLastVisitedLeague();
  return league?.userId === userId ? league : null;
}

/**
 * Persist the league the user just opened, tagged with the user's id. No-ops on an invalid id and swallows
 * storage failures (privacy mode, quota) — persistence is best-effort and must
 * never disrupt rendering the league page.
 */
export function setLastVisitedLeague(
  leagueId: number,
  sport: string | null | undefined,
  userId?: number | null,
): void {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      LAST_VISITED_LEAGUE_KEY,
      serializeLastVisitedLeague(
        makeLastVisitedLeague(leagueId, sport, userId),
      ),
    );
  } catch (error) {
    LOGGER.warn(
      'Failed to persist last visited league:',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

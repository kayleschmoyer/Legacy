/**
 * Web wrapper for last-visited-league persistence (LS-6694 / LGN-039).
 *
 * Persists the league a user most recently opened in `localStorage` so the
 * login flow can redirect a returning user straight to that league instead of
 * the generic `/` landing route. The canonical shape, key, route builder, and
 * validation rules live in `@legacy-sports/shared-components/utils` and are
 * shared with the mobile wrapper.
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
 * Persist the league the user just opened. No-ops on an invalid id and swallows
 * storage failures (privacy mode, quota) — persistence is best-effort and must
 * never disrupt rendering the league page.
 */
export function setLastVisitedLeague(
  leagueId: number,
  sport: string | null | undefined,
): void {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      LAST_VISITED_LEAGUE_KEY,
      serializeLastVisitedLeague(makeLastVisitedLeague(leagueId, sport)),
    );
  } catch (error) {
    LOGGER.warn(
      'Failed to persist last visited league:',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

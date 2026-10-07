/**
 * Last-visited-league persistence helpers (shared across web and mobile).
 *
 * Stores the league a user most recently opened so that, on the next login, a
 * returning user can be sent straight back to their league hub instead of the
 * generic `/` landing route (LS-6694 / LGN-039).
 *
 * This module is intentionally storage-agnostic: it only owns the canonical
 * storage key, the persisted shape, route building, and (de)serialization with
 * strict validation. Each platform wraps these with its own storage backend
 * (web: `localStorage`; mobile: `AsyncStorage`) so the same parse/serialize
 * rules are shared and the redirect behaviour stays consistent.
 */
import type { Sport } from './colors';

/** Persisted shape of the user's most recently opened league. */
export interface LastVisitedLeague {
  leagueId: number;
  sport: Sport;
  /**
   * Id of the user who opened the league. Lets the post-login redirect ignore
   * an entry left behind by a different account on a shared browser
   * (LS-10787). Optional so entries written without it still parse.
   */
  userId?: number;
}

/** Storage key used by both the web (`localStorage`) and mobile (`AsyncStorage`) wrappers. */
export const LAST_VISITED_LEAGUE_KEY = 'ls_last_visited_league';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Narrow an arbitrary sport value to the canonical union (defaults to baseball). */
function normalizeSport(sport: unknown): Sport {
  return sport === 'football' ? 'football' : 'baseball';
}

/**
 * Build the in-app route for a league detail page: `/{sport}/league/{id}`.
 * Mirrors the route patterns registered in `apps/web` (`/baseball/league/:id`,
 * `/football/league/:id`).
 */
export function lastVisitedLeaguePath(league: LastVisitedLeague): string {
  const sportPrefix = league.sport === 'football' ? 'football' : 'baseball';
  return `/${sportPrefix}/league/${league.leagueId}`;
}

/**
 * Build a `LastVisitedLeague` from a (possibly loosely-typed) sport string —
 * convenient for callers that hold `league.sport: string | null | undefined`.
 */
export function makeLastVisitedLeague(
  leagueId: number,
  sport: string | null | undefined,
  userId?: number | null,
): LastVisitedLeague {
  const league: LastVisitedLeague = { leagueId, sport: normalizeSport(sport) };
  if (isPositiveInteger(userId)) league.userId = userId;
  return league;
}

/** Serialize a last-visited league for storage. */
export function serializeLastVisitedLeague(league: LastVisitedLeague): string {
  return JSON.stringify({
    leagueId: league.leagueId,
    sport: normalizeSport(league.sport),
    ...(isPositiveInteger(league.userId) ? { userId: league.userId } : {}),
  });
}

/**
 * Parse a stored last-visited league. Returns `null` for any malformed input
 * (missing/empty value, invalid JSON, wrong shape, non-positive id, or an
 * unrecognized sport) so callers can safely fall back to the default route.
 * A missing or invalid `userId` is dropped rather than rejecting the entry.
 */
export function parseLastVisitedLeague(
  raw: string | null | undefined,
): LastVisitedLeague | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { leagueId, sport, userId } = parsed as {
      leagueId?: unknown;
      sport?: unknown;
      userId?: unknown;
    };
    if (!isPositiveInteger(leagueId)) return null;
    if (sport !== 'baseball' && sport !== 'football') return null;
    return isPositiveInteger(userId)
      ? { leagueId, sport, userId }
      : { leagueId, sport };
  } catch {
    return null;
  }
}

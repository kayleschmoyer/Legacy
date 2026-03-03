/**
 * Entity DataLoaders — teams, players, users, and eligible positions
 */

import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

// ---------------------------------------------------------------------------
// Module-level eligible-positions cache (LS-434)
//
// player_eligible_positions is a materialized view that only refreshes when a
// bulk stats-load run completes (nightly at most).  Caching results in the
// Lambda process between requests eliminates redundant round-trips to the DB.
//
// TTL: 30 minutes — short enough that a fresh refresh is visible within one
// scoring cycle, long enough to absorb the bulk of repeated requests during
// an active draft or scoring pass.
// ---------------------------------------------------------------------------

/** Cache entry: sorted position strings + expiry timestamp */
interface CacheEntry {
  positions: string[];
  expiresAt: number;
}

const ELIGIBLE_POSITIONS_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 minutes

/**
 * Module-level map shared across all requests within a warm Lambda instance.
 * Keyed by player ID, value is the sorted list of eligible position codes.
 */
const eligiblePositionsCache = new Map<number, CacheEntry>();

/**
 * Clear the module-level eligible-positions cache.
 *
 * Call this after `REFRESH MATERIALIZED VIEW player_eligible_positions`
 * completes so the next DataLoader batch fetches fresh data.
 * (Safe to call even if the cache is already empty.)
 */
export function clearEligiblePositionsCache(): void {
  eligiblePositionsCache.clear();
}

/**
 * DataLoader for teams
 * Key: teamId (number)
 */
export const createTeamsLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, typeof PublicSchema.teams.$inferSelect | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const allTeams = await db
        .select()
        .from(PublicSchema.teams)
        .where(inArray(PublicSchema.teams.id, ids));

      const teamsMap = new Map<
        number,
        typeof PublicSchema.teams.$inferSelect
      >();
      for (const team of allTeams) teamsMap.set(team.id, team);
      return keys.map((key) => teamsMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for players
 * Key: playerId (number)
 */
export const createPlayersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, typeof PublicSchema.players.$inferSelect | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const allPlayers = await db
        .select()
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.id, ids));

      const playersMap = new Map<
        number,
        typeof PublicSchema.players.$inferSelect
      >();
      for (const player of allPlayers) playersMap.set(player.id, player);
      return keys.map((key) => playersMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for users
 * Key: userId (number)
 */
export const createUsersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<
    number,
    {
      id: number;
      email: string | null;
      username: string | null;
      accessLevel: string | null;
    } | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const allUsers = await db
      .select({
        id: PublicSchema.users.id,
        email: PublicSchema.users.email,
        username: PublicSchema.users.username,
        accessLevel: PublicSchema.users.accessLevel,
      })
      .from(PublicSchema.users)
      .where(inArray(PublicSchema.users.id, ids));

    const usersMap = new Map<
      number,
      {
        id: number;
        email: string | null;
        username: string | null;
        accessLevel: string | null;
      }
    >();
    for (const user of allUsers) {
      if (user.id !== null) {
        usersMap.set(user.id, {
          id: user.id,
          email: user.email,
          username: user.username,
          accessLevel: user.accessLevel,
        });
      }
    }
    return keys.map((key) => usersMap.get(key) ?? null);
  });

/**
 * DataLoader for league positions by ID
 * Key: positionId (number)
 * Returns: league position record with positionType
 */
export const createLeaguePositionByIdLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.leaguePosition.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const allPositions = await db
      .select()
      .from(PublicSchema.leaguePosition)
      .where(inArray(PublicSchema.leaguePosition.id, ids));

    const posMap = new Map<
      number,
      typeof PublicSchema.leaguePosition.$inferSelect
    >();
    for (const pos of allPositions) posMap.set(pos.id, pos);
    return keys.map((key) => posMap.get(key) ?? null);
  });

/**
 * DataLoader for player eligible positions
 * Key: playerId (number)
 * Returns: string[] of position codes, sorted by games played (most to least)
 *
 * Uses a module-level cache (see above) to skip DB round-trips for player IDs
 * whose eligible positions are already known and not yet expired.
 */
export const createEligiblePositionsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, string[]>(async (keys) => {
    const now = Date.now();

    // Partition keys into cache-hits and DB-misses
    const missing: number[] = [];
    const hitMap = new Map<number, string[]>();

    for (const key of keys) {
      const entry = eligiblePositionsCache.get(key);
      if (entry !== undefined && entry.expiresAt > now) {
        hitMap.set(key, entry.positions);
      } else {
        missing.push(key);
      }
    }

    // Fetch only the uncached player IDs
    if (missing.length > 0) {
      const ids = [...new Set(missing)];
      const rows = await db
        .select({
          playerId: PublicSchema.playerEligiblePositions.playerId,
          position: PublicSchema.playerEligiblePositions.position,
          games: PublicSchema.playerEligiblePositions.games,
        })
        .from(PublicSchema.playerEligiblePositions)
        .where(inArray(PublicSchema.playerEligiblePositions.playerId, ids));

      const posMap = new Map<
        number,
        Array<{ position: string; games: number }>
      >();
      for (const row of rows) {
        let arr = posMap.get(row.playerId);
        if (!arr) {
          arr = [];
          posMap.set(row.playerId, arr);
        }
        arr.push({ position: row.position, games: row.games });
      }

      const expiresAt = now + ELIGIBLE_POSITIONS_CACHE_TTL_MS;
      for (const id of ids) {
        const raw = posMap.get(id) ?? [];
        const sorted = raw
          .sort((a, b) => b.games - a.games)
          .map((p) => p.position);
        eligiblePositionsCache.set(id, { positions: sorted, expiresAt });
        hitMap.set(id, sorted);
      }
    }

    // Return results in the same order as the input keys
    return keys.map((key) => hitMap.get(key) ?? []);
  });

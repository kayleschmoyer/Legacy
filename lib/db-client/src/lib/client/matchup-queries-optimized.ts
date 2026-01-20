/**
 * Optimized query functions for matchup operations
 * These functions leverage database indexes and efficient query patterns
 * to improve performance at scale.
 *
 * Issue: LS-34
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { GenericDatabase } from './abstract/BaseDbClient';
import { Matchup, MatchupPlayer } from '../../types/DatabaseTypes';
import * as PublicSchema from '../../drizzle/public/schema';

export type PublicDb = GenericDatabase<typeof PublicSchema>;

/**
 * Get matchup with related data in a single query
 * Uses JOIN to avoid N+1 queries
 */
export async function getMatchupWithPlayers(
  db: PublicDb,
  matchupId: number,
): Promise<{
  matchup: Matchup | null;
  players: MatchupPlayer[];
}> {
  LOGGER.debug(`Loading matchup ${matchupId} with players`);

  // Execute queries in parallel for better performance
  const [matchupResult, players] = await Promise.all([
    db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupId))
      .limit(1),
    db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId)),
  ]);

  return {
    matchup: matchupResult[0] || null,
    players,
  };
}

/**
 * Get all matchups for a league with player counts
 * Uses aggregation to avoid loading all player records
 */
export async function getLeagueMatchupsWithStats(
  db: PublicDb,
  leagueId: number,
): Promise<
  Array<{
    id: number;
    weekNumber: number;
    leagueId: number;
    playerCount: number;
  }>
> {
  LOGGER.debug(`Loading matchups with stats for league ${leagueId}`);

  const result = await db
    .select({
      id: PublicSchema.matchups.id,
      weekNumber: PublicSchema.matchups.weekNumber,
      leagueId: PublicSchema.matchups.leagueId,
      playerCount: sql<number>`COUNT(${PublicSchema.matchupPlayers.id})`,
    })
    .from(PublicSchema.matchups)
    .leftJoin(
      PublicSchema.matchupPlayers,
      eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
    )
    .where(eq(PublicSchema.matchups.leagueId, leagueId))
    .groupBy(
      PublicSchema.matchups.id,
      PublicSchema.matchups.weekNumber,
      PublicSchema.matchups.leagueId,
    );

  return result;
}

/**
 * Batch get matchups by IDs
 * More efficient than multiple individual queries
 */
export async function getMatchupsByIds(
  db: PublicDb,
  matchupIds: number[],
): Promise<Matchup[]> {
  if (matchupIds.length === 0) {
    return [];
  }

  LOGGER.debug(`Batch loading ${matchupIds.length} matchups`);

  return db
    .select()
    .from(PublicSchema.matchups)
    .where(inArray(PublicSchema.matchups.id, matchupIds));
}

/**
 * Get matchup players with full player details
 * Uses JOIN to avoid N+1 queries
 */
export async function getMatchupPlayersWithDetails(
  db: PublicDb,
  matchupId: number,
): Promise<
  Array<{
    matchupPlayer: MatchupPlayer;
    playerFirstName: string;
    playerLastName: string;
    playerBrefId: string;
  }>
> {
  LOGGER.debug(`Loading matchup ${matchupId} players with details`);

  const result = await db
    .select({
      matchupPlayer: PublicSchema.matchupPlayers,
      playerFirstName: PublicSchema.players.firstName,
      playerLastName: PublicSchema.players.lastName,
      playerBrefId: PublicSchema.players.brefId,
    })
    .from(PublicSchema.matchupPlayers)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  return result;
}

/**
 * Get matchup summary statistics
 * Efficient aggregation without loading all records
 */
export async function getMatchupSummary(
  db: PublicDb,
  matchupId: number,
): Promise<{
  matchupId: number;
  totalPlayers: number;
  totalGames: number;
}> {
  LOGGER.debug(`Loading summary for matchup ${matchupId}`);

  const [result] = await db
    .select({
      matchupId: PublicSchema.matchups.id,
      totalPlayers: sql<number>`COUNT(DISTINCT ${PublicSchema.matchupPlayers.id})`,
      totalGames: sql<number>`COUNT(${PublicSchema.matchupPlayerGames.id})`,
    })
    .from(PublicSchema.matchups)
    .leftJoin(
      PublicSchema.matchupPlayers,
      eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
    )
    .leftJoin(
      PublicSchema.matchupPlayerGames,
      eq(
        PublicSchema.matchupPlayers.id,
        PublicSchema.matchupPlayerGames.matchupPlayerId,
      ),
    )
    .where(eq(PublicSchema.matchups.id, matchupId))
    .groupBy(PublicSchema.matchups.id);

  return (
    result || {
      matchupId,
      totalPlayers: 0,
      totalGames: 0,
    }
  );
}

/**
 * Paginated matchup query for large datasets
 * Supports efficient pagination with cursor-based approach
 */
export async function getMatchupsPaginated(
  db: PublicDb,
  leagueId: number,
  options: {
    limit?: number;
    offset?: number;
    orderBy?: 'weekNumber' | 'id';
    orderDirection?: 'asc' | 'desc';
  } = {},
): Promise<Matchup[]> {
  const {
    limit = 20,
    offset = 0,
    orderBy = 'weekNumber',
    orderDirection = 'asc',
  } = options;

  LOGGER.debug(
    `Loading paginated matchups for league ${leagueId}: limit=${limit}, offset=${offset}`,
  );

  const query = db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.leagueId, leagueId))
    .limit(limit)
    .offset(offset);

  // Apply ordering
  const orderColumn =
    orderBy === 'weekNumber'
      ? PublicSchema.matchups.weekNumber
      : PublicSchema.matchups.id;

  if (orderDirection === 'asc') {
    query.orderBy(orderColumn);
  } else {
    query.orderBy(sql`${orderColumn} DESC`);
  }

  return query;
}

/**
 * Batch insert matchup players
 * More efficient than individual inserts
 */
export async function batchInsertMatchupPlayers(
  db: PublicDb,
  matchupPlayers: Array<{
    matchupId: number;
    playerId: number;
    teamId: number;
  }>,
): Promise<MatchupPlayer[]> {
  if (matchupPlayers.length === 0) {
    return [];
  }

  LOGGER.debug(`Batch inserting ${matchupPlayers.length} matchup players`);

  return db
    .insert(PublicSchema.matchupPlayers)
    .values(matchupPlayers)
    .returning();
}

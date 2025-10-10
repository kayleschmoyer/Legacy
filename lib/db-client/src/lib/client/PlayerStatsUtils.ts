import { and, eq, isNull, or, lt, gte, isNotNull, count } from 'drizzle-orm';
import { PublicDb } from './PublicDbClient';
import * as Schema from '../../drizzle/public/schema';
import { Player } from '../../types/DatabaseTypes';

/**
 * Utility functions for querying players based on their stats fetch timestamps
 */

/**
 * Get players that have never had their stats fetched (statsLastFetchedAt is null)
 */
export async function getPlayersWithoutStats(
  db: PublicDb,
  limit?: number,
): Promise<Player[]> {
  if (limit) {
    return await db
      .select()
      .from(Schema.players)
      .where(isNull(Schema.players.statsLastFetchedAt))
      .limit(limit);
  }

  return await db
    .select()
    .from(Schema.players)
    .where(isNull(Schema.players.statsLastFetchedAt));
}

/**
 * Get players whose stats were last fetched before a specific date
 */
export async function getPlayersWithStaleStats(
  db: PublicDb,
  beforeDate: Date,
  limit?: number,
): Promise<Player[]> {
  if (limit) {
    return await db
      .select()
      .from(Schema.players)
      .where(
        or(
          isNull(Schema.players.statsLastFetchedAt),
          lt(Schema.players.statsLastFetchedAt, beforeDate),
        ),
      )
      .limit(limit);
  }

  return await db
    .select()
    .from(Schema.players)
    .where(
      or(
        isNull(Schema.players.statsLastFetchedAt),
        lt(Schema.players.statsLastFetchedAt, beforeDate),
      ),
    );
}

/**
 * Get players who need stats refresh (either never fetched or older than specified hours)
 */
export async function getPlayersNeedingStatsRefresh(
  db: PublicDb,
  maxAgeHours: number = 24,
  limit?: number,
): Promise<Player[]> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

  return await getPlayersWithStaleStats(db, cutoffDate, limit);
}

/**
 * Get count of players by stats freshness categories
 */
export async function getStatsRefreshSummary(db: PublicDb): Promise<{
  totalPlayers: number;
  neverFetched: number;
  staleStats: number;
  recentStats: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago

  const [
    totalCount,
    neverFetchedCount,
    staleCount,
    recentCount,
  ] = await Promise.all([
    db.select({ count: count() }).from(Schema.players),
    db
      .select({ count: count() })
      .from(Schema.players)
      .where(isNull(Schema.players.statsLastFetchedAt)),
    db
      .select({ count: count() })
      .from(Schema.players)
      .where(
        and(
          isNotNull(Schema.players.statsLastFetchedAt),
          lt(Schema.players.statsLastFetchedAt, cutoffDate),
        ),
      ),
    db
      .select({ count: count() })
      .from(Schema.players)
      .where(
        and(
          isNotNull(Schema.players.statsLastFetchedAt),
          gte(Schema.players.statsLastFetchedAt, cutoffDate),
        ),
      ),
  ]);

  return {
    totalPlayers: totalCount[0]?.count || 0,
    neverFetched: neverFetchedCount[0]?.count || 0,
    staleStats: staleCount[0]?.count || 0,
    recentStats: recentCount[0]?.count || 0,
  };
}

/**
 * Get players sorted by when their stats were last fetched (oldest first)
 * Useful for implementing a "least recently updated" refresh strategy
 */
export async function getPlayersOrderedByLastFetch(
  db: PublicDb,
  limit?: number,
): Promise<Player[]> {
  if (limit) {
    return await db
      .select()
      .from(Schema.players)
      .orderBy(Schema.players.statsLastFetchedAt)
      .limit(limit);
  }

  return await db
    .select()
    .from(Schema.players)
    .orderBy(Schema.players.statsLastFetchedAt);
}

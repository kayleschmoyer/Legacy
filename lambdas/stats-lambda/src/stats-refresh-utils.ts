import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  getDbConnection,
  getPlayersNeedingStatsRefresh,
  getPlayersWithoutStats,
  getPlayersWithStaleStats,
  getStatsRefreshSummary,
  PublicSchema,
} from '@legacy-sports/db-client';

/**
 * Utility functions for stats refresh management
 * These can be used by CLI tools or other parts of the system to intelligently
 * determine which players need their stats refreshed
 */

export async function getPlayersForRefresh(
  maxAgeHours = 24,
  limit?: number,
): Promise<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  statsLastFetchedAt: Date | null;
}[]> {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);
  await connection.initialize();

  try {
    const players = await getPlayersNeedingStatsRefresh(
      connection.db,
      maxAgeHours,
      limit,
    );
    
    LOGGER.info(`Found ${players.length} players needing stats refresh`);
    return players;
  } finally {
    await connection.close();
  }
}

export async function getRefreshSummary(): Promise<{
  totalPlayers: number;
  neverFetched: number;
  staleStats: number;
  recentStats: number;
}> {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);
  await connection.initialize();

  try {
    const summary = await getStatsRefreshSummary(connection.db);
    
    LOGGER.info('Stats refresh summary:', summary);
    return summary;
  } finally {
    await connection.close();
  }
}

export async function getPlayersWithoutAnyStats(
  limit?: number,
): Promise<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  statsLastFetchedAt: Date | null;
}[]> {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);
  await connection.initialize();

  try {
    const players = await getPlayersWithoutStats(connection.db, limit);
    
    LOGGER.info(`Found ${players.length} players without any stats`);
    return players;
  } finally {
    await connection.close();
  }
}

export async function getPlayersWithOldStats(
  beforeDate: Date,
  limit?: number,
): Promise<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  statsLastFetchedAt: Date | null;
}[]> {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);
  await connection.initialize();

  try {
    const players = await getPlayersWithStaleStats(
      connection.db,
      beforeDate,
      limit,
    );
    
    LOGGER.info(
      `Found ${players.length} players with stats older than ${beforeDate.toISOString()}`,
    );
    return players;
  } finally {
    await connection.close();
  }
}

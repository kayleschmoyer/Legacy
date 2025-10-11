import { CareerStats, getCareerStats } from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  bulkUpsertBattingSeason,
  bulkUpsertFieldingSeason,
  bulkUpsertPitchingSeason,
  getPlayerByBrefId,
  PublicDb,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '@legacy-sports/db-client';
import { addBreadcrumb, captureError } from '@legacy-sports/sentry';
import { sql } from 'drizzle-orm';

/**
 * Deduplicate season batting records by their composite primary key:
 * playerId + season + team + rowId
 */
function deduplicateSeasonBatting(records: SeasonBatting[]): SeasonBatting[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.playerId}-${record.season}-${record.team}-${record.rowId}`;
    if (seen.has(key)) {
      LOGGER.debug(`Skipping duplicate batting record: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Deduplicate season fielding records by their composite primary key:
 * playerId + season + team + pos + rowId
 */
function deduplicateSeasonFielding(
  records: SeasonFielding[],
): SeasonFielding[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.playerId}-${record.season}-${record.team}-${record.pos}-${record.rowId}`;
    if (seen.has(key)) {
      LOGGER.debug(`Skipping duplicate fielding record: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Deduplicate season pitching records by their composite primary key:
 * playerId + season + team + rowId
 */
function deduplicateSeasonPitching(
  records: SeasonPitching[],
): SeasonPitching[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.playerId}-${record.season}-${record.team}-${record.rowId}`;
    if (seen.has(key)) {
      LOGGER.debug(`Skipping duplicate pitching record: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function loadCareerStats(
  db: PublicDb,
  brefId: string,
): Promise<CareerStats> {
  const player = await getPlayerByBrefId(db, brefId);

  if (!player) {
    const error = new Error(`Player not found: ${brefId}`);
    captureError(error, {
      tags: { operation: 'load_career_stats', phase: 'player_lookup' },
      extra: { brefId },
    });
    throw error;
  }

  const playerName = `${player.firstName} ${player.lastName}`;
  addBreadcrumb(
    `Loading stats for player ${playerName} (ID: ${player.id}, brefId: ${brefId})`,
  );
  LOGGER.debug(`Importing ${brefId}`);

  let stats: CareerStats;
  try {
    stats = await getCareerStats(player);
    addBreadcrumb(
      `Retrieved ${stats.batting.length} batting, ${stats.fielding.length} fielding, ${stats.pitching.length} records`,
    );
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { operation: 'load_career_stats', phase: 'bref_fetch' },
      extra: {
        brefId,
        playerId: player.id,
        playerName: playerName,
      },
    });
    throw error;
  }

  // Process batting stats with error handling
  try {
    const uniqueBattingStats = deduplicateSeasonBatting(stats.batting);
    if (stats.batting.length !== uniqueBattingStats.length) {
      LOGGER.warn(
        `Removed ${stats.batting.length - uniqueBattingStats.length} duplicate batting records for player ${player.id}`,
      );
    }

    LOGGER.debug(`Inserting ${uniqueBattingStats.length} batting records.`);
    addBreadcrumb(
      `Upserting ${uniqueBattingStats.length} batting records (deduplicated from ${stats.batting.length})`,
    );

    await bulkUpsertBattingSeason(db, uniqueBattingStats);
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { operation: 'load_career_stats', phase: 'batting_upsert' },
      extra: {
        brefId,
        playerId: player.id,
        playerName: playerName,
        battingRecordCount: stats.batting.length,
        deduplicatedCount: deduplicateSeasonBatting(stats.batting).length,
      },
    });
    throw error;
  }
  // Process fielding stats with error handling
  try {
    const validFieldingStats = stats.fielding.filter((record) => {
      // Filter out records with null/empty positions (military service, etc.)
      if (
        !record.pos ||
        record.pos.trim() === '' ||
        record.pos === null ||
        record.pos === undefined
      ) {
        LOGGER.debug(
          `Skipping fielding record for player ${player.id}, season ${record.season} - no position (likely military service or non-playing season)`,
        );
        return false;
      }

      // Filter out records with excessively long data that would cause varchar violations
      if (record.pos.length > 20) {
        LOGGER.warn(
          `Skipping fielding record for player ${player.id}, season ${record.season} - position too long: ${record.pos}`,
        );
        return false;
      }

      if (record.team && record.team.length > 50) {
        LOGGER.warn(
          `Skipping fielding record for player ${player.id}, season ${record.season} - team name too long: ${record.team}`,
        );
        return false;
      }

      if (record.rowId && record.rowId.length > 50) {
        LOGGER.warn(
          `Skipping fielding record for player ${player.id}, season ${record.season} - row_id too long: ${record.rowId}`,
        );
        return false;
      }

      // Ensure all required fields are present and not empty
      if (!record.team || record.team.trim() === '') {
        LOGGER.debug(
          `Skipping fielding record for player ${player.id}, season ${record.season} - no team specified`,
        );
        return false;
      }

      if (!record.rowId || record.rowId.trim() === '') {
        LOGGER.debug(
          `Skipping fielding record for player ${player.id}, season ${record.season} - no row_id specified`,
        );
        return false;
      }

      return true;
    });

    const deduplicatedFieldingStats =
      deduplicateSeasonFielding(validFieldingStats);
    LOGGER.debug(
      `Inserting ${deduplicatedFieldingStats.length} fielding records (filtered from ${stats.fielding.length}).`,
    );
    addBreadcrumb(
      `Upserting ${deduplicatedFieldingStats.length} fielding records (filtered from ${stats.fielding.length})`,
    );

    await bulkUpsertFieldingSeason(db, deduplicatedFieldingStats);
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { operation: 'load_career_stats', phase: 'fielding_upsert' },
      extra: {
        brefId,
        playerId: player.id,
        playerName: playerName,
        fieldingRecordCount: stats.fielding.length,
      },
    });
    throw error;
  }

  // Process pitching stats with error handling
  try {
    const deduplicatedPitchingStats = deduplicateSeasonPitching(stats.pitching);
    LOGGER.debug(
      `Inserting ${deduplicatedPitchingStats.length} pitching records.`,
    );
    addBreadcrumb(
      `Upserting ${deduplicatedPitchingStats.length} pitching records (deduplicated from ${stats.pitching.length})`,
    );

    await bulkUpsertPitchingSeason(db, deduplicatedPitchingStats);
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { operation: 'load_career_stats', phase: 'pitching_upsert' },
      extra: {
        brefId,
        playerId: player.id,
        playerName: playerName,
        pitchingRecordCount: stats.pitching.length,
        deduplicatedCount: deduplicateSeasonPitching(stats.pitching).length,
      },
    });
    throw error;
  }

  // Update player timestamp with error handling
  try {
    LOGGER.debug(
      `Updating stats_last_fetched_at timestamp for player ${player.id}`,
    );
    await db.execute(sql`
      UPDATE players 
      SET stats_last_fetched_at = NOW() 
      WHERE id = ${player.id}
    `);
    addBreadcrumb(`Updated stats_last_fetched_at for player ${playerName}`);
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { operation: 'load_career_stats', phase: 'timestamp_update' },
      extra: {
        brefId,
        playerId: player.id,
        playerName: playerName,
      },
    });
    throw error;
  }

  return stats;
}

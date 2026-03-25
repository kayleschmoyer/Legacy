/**
 * Calculate Matchup Scores Lambda Handler
 *
 * Orchestrates real-time matchup score calculation.
 * Triggered when:
 * - Games are selected for a matchup
 * - Lineup changes occur
 * - Matchup status updates are needed
 *
 * Integrates with MatchupService and scoring libraries to:
 * 1. Fetch player game stats from database
 * 2. Calculate team scores using scoring settings
 * 3. Update matchup table with calculated scores
 * 4. Return updated matchup data
 */

import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import type { ScoringSettings } from '@legacy-sports/scoring';
import { LOGGER } from '@legacy-sports/logging';
import {
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar';
import {
  calculateAndUpdateMatchupScores,
  type CalculateMatchupScoresResponse,
} from '../scoring-utils';

// Re-export for backward compatibility
export { calculateAndUpdateMatchupScores } from '../scoring-utils';
export type { CalculateMatchupScoresResponse } from '../scoring-utils';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

export interface CalculateMatchupScoresEvent {
  matchupId: number;
  /**
   * Optional: Custom scoring settings (league-specific)
   * If not provided, uses default scoring settings
   */
  scoringSettings?: ScoringSettings;
  /**
   * Whether to force recalculation even if scores exist
   */
  forceRecalculation?: boolean;
}

/**
 * Main Lambda handler for calculating matchup scores
 */
export async function handler(
  event: CalculateMatchupScoresEvent,
): Promise<CalculateMatchupScoresResponse> {
  const { matchupId, scoringSettings, forceRecalculation = false } = event;

  try {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      return await calculateAndUpdateMatchupScores(
        db,
        matchupId,
        scoringSettings,
        forceRecalculation,
      );
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.error(`Error calculating matchup scores for matchup ${matchupId}`, {
      error: err.message,
      stack: err.stack,
      matchupId,
    });
    captureError(err, { matchupId });
    throw err;
  }
}

/**
 * Batch calculate scores for multiple matchups
 * Useful for weekly score updates
 */
export async function batchCalculateMatchupScores(
  matchupIds: number[],
  scoringSettings?: ScoringSettings,
): Promise<CalculateMatchupScoresResponse[]> {
  const results: CalculateMatchupScoresResponse[] = [];

  for (const matchupId of matchupIds) {
    try {
      const result = await handler({
        matchupId,
        scoringSettings,
        forceRecalculation: true,
      });
      results.push(result);
    } catch (error) {
      LOGGER.error(
        `Error calculating scores for matchup ${matchupId}: ${String(error)}`,
      );
      results.push({
        matchupId,
        team1Score: null,
        team2Score: null,
        team1GamesSelected: 0,
        team2GamesSelected: 0,
        gamesPerMatchup: 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

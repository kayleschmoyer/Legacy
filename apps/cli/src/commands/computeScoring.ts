import { LOGGER } from '@legacy-sports/logging';
import {
  getCareerBattingStatsForPlayer,
  getCareerFieldingStatsForPlayer,
  getCareerPitchingStatsForPlayer,
  getPlayerByBrefId,
  getScoringMultipliersForLeague,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import {
  computeScoring,
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import { getDbOptions } from '@legacy-sports/utils';

interface HandleComputeScoringArgs {
  player: string;
  league?: number;
}

export async function handleComputeScoring(
  args: HandleComputeScoringArgs,
): Promise<void> {
  LOGGER.debug(`Computing scoring for player ${args.player}`);

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    const player = await getPlayerByBrefId(db, args.player);

    if (player === null) {
      throw new Error(`Could not find player ${args.player}`);
    }

    LOGGER.info(`Computing player ${player.id}`);

    const multipliers = await getScoringMultipliersForLeague(
      db,
      typeof args.league === 'number' ? args.league : null,
    );

    const battingStats = await getCareerBattingStatsForPlayer(db, player.id);
    const fieldingStats = await getCareerFieldingStatsForPlayer(db, player.id);
    const pitchingStats = await getCareerPitchingStatsForPlayer(db, player.id);

    const battingSettings =
      Object.keys(multipliers.batting).length > 0
        ? multipliers.batting
        : DEFAULT_BATTING_SCORING;
    const fieldingSettings =
      Object.keys(multipliers.fielding).length > 0
        ? multipliers.fielding
        : DEFAULT_FIELDING_SCORING;
    const pitchingSettings =
      Object.keys(multipliers.pitching).length > 0
        ? multipliers.pitching
        : DEFAULT_PITCHING_SCORING;

    const battingScore = computeScoring(battingStats, battingSettings);

    // Exclude positionsPlayed field from fielding stats as it's not used in scoring
    const fieldingStatsForScoring = fieldingStats
      ? (({ positionsPlayed: _ignored, ...rest }) => rest)(fieldingStats)
      : fieldingStats;

    const fieldingScore = computeScoring(
      fieldingStatsForScoring,
      fieldingSettings,
    );
    const pitchingScore = computeScoring(pitchingStats, pitchingSettings);

    const battingScorePerGame =
      battingStats === null ? 0 : battingScore / (battingStats.g || 1);
    const fieldingScorePerGame =
      fieldingStats === null ? 0 : fieldingScore / (fieldingStats.g || 1);
    const pitchingScorePerGame =
      pitchingStats === null ? 0 : pitchingScore / (pitchingStats.g || 1);

    LOGGER.info(
      JSON.stringify({
        battingScore,
        battingScorePerGame,
        fieldingScore,
        fieldingScorePerGame,
        pitchingScore,
        pitchingScorePerGame,
      }),
    );
  });
}

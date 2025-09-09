import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import {
  getCareerBattingStatsForPlayer,
  getCareerFieldingStatsForPlayer,
  getCareerPitchingStatsForPlayer,
  getPlayerByBrefId,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import {
  computeScoring,
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import { getDbOptions } from '@legacy-sports/utils';
import { ArgsType } from './ArgsType';

export const computeScoringCommandBuilder = (argv: Argv) =>
  argv
    .usage('computeScoring')
    .option('player', {
      type: 'string',
    })
    .demandOption('player');

type HandleComputeScoringArgs = ArgsType<
  ReturnType<typeof computeScoringCommandBuilder>
>;

export async function handleComputeScoring(
  args: HandleComputeScoringArgs
): Promise<void> {
  LOGGER.debug(`Computing scoring for player ${args.player}`);

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    const player = await getPlayerByBrefId(db, args.player);

    if (player === null) {
      throw new Error(`Could not find player ${args.player}`);
    }

    LOGGER.info(`Computing player ${player.id}`);

    const battingStats = await getCareerBattingStatsForPlayer(db, player.id);
    const fieldingStats = await getCareerFieldingStatsForPlayer(db, player.id);
    const pitchingStats = await getCareerPitchingStatsForPlayer(db, player.id);

    const battingScore = computeScoring(battingStats, DEFAULT_BATTING_SCORING);
    const fieldingScore = computeScoring(
      fieldingStats,
      DEFAULT_FIELDING_SCORING
    );
    const pitchingScore = computeScoring(
      pitchingStats,
      DEFAULT_PITCHING_SCORING
    );

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
      })
    );
  });
}

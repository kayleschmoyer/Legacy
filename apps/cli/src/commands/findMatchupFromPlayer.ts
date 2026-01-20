/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */
import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import type { ArgsType } from './ArgsType';

export const findMatchupFromPlayerCommandBuilder = (argv: Argv) =>
  argv
    .usage('find-matchup-from-player <matchupPlayerId>')
    .positional('matchupPlayerId', {
      type: 'number',
      description: 'Matchup Player ID to trace back to matchup',
      demandOption: true,
    });

type HandleFindMatchupFromPlayerArgs = ArgsType<
  ReturnType<typeof findMatchupFromPlayerCommandBuilder>
>;

export const handleFindMatchupFromPlayer = async (
  args: HandleFindMatchupFromPlayerArgs,
) => {
  const matchupPlayerId = args.matchupPlayerId;

  await runWithPublicClient(getDbOptions(), async (db) => {
    // Find matchup player
    const matchupPlayers = await db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerId))
      .limit(1);

    if (matchupPlayers.length === 0) {
      LOGGER.error(`❌ Matchup Player ${matchupPlayerId} not found!`);
      return;
    }

    const matchupPlayer = matchupPlayers[0];
    LOGGER.info(`✅ Found Matchup Player ${matchupPlayerId}`);
    LOGGER.info(`   Matchup ID: ${matchupPlayer.matchupId}`);
    LOGGER.info(`   Player ID: ${matchupPlayer.playerId}`);

    // Now investigate that matchup
    const matchupId = matchupPlayer.matchupId;
    const matchups = await db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupId))
      .limit(1);

    if (matchups.length === 0) {
      LOGGER.error(`❌ Matchup ${matchupId} not found!`);
      return;
    }

    const matchup = matchups[0];
    LOGGER.info(`\n=== Matchup ${matchupId} Details ===`);
    LOGGER.info(`  League ID: ${matchup.leagueId}`);
    LOGGER.info(`  Selected Season: ${matchup.selectedSeason}`);
    LOGGER.info(`  Games Per Matchup: ${matchup.gamesPerMatchup}`);
    LOGGER.info(`  Status: ${matchup.status}`);
    LOGGER.info(`  Team 1 ID: ${matchup.team1Id}`);
    LOGGER.info(`  Team 2 ID: ${matchup.team2Id}`);
  });
};

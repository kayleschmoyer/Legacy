import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';

interface HandleInvestigateMatchupArgs {
  matchupId: number;
}

export const handleInvestigateMatchup = async (
  args: HandleInvestigateMatchupArgs,
) => {
  const matchupId = args.matchupId;

  await runWithPublicClient(getDbOptions(), async (db) => {
    LOGGER.info(`\n=== Investigating Matchup ${matchupId} ===\n`);

    // 1. Check matchup details
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
    LOGGER.info('📋 Matchup Details:');
    LOGGER.info(`  ID: ${matchup.id}`);
    LOGGER.info(`  League ID: ${matchup.leagueId}`);
    LOGGER.info(`  Games Per Matchup: ${matchup.gamesPerMatchup}`);
    LOGGER.info(`  Week Number: ${matchup.weekNumber}`);
    LOGGER.info(`  Status: ${matchup.status}`);

    // 2. Check matchup players
    const matchupPlayers = await db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

    LOGGER.info(`\n👥 Matchup Players: ${matchupPlayers.length} players`);

    // 3. Check matchup player games
    const matchupPlayerGames = await db
      .select({
        id: PublicSchema.matchupPlayerGames.id,
        matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
        gameNum: PublicSchema.matchupPlayerGames.gameNum,
        gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier,
        statsLoadingStatus: PublicSchema.matchupPlayerGames.statsLoadingStatus,
      })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayerGames.matchupPlayerId,
          PublicSchema.matchupPlayers.id,
        ),
      )
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId))
      .limit(10);

    LOGGER.info(`\n🎮 Matchup Player Games (first 10):`);
    matchupPlayerGames.forEach((game) => {
      LOGGER.info(`  Game ${game.id}:`);
      LOGGER.info(`    Matchup Player ID: ${game.matchupPlayerId}`);
      LOGGER.info(`    Game Num: ${game.gameNum}`);
      LOGGER.info(`    Game Identifier: ${game.gameIdentifier}`);
      LOGGER.info(`    Stats Loading Status: ${game.statsLoadingStatus}`);
    });

    // 4. Summary
    LOGGER.info('\n=== Summary ===');
    LOGGER.info(`✅ Matchup exists: ${matchups.length > 0}`);
    LOGGER.info(`✅ Has players: ${matchupPlayers.length > 0}`);
    LOGGER.info(`✅ Has games: ${matchupPlayerGames.length > 0}`);
    LOGGER.info(
      `${matchupPlayerGames.some((g) => g.gameIdentifier !== null) ? '✅' : '❌'} Game identifiers populated: ${matchupPlayerGames.some((g) => g.gameIdentifier !== null)}`,
    );

    if (!matchupPlayerGames.some((g) => g.gameIdentifier !== null)) {
      LOGGER.warn(
        '\n⚠️  ISSUE: Game identifiers are NULL. Game selection may not have run, or stats are not yet loaded.',
      );
    }
  });
};

import {
  createDatabaseService,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq, and } from 'drizzle-orm';

// Initialize database
createDatabaseService(getDbOptions());

async function investigateMatchup7() {
  await runWithPublicClient(getDbOptions(), async (db) => {
    console.log('\n=== Matchup 7 Investigation ===\n');

    // 1. Check matchup details
    const matchup = await db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, 7))
      .limit(1);

    if (matchup.length === 0) {
      console.log('❌ Matchup 7 not found!');
      return;
    }

    console.log('📋 Matchup Details:');
    console.log(`  ID: ${matchup[0].id}`);
    console.log(`  League ID: ${matchup[0].leagueId}`);
    console.log(`  Selected Season: ${matchup[0].selectedSeason}`);
    console.log(`  Games Per Matchup: ${matchup[0].gamesPerMatchup}`);
    console.log(`  Week: ${matchup[0].week}`);
    console.log(`  Status: ${matchup[0].status}`);

    // 2. Check matchup players
    const matchupPlayers = await db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.matchupId, 7));

    console.log(`\n👥 Matchup Players: ${matchupPlayers.length} players`);

    // 3. Check matchup player games
    const matchupPlayerGames = await db
      .select({
        id: PublicSchema.matchupPlayerGames.id,
        matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
        gameNum: PublicSchema.matchupPlayerGames.gameNum,
        battingGameNum: PublicSchema.matchupPlayerGames.battingGameNum,
        pitchingGameNum: PublicSchema.matchupPlayerGames.pitchingGameNum,
        fieldingGameNum: PublicSchema.matchupPlayerGames.fieldingGameNum,
      })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayerGames.matchupPlayerId,
          PublicSchema.matchupPlayers.id,
        ),
      )
      .where(eq(PublicSchema.matchupPlayers.matchupId, 7))
      .limit(10);

    console.log(`\n🎮 Matchup Player Games (first 10):`);
    matchupPlayerGames.forEach((game) => {
      console.log(`  Game ${game.id}:`);
      console.log(`    Matchup Player ID: ${game.matchupPlayerId}`);
      console.log(`    Game Num: ${game.gameNum}`);
      console.log(`    Batting Game Num: ${game.battingGameNum}`);
      console.log(`    Pitching Game Num: ${game.pitchingGameNum}`);
      console.log(`    Fielding Game Num: ${game.fieldingGameNum}`);
    });

    // 4. Check if players have stats for the selected season
    if (matchup[0].selectedSeason) {
      const firstPlayer = matchupPlayers[0];
      if (firstPlayer) {
        const battingStats = await db
          .select()
          .from(PublicSchema.gameBatting)
          .where(
            and(
              eq(PublicSchema.gameBatting.playerId, firstPlayer.playerId),
              eq(PublicSchema.gameBatting.season, matchup[0].selectedSeason),
            ),
          )
          .limit(5);

        console.log(
          `\n📊 Sample Batting Stats for Player ${firstPlayer.playerId} in ${matchup[0].selectedSeason}:`,
        );
        console.log(`  Found ${battingStats.length} games`);
        battingStats.forEach((stat, idx) => {
          console.log(
            `    Game ${idx + 1}: gameNum=${stat.gameNum}, H=${stat.h}, AB=${stat.ab}`,
          );
        });
      }
    }

    // 5. Summary
    console.log('\n=== Summary ===');
    console.log(`✅ Matchup exists: ${matchup.length > 0}`);
    console.log(`✅ Has selected_season: ${!!matchup[0].selectedSeason}`);
    console.log(`✅ Has players: ${matchupPlayers.length > 0}`);
    console.log(`✅ Has games: ${matchupPlayerGames.length > 0}`);
    console.log(
      `❌ Game numbers populated: ${matchupPlayerGames.some((g) => g.battingGameNum !== null)}`,
    );

    if (!matchup[0].selectedSeason) {
      console.log(
        '\n⚠️  ISSUE: selected_season is NULL! Game selection needs a season to work.',
      );
    } else if (!matchupPlayerGames.some((g) => g.battingGameNum !== null)) {
      console.log(
        '\n⚠️  ISSUE: Game numbers are NULL. Game selection may not have run, or failed.',
      );
    }
  });

  process.exit(0);
}

investigateMatchup7().catch(console.error);

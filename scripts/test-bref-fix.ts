import { getAllGameBattingStats } from '../lib/bref-client/src/lib/CareerStats';

// Test players
const players = [
  {
    id: 8056,
    brefId: 'grahach01',
    firstName: 'Charlie',
    lastName: 'Graham',
    season: 1907,
  },
  {
    id: 8698,
    brefId: 'hannija01',
    firstName: 'Jack',
    lastName: 'Hannifin',
    season: 1907,
  },
];

async function testPlayers() {
  console.log('Testing bref-client game_identifier extraction...\n');

  for (const player of players) {
    console.log(
      `\n==== ${player.firstName} ${player.lastName} (${player.brefId}) - Season ${player.season} ====`,
    );

    try {
      const stats = await getAllGameBattingStats(player, player.season);

      console.log(`Loaded ${stats.length} games`);

      // Show first 3 games
      console.log('\nFirst 3 games:');
      for (let i = 0; i < Math.min(3, stats.length); i++) {
        const game = stats[i];
        console.log(`  Game ${game.gameNum}:`);
        console.log(`    game_identifier: "${game.gameIdentifier}"`);
        console.log(`    AB: ${game.ab}, H: ${game.h}, RBI: ${game.rbi}`);
      }

      // Check if ALL games have identifiers
      const withIdentifier = stats.filter(
        (g) => g.gameIdentifier && g.gameIdentifier.length > 0,
      ).length;
      const withoutIdentifier = stats.filter(
        (g) => !g.gameIdentifier || g.gameIdentifier.length === 0,
      ).length;

      console.log(`\nGame identifier status:`);
      console.log(`  ✅ With identifier: ${withIdentifier}`);
      console.log(`  ❌ Without identifier: ${withoutIdentifier}`);

      if (withIdentifier === stats.length) {
        console.log(`  🎉 SUCCESS: All games have game_identifier populated!`);
      } else {
        console.log(`  ⚠️  FAILURE: Some games missing game_identifier`);
      }
    } catch (error) {
      console.error(
        `❌ Error loading stats for ${player.firstName} ${player.lastName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

testPlayers().catch(console.error);

const { Client } = require('pg');
require('dotenv').config();

async function checkStatsStatus() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    // Check overall stats loading status distribution
    console.log('\n=== Stats Loading Status Distribution ===');
    const statusResult = await client.query(`
      SELECT stats_loading_status, COUNT(*) as count
      FROM matchup_player_games 
      GROUP BY stats_loading_status
      ORDER BY stats_loading_status
    `);
    statusResult.rows.forEach((row) => {
      console.log(`  ${row.stats_loading_status}: ${row.count} games`);
    });

    // Check recent records (last hour)
    console.log('\n=== Recent Game Selections (last 30 minutes) ===');
    const recentResult = await client.query(`
      SELECT id, matchup_player_id, game_num, stats_loading_status
      FROM matchup_player_games 
      WHERE id > (SELECT COALESCE(MAX(id), 0) - 50 FROM matchup_player_games)
      ORDER BY id DESC
      LIMIT 20
    `);
    console.log('  Recent records:');
    recentResult.rows.forEach((row) => {
      console.log(
        `    ID ${row.id}: Game ${row.game_num} - Status: ${row.stats_loading_status}`,
      );
    });

    // Check if there are any pending/loading games
    console.log('\n=== Active Loading Status ===');
    const activeResult = await client.query(`
      SELECT stats_loading_status, COUNT(*) as count
      FROM matchup_player_games 
      WHERE stats_loading_status IN ('pending', 'loading')
      GROUP BY stats_loading_status
    `);
    if (activeResult.rows.length > 0) {
      activeResult.rows.forEach((row) => {
        console.log(`  ${row.stats_loading_status}: ${row.count} games`);
      });
    } else {
      console.log('  No games currently loading');
    }

    // Check for any failed games
    console.log('\n=== Failed Games ===');
    const failedResult = await client.query(`
      SELECT id, matchup_player_id, game_num
      FROM matchup_player_games 
      WHERE stats_loading_status = 'failed'
      LIMIT 10
    `);
    if (failedResult.rows.length > 0) {
      console.log(`  Found ${failedResult.rows.length} failed games:`);
      failedResult.rows.forEach((row) => {
        console.log(
          `    ID ${row.id}: Matchup Player ${row.matchup_player_id}, Game ${row.game_num}`,
        );
      });
    } else {
      console.log('  No failed games found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkStatsStatus();

const { Client } = require('pg');
require('dotenv').config();

async function investigateQueue() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    // Check which matchup players have pending games
    console.log('\n=== Matchup Players with Pending Games ===');
    const pendingPlayersResult = await client.query(`
      SELECT mp.id as matchup_player_id, mp.player_id, mp.matchup_id,
             COUNT(*) as pending_games,
             MIN(mpg.id) as min_game_id,
             MAX(mpg.id) as max_game_id
      FROM matchup_player_games mpg
      JOIN matchup_players mp ON mp.id = mpg.matchup_player_id
      WHERE mpg.stats_loading_status = 'pending'
      GROUP BY mp.id, mp.player_id, mp.matchup_id
      ORDER BY mp.id
      LIMIT 20
    `);
    console.log(
      `  Found ${pendingPlayersResult.rows.length} matchup players with pending games:`,
    );
    pendingPlayersResult.rows.forEach((row) => {
      console.log(
        `    Matchup Player ${row.matchup_player_id}: ${row.pending_games} games (IDs ${row.min_game_id}-${row.max_game_id})`,
      );
    });

    // Check total by matchup
    console.log('\n=== Pending Games by Matchup ===');
    const matchupResult = await client.query(`
      SELECT mp.matchup_id, COUNT(*) as pending_count
      FROM matchup_player_games mpg
      JOIN matchup_players mp ON mp.id = mpg.matchup_player_id
      WHERE mpg.stats_loading_status = 'pending'
      GROUP BY mp.matchup_id
      ORDER BY mp.matchup_id
    `);
    matchupResult.rows.forEach((row) => {
      console.log(
        `    Matchup ${row.matchup_id}: ${row.pending_count} pending games`,
      );
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

investigateQueue();

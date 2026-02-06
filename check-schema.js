const { Client } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'matchup_player_games' 
      ORDER BY ordinal_position
    `);
    console.log('matchup_player_games columns:');
    result.rows.forEach((row) => {
      console.log(
        `  ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`,
      );
    });

    // Also check for any existing records with the new status
    const statusCheck = await client.query(`
      SELECT stats_loading_status, COUNT(*) as count
      FROM matchup_player_games 
      GROUP BY stats_loading_status
      ORDER BY stats_loading_status
    `);
    console.log('\nstats_loading_status values:');
    statusCheck.rows.forEach((row) => {
      console.log(`  ${row.stats_loading_status}: ${row.count} records`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkSchema();

/**
 * Check if season stats are loaded in the database
 * Run with: pnpm exec tsx scripts/check-season-stats.ts
 */
import { Pool } from 'pg';

async function checkSeasonStats() {
  // Use environment variables directly
  const pool = new Pool({
    host: process.env.DB_HOST || process.env.PGHOST,
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432'),
    database: process.env.DB_NAME || process.env.PGDATABASE,
    user: process.env.DB_USER || process.env.PGUSER,
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  });

  console.log('Connecting to database...\n');

  try {
    // Check season_batting
    const battingCount = await pool.query(
      'SELECT COUNT(*) as count FROM season_batting',
    );
    console.log('Season batting stats count:', battingCount.rows[0].count);

    const battingSample = await pool.query(`
      SELECT player_id, season, games, hits, home_runs, rbi, stolen_bases 
      FROM season_batting 
      ORDER BY season DESC, games DESC 
      LIMIT 5
    `);
    console.log('\nSample batting stats:');
    console.table(battingSample.rows);

    // Check season_pitching
    const pitchingCount = await pool.query(
      'SELECT COUNT(*) as count FROM season_pitching',
    );
    console.log('\nSeason pitching stats count:', pitchingCount.rows[0].count);

    const pitchingSample = await pool.query(`
      SELECT player_id, season, games, wins, losses, saves, strikeouts 
      FROM season_pitching 
      ORDER BY season DESC, games DESC 
      LIMIT 5
    `);
    console.log('\nSample pitching stats:');
    console.table(pitchingSample.rows);

    // Check season_fielding
    const fieldingCount = await pool.query(
      'SELECT COUNT(*) as count FROM season_fielding',
    );
    console.log('\nSeason fielding stats count:', fieldingCount.rows[0].count);

    // Check what seasons we have
    const seasons = await pool.query(`
      SELECT DISTINCT season 
      FROM season_batting 
      ORDER BY season DESC
    `);
    console.log(
      '\nAvailable seasons:',
      seasons.rows.map((r: { season: number }) => r.season),
    );
  } catch (error) {
    console.error('Error checking season stats:', error);
  } finally {
    await pool.end();
  }
}

checkSeasonStats();

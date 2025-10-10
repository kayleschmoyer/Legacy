import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

async function checkStats() {
  try {
    const opts = getDbOptions();
    await runWithPublicClient(opts, async (db) => {
      const battingResult = await db.execute(sql`SELECT COUNT(DISTINCT player_id) as count FROM season_batting`);
      const fieldingResult = await db.execute(sql`SELECT COUNT(DISTINCT player_id) as count FROM season_fielding`);
      const pitchingResult = await db.execute(sql`SELECT COUNT(DISTINCT player_id) as count FROM season_pitching`);
      
      console.log('Players with batting stats:', battingResult[0].count);
      console.log('Players with fielding stats:', fieldingResult[0].count);
      console.log('Players with pitching stats:', pitchingResult[0].count);
      
      // Also check total stats records
      const totalBattingResult = await db.execute(sql`SELECT COUNT(*) as count FROM season_batting`);
      const totalFieldingResult = await db.execute(sql`SELECT COUNT(*) as count FROM season_fielding`);
      const totalPitchingResult = await db.execute(sql`SELECT COUNT(*) as count FROM season_pitching`);
      
      console.log('\nTotal records:');
      console.log('Total batting records:', totalBattingResult[0].count);
      console.log('Total fielding records:', totalFieldingResult[0].count);
      console.log('Total pitching records:', totalPitchingResult[0].count);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

checkStats();

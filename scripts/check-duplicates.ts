import { getPublicDbConnection } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq, and, sql } from 'drizzle-orm';
import { matchups } from '@legacy-sports/db-client/src/lib/schema';

async function checkDuplicates() {
  const dbOptions = await getDbOptions();
  const db = await getPublicDbConnection(dbOptions);

  console.log('Checking for duplicate matchups for league 14, week 1...');

  const results = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, 14), eq(matchups.weekNumber, 1)))
    .orderBy(matchups.createdAt);

  console.log(`Found ${results.length} matchup records:`);
  results.forEach((r) => {
    console.log(`  ID: ${r.id}, Created: ${r.createdAt}`);
  });

  // Check if there are duplicates for any league/week combo
  console.log('\nChecking for all duplicate matchups...');
  const duplicates = await db.execute(sql`
    SELECT league_id, week_number, COUNT(*) as count
    FROM matchups
    GROUP BY league_id, week_number
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  console.log(
    `Found ${duplicates.rows.length} league/week combinations with duplicates:`,
  );
  duplicates.rows.forEach((r: any) => {
    console.log(
      `  League ${r.league_id}, Week ${r.week_number}: ${r.count} records`,
    );
  });

  await db.$client.end();
}

checkDuplicates().catch(console.error);

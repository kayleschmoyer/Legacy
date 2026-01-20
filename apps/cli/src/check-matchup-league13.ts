/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */
// Usage: pnpm exec tsx apps/cli/src/check-matchup-league13.ts
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

async function main() {
  await runWithPublicClient(getDbOptions(), async (db) => {
    console.log('=== LEAGUE 13 MATCHUP ANALYSIS ===\n');

    // Get matchup counts
    const matchupResult = await db.execute(sql`
      SELECT 
        m.id as matchup_id,
        m.week,
        m.team1_id,
        m.team2_id,
        COUNT(mp.player_id) as player_count,
        SUM(CASE WHEN p.stats_last_fetched_at IS NOT NULL THEN 1 ELSE 0 END) as players_with_stats
      FROM matchups m
      LEFT JOIN matchup_players mp ON mp.matchup_id = m.id
      LEFT JOIN players p ON p.id = mp.player_id
      WHERE m.league_id = 13
      GROUP BY m.id, m.week, m.team1_id, m.team2_id
      ORDER BY m.week, m.id
    `);

    console.log('Matchups with player counts:');
    console.log(JSON.stringify(matchupResult.rows, null, 2));

    // Get detailed player info for first matchup if any exist
    if (matchupResult.rows.length > 0) {
      const firstMatchup = matchupResult.rows[0] as any;
      console.log(
        `\n=== DETAILED PLAYERS FOR MATCHUP ${firstMatchup.matchup_id} ===\n`,
      );

      const playersResult = await db.execute(sql`
        SELECT 
          p.id,
          p.first_name,
          p.last_name,
          p.bref_id,
          p.stats_last_fetched_at,
          tm.team_id,
          CASE 
            WHEN tm.team_id = ${firstMatchup.team1_id} THEN 'Team 1'
            WHEN tm.team_id = ${firstMatchup.team2_id} THEN 'Team 2'
            ELSE 'Unknown'
          END as team_label
        FROM matchup_players mp
        JOIN players p ON p.id = mp.player_id
        LEFT JOIN team_members tm ON tm.player_id = mp.player_id
          AND tm.league_id = 13
          AND tm.team_id IN (${firstMatchup.team1_id}, ${firstMatchup.team2_id})
        WHERE mp.matchup_id = ${firstMatchup.matchup_id}
        ORDER BY tm.team_id, p.last_name
      `);

      console.log(`Found ${playersResult.rows.length} players:`);
      console.log(JSON.stringify(playersResult.rows, null, 2));
    }

    // Get team rosters for comparison
    console.log('\n=== TEAM ROSTERS (for comparison) ===\n');
    const teamRostersResult = await db.execute(sql`
      SELECT 
        t.id as team_id,
        t.name as team_name,
        COUNT(tm.player_id) as roster_size,
        SUM(CASE WHEN p.stats_last_fetched_at IS NOT NULL THEN 1 ELSE 0 END) as players_with_stats
      FROM teams t
      LEFT JOIN team_members tm ON tm.team_id = t.id
      LEFT JOIN players p ON p.id = tm.player_id
      WHERE t.league_id = 13
      GROUP BY t.id, t.name
      ORDER BY t.id
    `);

    console.log('Team roster sizes:');
    console.log(JSON.stringify(teamRostersResult.rows, null, 2));
  });
}

main().catch(console.error);

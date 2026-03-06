/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { sql } from 'drizzle-orm';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';

export async function investigateLeague13() {
  LOGGER.info('🔍 Investigating League 13 Stats Issue');
  LOGGER.info('═════════════════════════════════════════');

  const dbOptions = getDbOptions();
  await runWithPublicClient(dbOptions, async (db) => {
    // 1. Check roster composition
    LOGGER.info('\n📋 LEAGUE 13 ROSTER ANALYSIS:');
    const rosterStats = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT tm.player_id) as total_drafted,
        COUNT(DISTINCT CASE WHEN p.stats_last_fetched_at IS NOT NULL THEN tm.player_id END) as with_stats_flag,
        COUNT(DISTINCT CASE WHEN sb.player_id IS NOT NULL THEN tm.player_id END) as with_season_batting
      FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      LEFT JOIN (SELECT DISTINCT player_id FROM season_batting) sb ON sb.player_id = p.id
      WHERE tm.team_id IN (SELECT id FROM teams WHERE league_id = 13)
    `);

    const roster = rosterStats.rows[0] as any;
    LOGGER.info(`  Total Players Drafted:           ${roster.total_drafted}`);
    LOGGER.info(
      `  With stats_last_fetched_at:      ${roster.with_stats_flag} (${Math.round((roster.with_stats_flag / roster.total_drafted) * 100)}%)`,
    );
    LOGGER.info(
      `  With season_batting records:     ${roster.with_season_batting} (${Math.round((roster.with_season_batting / roster.total_drafted) * 100)}%)`,
    );
    LOGGER.info(
      `  Missing season_batting:          ${roster.with_stats_flag - roster.with_season_batting}`,
    );

    // 2. Find players with stats_last_fetched_at but NO season_batting
    LOGGER.info('\n🚨 PLAYERS WITH STATS FLAG BUT NO BATTING RECORDS:');
    const problematicPlayers = await db.execute(sql`
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.bref_id,
        p.stats_last_fetched_at,
        COUNT(sb.player_id) as batting_record_count
      FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      LEFT JOIN season_batting sb ON sb.player_id = p.id
      WHERE tm.team_id IN (SELECT id FROM teams WHERE league_id = 13)
        AND p.stats_last_fetched_at IS NOT NULL
      GROUP BY p.id, p.first_name, p.last_name, p.bref_id, p.stats_last_fetched_at
      HAVING COUNT(sb.player_id) = 0
      ORDER BY p.stats_last_fetched_at DESC
      LIMIT 10
    `);

    if (problematicPlayers.rows.length > 0) {
      LOGGER.info(
        `  Found ${problematicPlayers.rows.length} players (showing first 10):`,
      );
      problematicPlayers.rows.forEach((player: any) => {
        LOGGER.info(
          `    - ${player.first_name} ${player.last_name} (${player.bref_id})`,
        );
        LOGGER.info(
          `      ID: ${player.id}, Fetched: ${player.stats_last_fetched_at}`,
        );
      });
    } else {
      LOGGER.info('  ✅ No problematic players found!');
    }

    // 3. Check matchup_players status
    LOGGER.info('\n⚾ MATCHUP STATUS:');
    const matchupStats = await db.execute(sql`
      SELECT 
        m.id as matchup_id,
        m.week_number,
        COUNT(mp.player_id) as player_count,
        COUNT(CASE WHEN sb.player_id IS NOT NULL THEN 1 END) as players_with_batting
      FROM matchups m
      LEFT JOIN matchup_players mp ON mp.matchup_id = m.id
      LEFT JOIN season_batting sb ON sb.player_id = mp.player_id
      WHERE m.league_id = 13
      GROUP BY m.id, m.week_number
      ORDER BY m.week_number, m.id
    `);

    if (matchupStats.rows.length > 0) {
      matchupStats.rows.forEach((matchup: any) => {
        LOGGER.info(
          `  Matchup ${matchup.matchup_id} (Week ${matchup.week_number}):`,
        );
        LOGGER.info(
          `    Players: ${matchup.player_count}, With Batting Stats: ${matchup.players_with_batting}`,
        );
      });
    } else {
      LOGGER.info('  No matchups found for league 13');
    }

    // 4. Check for duplicate players across matchups
    LOGGER.info('\n🔄 DUPLICATE PLAYER CHECK:');
    const duplicateCheck = await db.execute(sql`
      SELECT 
        player_id,
        COUNT(DISTINCT matchup_id) as matchup_count,
        STRING_AGG(DISTINCT matchup_id::text, ', ' ORDER BY matchup_id::text) as matchup_ids
      FROM matchup_players
      WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id = 13)
      GROUP BY player_id
      HAVING COUNT(DISTINCT matchup_id) > 1
      ORDER BY matchup_count DESC
      LIMIT 5
    `);

    if (duplicateCheck.rows.length > 0) {
      LOGGER.info(
        `  ⚠️  Found ${duplicateCheck.rows.length}+ players in multiple matchups (showing top 5):`,
      );
      duplicateCheck.rows.forEach((dup: any) => {
        LOGGER.info(
          `    Player ${dup.player_id}: in ${dup.matchup_count} matchups (${dup.matchup_ids})`,
        );
      });
    } else {
      LOGGER.info(
        '  ✅ No duplicate players found - each player in only one matchup',
      );
    }

    // 5. Check matchup team assignments
    LOGGER.info('\n👥 MATCHUP TEAM STRUCTURE:');
    const firstMatchup = matchupStats.rows[0] as any;
    if (firstMatchup) {
      const matchupTeams = await db.execute(sql`
        SELECT 
          m.id as matchup_id,
          m.team1_id,
          m.team2_id,
          COUNT(DISTINCT mp.player_id) as unique_players,
          COUNT(mp.player_id) as total_rows,
          COUNT(CASE WHEN mp.team_id = m.team1_id THEN 1 END) as team1_player_count,
          COUNT(CASE WHEN mp.team_id = m.team2_id THEN 1 END) as team2_player_count,
          COUNT(CASE WHEN mp.team_id NOT IN (m.team1_id, m.team2_id) THEN 1 END) as other_team_count
        FROM matchups m
        LEFT JOIN matchup_players mp ON mp.matchup_id = m.id
        WHERE m.id = ${firstMatchup.matchup_id}
        GROUP BY m.id, m.team1_id, m.team2_id
      `);

      if (matchupTeams.rows.length > 0) {
        const team = matchupTeams.rows[0] as any;
        LOGGER.info(`  Matchup ${team.matchup_id}:`);
        LOGGER.info(`    Unique players: ${team.unique_players}`);
        LOGGER.info(`    Total rows in matchup_players: ${team.total_rows}`);
        LOGGER.info(
          `    Team ${team.team1_id} rows: ${team.team1_player_count}`,
        );
        LOGGER.info(
          `    Team ${team.team2_id} rows: ${team.team2_player_count}`,
        );
        LOGGER.info(`    Other teams' rows: ${team.other_team_count}`);

        if (team.total_rows > team.unique_players) {
          LOGGER.info(
            `    🚨 ERROR: Players have multiple rows (different seasons?) - ${team.total_rows - team.unique_players} duplicates!`,
          );
        }
        if (team.other_team_count > 0) {
          LOGGER.info(
            `    🚨 ERROR: Players from wrong teams in this matchup!`,
          );
        }
      }

      // Check for season duplication (now in league_week_player_seasons)
      LOGGER.info('\n🔢 SEASON DUPLICATION CHECK:');
      const seasonDupes = await db.execute(sql`
        SELECT 
          player_id,
          COUNT(DISTINCT season) as season_count,
          STRING_AGG(DISTINCT season::text, ', ' ORDER BY season::text) as seasons
        FROM league_week_player_seasons
        WHERE league_id = 13 AND week_number = ${firstMatchup.week_number}
        GROUP BY player_id
        HAVING COUNT(DISTINCT season) > 1
        LIMIT 5
      `);

      if (seasonDupes.rows.length > 0) {
        LOGGER.info(
          `  ⚠️  Found ${seasonDupes.rows.length}+ players with multiple seasons (showing 5):`,
        );
        seasonDupes.rows.forEach((dup: any) => {
          LOGGER.info(
            `    Player ${dup.player_id}: ${dup.season_count} seasons (${dup.seasons})`,
          );
        });
      } else {
        LOGGER.info('  ✅ Each player has exactly one season assigned');
      }
    }

    // 6. Sample a problematic player to see what data they have
    if (problematicPlayers.rows.length > 0) {
      const samplePlayer = problematicPlayers.rows[0] as any;
      LOGGER.info(
        `\n🔬 DETAILED ANALYSIS OF PLAYER ${samplePlayer.id} (${samplePlayer.first_name} ${samplePlayer.last_name}):`,
      );

      // Check other stat tables
      const pitchingCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM season_pitching WHERE player_id = ${samplePlayer.id}
      `);
      const fieldingCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM season_fielding WHERE player_id = ${samplePlayer.id}
      `);

      LOGGER.info(`  season_batting records:  0`);
      LOGGER.info(
        `  season_pitching records: ${(pitchingCount.rows[0] as any).count}`,
      );
      LOGGER.info(
        `  season_fielding records: ${(fieldingCount.rows[0] as any).count}`,
      );
      LOGGER.info(
        `  Stats fetched at:        ${samplePlayer.stats_last_fetched_at}`,
      );
    }

    LOGGER.info('\n═════════════════════════════════════════');
  });

  LOGGER.info('✅ Investigation complete');
}

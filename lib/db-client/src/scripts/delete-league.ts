#!/usr/bin/env tsx
import { eq, sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { getDbOptions } from '@legacy-sports/utils/node';
import * as path from 'path';
import { getPublicDbConnection } from '../index.js';
import { PublicSchema } from '../index.js';

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function deleteLeague(leagueId: number) {
  const dbOptions = getDbOptions();
  const db = getPublicDbConnection(dbOptions);

  try {
    await db.initialize();
    console.log(`Deleting league ${leagueId}...`);

    // Step 1: Find all related teams
    console.log(`Step 1: Finding all related teams...`);
    const teams = await db.db
      .select({ id: PublicSchema.teams.id })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));

    const teamIds = teams.map((t) => t.id);
    console.log(`Found ${teamIds.length} teams`);

    if (teamIds.length > 0) {
      console.log(`Step 2: Deleting matchup_player_games...`);
      await db.db.execute(
        sql.raw(`
        DELETE FROM matchup_player_games 
        WHERE matchup_player_id IN (
          SELECT id FROM matchup_players 
          WHERE matchup_id IN (
            SELECT id FROM matchups WHERE league_id = ${leagueId}
          )
        )
      `),
      );

      console.log(`Step 3: Deleting matchup_players...`);
      await db.db.execute(
        sql.raw(`
        DELETE FROM matchup_players 
        WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id = ${leagueId})
      `),
      );

      console.log(`Step 4: Deleting matchups...`);
      await db.db.execute(
        sql.raw(`DELETE FROM matchups WHERE league_id = ${leagueId}`),
      );

      console.log(`Step 5: Deleting league_week_player_seasons...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM league_week_player_seasons WHERE league_id = ${leagueId}`,
        ),
      );

      console.log(`Step 6: Deleting draft_picks...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM draft_picks WHERE draft_id IN (SELECT id FROM drafts WHERE league_id = ${leagueId})`,
        ),
      );

      console.log(`Step 7: Deleting drafts...`);
      await db.db.execute(
        sql.raw(`DELETE FROM drafts WHERE league_id = ${leagueId}`),
      );

      console.log(`Step 8: Deleting team_players...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM team_players WHERE team_id IN (${teamIds.join(',')})`,
        ),
      );

      console.log(`Step 9: Deleting teams...`);
      await db.db.execute(
        sql.raw(`DELETE FROM teams WHERE league_id = ${leagueId}`),
      );
    }

    console.log(`Step 10: Deleting league_members...`);
    await db.db.execute(
      sql.raw(`DELETE FROM league_members WHERE league_id = ${leagueId}`),
    );

    console.log(`Step 11: Deleting league...`);
    await db.db.execute(sql.raw(`DELETE FROM leagues WHERE id = ${leagueId}`));

    console.log(
      `✅ League ${leagueId} and all related data deleted successfully`,
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete league ${leagueId}:`, error);
    throw error;
  } finally {
    try {
      await db.close();
    } catch {
      // Ignore close errors
    }
  }
}

// Get league ID from command line
const leagueId = parseInt(process.argv[2] || '16', 10);
void deleteLeague(leagueId).catch(console.error);

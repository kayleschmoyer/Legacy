import { getPublicDbConnection } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Delete League Script - Data Operations Only
 *
 * ⚠️ IMPORTANT: This script performs DATA operations (DELETE) only.
 *
 * For SCHEMA changes (ALTER TABLE, CREATE TABLE, etc.),
 * see: docs/database/migration-policy.md
 *
 * All schema changes MUST be done through migrations in:
 * lib/db-client/migrations/
 */

async function deleteLeague(leagueId: number) {
  const dbOptions = getDbOptions();
  const db = await getPublicDbConnection(dbOptions);
  const { PublicSchema } = await import('@legacy-sports/db-client');

  try {
    await db.initialize();
    LOGGER.info(`Deleting league ${leagueId}...`);

    // Import the eq function from drizzle-orm
    const { eq, inArray } = await import('drizzle-orm');

    // Manually delete related records in the correct order
    LOGGER.info(`Step 1: Finding all related teams...`);
    const teams = await db.db
      .select({ id: PublicSchema.teams.id })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));

    const teamIds = teams.map((t) => t.id);
    LOGGER.info(`Found ${teamIds.length} teams`);

    if (teamIds.length > 0) {
      const { sql } = await import('drizzle-orm');

      LOGGER.info(`Step 2: Deleting matchup_player_games...`);
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

      LOGGER.info(`Step 3: Deleting matchup_players...`);
      await db.db.execute(
        sql.raw(`
        DELETE FROM matchup_players 
        WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id = ${leagueId})
      `),
      );

      LOGGER.info(`Step 4: Deleting matchups...`);
      await db.db.execute(
        sql.raw(`DELETE FROM matchups WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 5: Deleting league_week_player_seasons...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM league_week_player_seasons WHERE league_id = ${leagueId}`,
        ),
      );

      LOGGER.info(`Step 6: Deleting draft_picks...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM draft_picks WHERE draft_id IN (SELECT id FROM drafts WHERE league_id = ${leagueId})`,
        ),
      );

      LOGGER.info(`Step 7: Deleting drafts...`);
      await db.db.execute(
        sql.raw(`DELETE FROM drafts WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 8: Deleting draft_teams...`);
      await db.db.execute(
        sql.raw(`DELETE FROM draft_teams WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 9: Deleting team_players...`);
      await db.db
        .delete(PublicSchema.teamPlayers)
        .where(inArray(PublicSchema.teamPlayers.teamId, teamIds));

      LOGGER.info(`Step 10: Deleting playoff_seeds...`);
      if (teamIds.length > 0) {
        await db.db.execute(
          sql.raw(
            `DELETE FROM playoff_seeds WHERE team_id IN (${teamIds.join(',')})`,
          ),
        );
      }

      LOGGER.info(`Step 10: Deleting playoff_matchups...`);
      if (teamIds.length > 0) {
        await db.db.execute(
          sql.raw(
            `DELETE FROM playoff_matchups WHERE high_seed_team_id IN (${teamIds.join(',')}) OR low_seed_team_id IN (${teamIds.join(',')}) OR winner_team_id IN (${teamIds.join(',')})`,
          ),
        );
      }

      LOGGER.info(`Step 11: Deleting champion_trophies...`);
      if (teamIds.length > 0) {
        await db.db.execute(
          sql.raw(
            `DELETE FROM champion_trophies WHERE team_id IN (${teamIds.join(',')}) OR runner_up_team_id IN (${teamIds.join(',')})`,
          ),
        );
      }

      LOGGER.info(`Step 12: Deleting playoff_brackets...`);
      await db.db.execute(
        sql.raw(`DELETE FROM playoff_brackets WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 13: Deleting teams...`);
      await db.db
        .delete(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, leagueId));
    }

    LOGGER.info(`Step 14: Deleting league_members...`);
    await db.db
      .delete(PublicSchema.leagueMembers)
      .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

    LOGGER.info(`Step 15: Deleting league...`);
    await db.db
      .delete(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId));

    LOGGER.info(`League ${leagueId} and all related data deleted successfully`);
    return true;
  } catch (error) {
    LOGGER.error(`Failed to delete league ${leagueId}:`, error);
    throw error;
  } finally {
    try {
      await db.close();
    } catch (e) {
      // Ignore close errors
    }
  }
}

// Get league ID from command line
const leagueId = parseInt(process.argv[2] || '16', 10);
deleteLeague(leagueId).catch(console.error);

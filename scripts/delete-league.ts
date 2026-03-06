import { getPublicDbConnection } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
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
    const { eq } = await import('drizzle-orm');

    // With CASCADE deletes properly configured, we just need to delete the league!
    // The database will automatically cascade the delete to all related tables:
    // - teams (and their cascading children: team_members, playoff_seeds, etc.)
    // - matchups (and their cascading children: matchup_players, matchup_player_games)
    // - drafts (and their cascading children: draft_picks, draft_teams)
    // - league_members
    // - playoff_brackets (and their cascading children: playoff_matchups, playoff_seeds)
    // - champion_trophies
    // - league_week_player_seasons
    // - league_messages
    // - league_positions (and cascading to team_members.position_id)
    // - league_scoring_profiles (and cascading to entries and change log)
    // - roster_lock_rules
    // - tiebreaker_rules

    LOGGER.info(`Deleting league and all related data (via CASCADE)...`);
    const result = await db.db
      .delete(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId));

    LOGGER.info(`League ${leagueId} and all related data deleted successfully`);
    LOGGER.info(
      `Database CASCADE constraints handled all child record deletions`,
    );
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

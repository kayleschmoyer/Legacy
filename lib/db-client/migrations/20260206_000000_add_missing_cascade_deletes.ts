import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add missing CASCADE deletes to remaining foreign keys
 *
 * After reviewing the database constraints, several foreign keys are still
 * missing CASCADE delete behavior:
 *
 * League-related (should cascade when league is deleted):
 * - league_messages.league_id
 * - league_positions.league_id
 * - league_scoring_profiles.league_id
 * - roster_lock_rules.league_id
 * - tiebreaker_rules.league_id ✓ (already has CASCADE)
 *
 * Team-related (should cascade when team is deleted):
 * - matchup_players.team_id
 * - team_members with duplicate constraint
 *
 * Matchup-related (should cascade when matchup is deleted):
 * - matchup_players.matchup_id ✓ (already has CASCADE)
 * - matchup_player_games.matchup_player_id ✓ (already has CASCADE)
 *
 * Player-related (should NOT cascade - players are reference data):
 * - matchup_players.player_id (keep as-is)
 * - team_members.player_id (keep as-is)
 * - season_*.player_id (keep as-is)
 * - league_week_player_seasons.player_id ✓ (already has CASCADE - OK for cache table)
 *
 * This migration adds CASCADE to the appropriate constraints while being
 * careful NOT to cascade player deletions (players should never be deleted).
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Adding missing CASCADE deletes to foreign keys...');

  // ============================================================================
  // LEAGUE-LEVEL CASCADES
  // ============================================================================

  // 1. league_messages.league_id -> leagues.id
  console.log('  - Adding CASCADE to league_messages.league_id');
  await db.execute(`
    ALTER TABLE league_messages 
    DROP CONSTRAINT IF EXISTS league_messages_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE league_messages 
    ADD CONSTRAINT league_messages_leagues_id_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 2. league_positions.league_id -> leagues.id
  console.log('  - Adding CASCADE to league_positions.league_id');
  await db.execute(`
    ALTER TABLE league_positions 
    DROP CONSTRAINT IF EXISTS league_position_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_positions 
    ADD CONSTRAINT league_position_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 3. league_scoring_profiles.league_id -> leagues.id
  console.log('  - Adding CASCADE to league_scoring_profiles.league_id');
  await db.execute(`
    ALTER TABLE league_scoring_profiles 
    DROP CONSTRAINT IF EXISTS league_scoring_profiles_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profiles 
    ADD CONSTRAINT league_scoring_profiles_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 4. roster_lock_rules.league_id -> leagues.id
  console.log('  - Adding CASCADE to roster_lock_rules.league_id');
  await db.execute(`
    ALTER TABLE roster_lock_rules 
    DROP CONSTRAINT IF EXISTS roster_lock_rules_league_fk;
  `);
  await db.execute(`
    ALTER TABLE roster_lock_rules 
    ADD CONSTRAINT roster_lock_rules_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // TEAM-LEVEL CASCADES
  // ============================================================================

  // 5. matchup_players.team_id -> teams.id
  console.log('  - Adding CASCADE to matchup_players.team_id');
  await db.execute(`
    ALTER TABLE matchup_players 
    DROP CONSTRAINT IF EXISTS matchup_players_team_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_players 
    ADD CONSTRAINT matchup_players_team_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // CLEANUP: Remove duplicate/old constraints
  // ============================================================================

  // 6. Remove duplicate team_members constraints (keep the CASCADE one)
  console.log('  - Cleaning up duplicate team_members constraints');

  // Remove old non-cascading constraints
  await db.execute(`
    ALTER TABLE team_members 
    DROP CONSTRAINT IF EXISTS team_members_teams_fk;
  `);

  await db.execute(`
    ALTER TABLE team_members 
    DROP CONSTRAINT IF EXISTS team_members_players_fk;
  `);

  await db.execute(`
    ALTER TABLE team_members 
    DROP CONSTRAINT IF EXISTS team_members_league_fk;
  `);

  // Keep only the CASCADE constraint (already exists from previous migration)
  // team_members_teams_id_fk with CASCADE

  // 7. Remove duplicate matchups constraints
  console.log('  - Cleaning up duplicate matchups constraints');

  // Keep the ON DELETE CASCADE versions, remove duplicates
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_team1_fk;
  `);

  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_team2_fk;
  `);

  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_league_fk;
  `);

  // Keep these CASCADE versions:
  // - matchups_team1_id_teams_id_fk (CASCADE)
  // - matchups_team2_id_teams_id_fk (CASCADE)
  // - matchups_leagues_id_fk (CASCADE)

  // ============================================================================
  // SCORING PROFILE CASCADES
  // ============================================================================

  // 8. league_scoring_profile_entries should cascade when profile is deleted
  console.log(
    '  - Adding CASCADE to league_scoring_profile_entries.profile_id',
  );
  await db.execute(`
    ALTER TABLE league_scoring_profile_entries 
    DROP CONSTRAINT IF EXISTS league_scoring_profile_entries_profile_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profile_entries 
    ADD CONSTRAINT league_scoring_profile_entries_profile_fk 
    FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id) 
    ON DELETE CASCADE;
  `);

  // 9. league_scoring_change_log should cascade when profile is deleted
  console.log('  - Adding CASCADE to league_scoring_change_log.profile_id');
  await db.execute(`
    ALTER TABLE league_scoring_change_log 
    DROP CONSTRAINT IF EXISTS league_scoring_change_log_profile_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_change_log 
    ADD CONSTRAINT league_scoring_change_log_profile_fk 
    FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // POSITION CASCADES
  // ============================================================================

  // 10. team_members.position_id should cascade when position is deleted
  console.log('  - Adding CASCADE to team_members.position_id');
  await db.execute(`
    ALTER TABLE team_members 
    DROP CONSTRAINT IF EXISTS team_members_position_fk;
  `);
  await db.execute(`
    ALTER TABLE team_members 
    ADD CONSTRAINT team_members_position_fk 
    FOREIGN KEY (position_id) REFERENCES league_positions(id) 
    ON DELETE CASCADE;
  `);

  console.log('✅ All missing CASCADE deletes added!');
  console.log(
    '   League deletion will now properly cascade to all related data',
  );
  console.log('   Player references remain non-cascading (as intended)');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Removing CASCADE deletes from foreign keys...');

  // Revert league-level cascades
  await db.execute(`
    ALTER TABLE league_messages DROP CONSTRAINT IF EXISTS league_messages_leagues_id_fk;
    ALTER TABLE league_messages ADD CONSTRAINT league_messages_leagues_id_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE league_positions DROP CONSTRAINT IF EXISTS league_position_league_fk;
    ALTER TABLE league_positions ADD CONSTRAINT league_position_league_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE league_scoring_profiles DROP CONSTRAINT IF EXISTS league_scoring_profiles_league_fk;
    ALTER TABLE league_scoring_profiles ADD CONSTRAINT league_scoring_profiles_league_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE roster_lock_rules DROP CONSTRAINT IF EXISTS roster_lock_rules_league_fk;
    ALTER TABLE roster_lock_rules ADD CONSTRAINT roster_lock_rules_league_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  // Revert team-level cascades
  await db.execute(`
    ALTER TABLE matchup_players DROP CONSTRAINT IF EXISTS matchup_players_team_fk;
    ALTER TABLE matchup_players ADD CONSTRAINT matchup_players_team_fk 
      FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  // Revert scoring profile cascades
  await db.execute(`
    ALTER TABLE league_scoring_profile_entries DROP CONSTRAINT IF EXISTS league_scoring_profile_entries_profile_fk;
    ALTER TABLE league_scoring_profile_entries ADD CONSTRAINT league_scoring_profile_entries_profile_fk 
      FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id);
  `);

  await db.execute(`
    ALTER TABLE league_scoring_change_log DROP CONSTRAINT IF EXISTS league_scoring_change_log_profile_fk;
    ALTER TABLE league_scoring_change_log ADD CONSTRAINT league_scoring_change_log_profile_fk 
      FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id);
  `);

  // Revert position cascade
  await db.execute(`
    ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_position_fk;
    ALTER TABLE team_members ADD CONSTRAINT team_members_position_fk 
      FOREIGN KEY (position_id) REFERENCES league_positions(id);
  `);

  console.log('✅ CASCADE deletes removed');
};

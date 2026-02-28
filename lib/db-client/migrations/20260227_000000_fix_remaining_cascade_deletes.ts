import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix all remaining missing CASCADE deletes for league deletion
 *
 * Ensures that deleting a league (or any entity in the cascade chain) properly
 * removes all dependent rows without requiring manual deletion ordering in code.
 *
 * Changes applied (idempotent — safe to run even if some already exist):
 *
 * Direct league → child cascades (sync Drizzle schema with DB state from 20260206):
 *   - league_messages.league_id               → leagues.id          CASCADE
 *   - league_positions.league_id              → leagues.id          CASCADE
 *   - league_scoring_profiles.league_id       → leagues.id          CASCADE
 *   - roster_lock_rules.league_id             → leagues.id          CASCADE
 *   - league_scoring_profile_entries.profile_id → league_scoring_profiles.id  CASCADE
 *   - league_scoring_change_log.profile_id    → league_scoring_profiles.id  CASCADE
 *   - team_members.position_id               → league_positions.id CASCADE
 *
 * Previously missing (not covered by any prior migration):
 *   - matchup_players.matchup_id             → matchups.id         CASCADE
 *   - matchup_player_games.matchup_player_id → matchup_players.id  CASCADE
 *   - matchup_players.position_id            → league_positions.id SET NULL
 *   - league_week_player_seasons.league_id   → leagues.id          CASCADE
 *
 * Full cascade chain for `DELETE FROM leagues WHERE id = ?`:
 *   leagues
 *   ├── teams (CASCADE)
 *   │   ├── team_members (CASCADE via team_id)
 *   │   ├── matchups (CASCADE via team1_id / team2_id)
 *   │   │   ├── matchup_players (CASCADE via matchup_id) ← NEW
 *   │   │   │   ├── matchup_player_games (CASCADE)       ← NEW
 *   │   │   │   └── position_id SET NULL                 ← NEW
 *   │   │   └── matchup_messages (CASCADE)
 *   │   ├── waiver_claims (CASCADE)
 *   │   ├── trade_offers (CASCADE)
 *   │   └── playoff_brackets (CASCADE)
 *   ├── league_positions (CASCADE)               ← was missing
 *   │   └── team_members.position_id (CASCADE)   ← was missing
 *   ├── league_messages (CASCADE)                ← was missing
 *   ├── league_scoring_profiles (CASCADE)        ← was missing
 *   │   ├── league_scoring_profile_entries (CASCADE)
 *   │   └── league_scoring_change_log (CASCADE)
 *   ├── roster_lock_rules (CASCADE)              ← was missing
 *   ├── league_week_player_seasons (CASCADE)     ← NEW
 *   ├── league_members (CASCADE)
 *   ├── drafts (CASCADE)
 *   ├── champion_trophies (CASCADE)
 *   ├── tiebreaker_rules (CASCADE)
 *   └── league_achievement_restrictions (CASCADE)
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Fixing remaining CASCADE deletes for league deletion...');

  // ============================================================================
  // SYNC DRIZZLE SCHEMA WITH DB (from migration 20260206, idempotent re-apply)
  // ============================================================================

  console.log('  - Ensuring CASCADE on league_messages.league_id');
  await db.execute(`
    ALTER TABLE league_messages
    DROP CONSTRAINT IF EXISTS league_messages_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE league_messages
    ADD CONSTRAINT league_messages_leagues_id_fk
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  `);

  console.log('  - Ensuring CASCADE on league_positions.league_id');
  await db.execute(`
    ALTER TABLE league_positions
    DROP CONSTRAINT IF EXISTS league_position_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_positions
    ADD CONSTRAINT league_position_league_fk
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  `);

  console.log('  - Ensuring CASCADE on league_scoring_profiles.league_id');
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    DROP CONSTRAINT IF EXISTS league_scoring_profiles_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    ADD CONSTRAINT league_scoring_profiles_league_fk
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  `);

  console.log('  - Ensuring CASCADE on roster_lock_rules.league_id');
  await db.execute(`
    ALTER TABLE roster_lock_rules
    DROP CONSTRAINT IF EXISTS roster_lock_rules_league_fk;
  `);
  await db.execute(`
    ALTER TABLE roster_lock_rules
    ADD CONSTRAINT roster_lock_rules_league_fk
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  `);

  console.log(
    '  - Ensuring CASCADE on league_scoring_profile_entries.profile_id',
  );
  await db.execute(`
    ALTER TABLE league_scoring_profile_entries
    DROP CONSTRAINT IF EXISTS league_scoring_profile_entries_profile_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profile_entries
    ADD CONSTRAINT league_scoring_profile_entries_profile_fk
    FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id) ON DELETE CASCADE;
  `);

  console.log('  - Ensuring CASCADE on league_scoring_change_log.profile_id');
  await db.execute(`
    ALTER TABLE league_scoring_change_log
    DROP CONSTRAINT IF EXISTS league_scoring_change_log_profile_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_change_log
    ADD CONSTRAINT league_scoring_change_log_profile_fk
    FOREIGN KEY (profile_id) REFERENCES league_scoring_profiles(id) ON DELETE CASCADE;
  `);

  console.log('  - Ensuring CASCADE on team_members.position_id');
  await db.execute(`
    ALTER TABLE team_members
    DROP CONSTRAINT IF EXISTS team_members_position_fk;
  `);
  await db.execute(`
    ALTER TABLE team_members
    ADD CONSTRAINT team_members_position_fk
    FOREIGN KEY (position_id) REFERENCES league_positions(id) ON DELETE CASCADE;
  `);

  // ============================================================================
  // NEW CASCADES (not in any prior migration)
  // ============================================================================

  console.log('  - Adding CASCADE on matchup_players.matchup_id');
  await db.execute(`
    ALTER TABLE matchup_players
    DROP CONSTRAINT IF EXISTS matchup_players_matchup_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_players
    ADD CONSTRAINT matchup_players_matchup_fk
    FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE;
  `);

  console.log('  - Adding CASCADE on matchup_player_games.matchup_player_id');
  await db.execute(`
    ALTER TABLE matchup_player_games
    DROP CONSTRAINT IF EXISTS matchup_player_games_matchup_player_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_player_games
    ADD CONSTRAINT matchup_player_games_matchup_player_fk
    FOREIGN KEY (matchup_player_id) REFERENCES matchup_players(id) ON DELETE CASCADE;
  `);

  console.log('  - Adding SET NULL on matchup_players.position_id');
  await db.execute(`
    ALTER TABLE matchup_players
    DROP CONSTRAINT IF EXISTS matchup_players_position_fk;
  `);
  // Also drop the auto-generated constraint name (created before explicit FK was added)
  await db.execute(`
    ALTER TABLE matchup_players
    DROP CONSTRAINT IF EXISTS matchup_players_position_id_fkey;
  `);
  await db.execute(`
    ALTER TABLE matchup_players
    ADD CONSTRAINT matchup_players_position_fk
    FOREIGN KEY (position_id) REFERENCES league_positions(id) ON DELETE SET NULL;
  `);

  console.log('  - Adding CASCADE on league_week_player_seasons.league_id');
  await db.execute(`
    ALTER TABLE league_week_player_seasons
    DROP CONSTRAINT IF EXISTS league_week_player_seasons_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_week_player_seasons
    ADD CONSTRAINT league_week_player_seasons_league_fk
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  `);

  console.log('✅ All league cascade deletes are now correctly configured!');
  console.log('   DELETE FROM leagues WHERE id = ? will now fully cascade.');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Reverting league cascade delete fixes...');

  // Revert the new cascades to NO ACTION
  await db.execute(`
    ALTER TABLE matchup_players DROP CONSTRAINT IF EXISTS matchup_players_matchup_fk;
    ALTER TABLE matchup_players ADD CONSTRAINT matchup_players_matchup_fk
      FOREIGN KEY (matchup_id) REFERENCES matchups(id);
  `);

  await db.execute(`
    ALTER TABLE matchup_player_games DROP CONSTRAINT IF EXISTS matchup_player_games_matchup_player_fk;
    ALTER TABLE matchup_player_games ADD CONSTRAINT matchup_player_games_matchup_player_fk
      FOREIGN KEY (matchup_player_id) REFERENCES matchup_players(id);
  `);

  await db.execute(`
    ALTER TABLE matchup_players DROP CONSTRAINT IF EXISTS matchup_players_position_fk;
    ALTER TABLE matchup_players ADD CONSTRAINT matchup_players_position_fk
      FOREIGN KEY (position_id) REFERENCES league_positions(id);
  `);

  await db.execute(`
    ALTER TABLE league_week_player_seasons DROP CONSTRAINT IF EXISTS league_week_player_seasons_league_fk;
    ALTER TABLE league_week_player_seasons ADD CONSTRAINT league_week_player_seasons_league_fk
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  // Note: The synced constraints (from 20260206) are not reverted here as they
  // are managed by migration 20260206's down() function.

  console.log('✅ League cascade deletes reverted');
};

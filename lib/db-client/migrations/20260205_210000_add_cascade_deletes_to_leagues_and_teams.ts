import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add CASCADE deletes to league and team-related foreign keys
 *
 * Ensures that when a league is deleted, all related data is automatically
 * deleted in the correct order:
 * - League deletion cascades to teams, matchups, drafts, members, etc.
 * - Team deletion cascades to team_players, playoff data, etc.
 *
 * This eliminates the need for complex manual deletion scripts and ensures
 * referential integrity at the database level.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Adding CASCADE deletes to league and team foreign keys...');

  // ============================================================================
  // LEAGUE-LEVEL CASCADES
  // ============================================================================

  // 1. teams.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE teams 
    DROP CONSTRAINT IF EXISTS teams_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE teams 
    ADD CONSTRAINT teams_leagues_id_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 2. matchups.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE matchups 
    ADD CONSTRAINT matchups_leagues_id_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 3. drafts.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE drafts 
    DROP CONSTRAINT IF EXISTS drafts_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE drafts 
    ADD CONSTRAINT drafts_leagues_id_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 4. league_members.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE league_members 
    DROP CONSTRAINT IF EXISTS league_members_leagues_id_fk;
  `);
  await db.execute(`
    ALTER TABLE league_members 
    ADD CONSTRAINT league_members_leagues_id_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 5. playoff_brackets.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE playoff_brackets 
    DROP CONSTRAINT IF EXISTS playoff_brackets_league_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_brackets 
    ADD CONSTRAINT playoff_brackets_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // 6. champion_trophies.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE champion_trophies 
    DROP CONSTRAINT IF EXISTS champion_trophies_league_fk;
  `);
  await db.execute(`
    ALTER TABLE champion_trophies 
    ADD CONSTRAINT champion_trophies_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // TEAM-LEVEL CASCADES
  // ============================================================================

  // 7. team_members.team_id -> teams.id
  await db.execute(`
    ALTER TABLE team_members 
    DROP CONSTRAINT IF EXISTS team_members_teams_id_fk;
  `);
  await db.execute(`
    ALTER TABLE team_members 
    ADD CONSTRAINT team_members_teams_id_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 8. matchups.team1_id -> teams.id
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_team1_id_teams_id_fk;
  `);
  await db.execute(`
    ALTER TABLE matchups 
    ADD CONSTRAINT matchups_team1_id_teams_id_fk 
    FOREIGN KEY (team1_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 9. matchups.team2_id -> teams.id
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_team2_id_teams_id_fk;
  `);
  await db.execute(`
    ALTER TABLE matchups 
    ADD CONSTRAINT matchups_team2_id_teams_id_fk 
    FOREIGN KEY (team2_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 10. playoff_seeds.team_id -> teams.id
  await db.execute(`
    ALTER TABLE playoff_seeds 
    DROP CONSTRAINT IF EXISTS playoff_seeds_team_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_seeds 
    ADD CONSTRAINT playoff_seeds_team_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 11. playoff_matchups.high_seed_team_id -> teams.id
  await db.execute(`
    ALTER TABLE playoff_matchups 
    DROP CONSTRAINT IF EXISTS playoff_matchups_high_seed_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_matchups 
    ADD CONSTRAINT playoff_matchups_high_seed_fk 
    FOREIGN KEY (high_seed_team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 12. playoff_matchups.low_seed_team_id -> teams.id
  await db.execute(`
    ALTER TABLE playoff_matchups 
    DROP CONSTRAINT IF EXISTS playoff_matchups_low_seed_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_matchups 
    ADD CONSTRAINT playoff_matchups_low_seed_fk 
    FOREIGN KEY (low_seed_team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 13. playoff_matchups.winner_team_id -> teams.id
  await db.execute(`
    ALTER TABLE playoff_matchups 
    DROP CONSTRAINT IF EXISTS playoff_matchups_winner_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_matchups 
    ADD CONSTRAINT playoff_matchups_winner_fk 
    FOREIGN KEY (winner_team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 14. playoff_brackets.champion_team_id -> teams.id
  await db.execute(`
    ALTER TABLE playoff_brackets 
    DROP CONSTRAINT IF EXISTS playoff_brackets_champion_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_brackets 
    ADD CONSTRAINT playoff_brackets_champion_fk 
    FOREIGN KEY (champion_team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 15. champion_trophies.team_id -> teams.id
  await db.execute(`
    ALTER TABLE champion_trophies 
    DROP CONSTRAINT IF EXISTS champion_trophies_champion_fk;
  `);
  await db.execute(`
    ALTER TABLE champion_trophies 
    ADD CONSTRAINT champion_trophies_champion_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // 16. champion_trophies.runner_up_team_id -> teams.id
  await db.execute(`
    ALTER TABLE champion_trophies 
    DROP CONSTRAINT IF EXISTS champion_trophies_runner_up_fk;
  `);
  await db.execute(`
    ALTER TABLE champion_trophies 
    ADD CONSTRAINT champion_trophies_runner_up_fk 
    FOREIGN KEY (runner_up_team_id) REFERENCES teams(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // BRACKET-LEVEL CASCADES (for completeness)
  // ============================================================================

  // 17. playoff_matchups.bracket_id -> playoff_brackets.id
  await db.execute(`
    ALTER TABLE playoff_matchups 
    DROP CONSTRAINT IF EXISTS playoff_matchups_bracket_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_matchups 
    ADD CONSTRAINT playoff_matchups_bracket_fk 
    FOREIGN KEY (bracket_id) REFERENCES playoff_brackets(id) 
    ON DELETE CASCADE;
  `);

  // 18. playoff_seeds.bracket_id -> playoff_brackets.id
  await db.execute(`
    ALTER TABLE playoff_seeds 
    DROP CONSTRAINT IF EXISTS playoff_seeds_bracket_fk;
  `);
  await db.execute(`
    ALTER TABLE playoff_seeds 
    ADD CONSTRAINT playoff_seeds_bracket_fk 
    FOREIGN KEY (bracket_id) REFERENCES playoff_brackets(id) 
    ON DELETE CASCADE;
  `);

  // ============================================================================
  // DRAFT-LEVEL CASCADES
  // ============================================================================

  // 19. draft_teams.draft_id -> drafts.id
  await db.execute(`
    ALTER TABLE draft_teams 
    DROP CONSTRAINT IF EXISTS draft_teams_drafts_id_fk;
  `);
  await db.execute(`
    ALTER TABLE draft_teams 
    ADD CONSTRAINT draft_teams_drafts_id_fk 
    FOREIGN KEY (draft_id) REFERENCES drafts(id) 
    ON DELETE CASCADE;
  `);

  console.log('✅ CASCADE deletes added to league and team foreign keys');
  console.log('   Now DELETE FROM leagues WHERE id = X will cascade properly!');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔄 Removing CASCADE deletes from league and team foreign keys...',
  );

  // Reverse all constraints back to non-cascading

  // League-level
  await db.execute(`
    ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_leagues_id_fk;
    ALTER TABLE teams ADD CONSTRAINT teams_leagues_id_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE matchups DROP CONSTRAINT IF EXISTS matchups_leagues_id_fk;
    ALTER TABLE matchups ADD CONSTRAINT matchups_leagues_id_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_leagues_id_fk;
    ALTER TABLE drafts ADD CONSTRAINT drafts_leagues_id_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE league_members DROP CONSTRAINT IF EXISTS league_members_leagues_id_fk;
    ALTER TABLE league_members ADD CONSTRAINT league_members_leagues_id_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_brackets DROP CONSTRAINT IF EXISTS playoff_brackets_league_fk;
    ALTER TABLE playoff_brackets ADD CONSTRAINT playoff_brackets_league_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  await db.execute(`
    ALTER TABLE champion_trophies DROP CONSTRAINT IF EXISTS champion_trophies_league_fk;
    ALTER TABLE champion_trophies ADD CONSTRAINT champion_trophies_league_fk 
      FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  // Team-level
  await db.execute(`
    ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_teams_id_fk;
    ALTER TABLE team_members ADD CONSTRAINT team_members_teams_id_fk 
      FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE matchups DROP CONSTRAINT IF EXISTS matchups_team1_id_teams_id_fk;
    ALTER TABLE matchups ADD CONSTRAINT matchups_team1_id_teams_id_fk 
      FOREIGN KEY (team1_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE matchups DROP CONSTRAINT IF EXISTS matchups_team2_id_teams_id_fk;
    ALTER TABLE matchups ADD CONSTRAINT matchups_team2_id_teams_id_fk 
      FOREIGN KEY (team2_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_seeds DROP CONSTRAINT IF EXISTS playoff_seeds_team_fk;
    ALTER TABLE playoff_seeds ADD CONSTRAINT playoff_seeds_team_fk 
      FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups DROP CONSTRAINT IF EXISTS playoff_matchups_high_seed_fk;
    ALTER TABLE playoff_matchups ADD CONSTRAINT playoff_matchups_high_seed_fk 
      FOREIGN KEY (high_seed_team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups DROP CONSTRAINT IF EXISTS playoff_matchups_low_seed_fk;
    ALTER TABLE playoff_matchups ADD CONSTRAINT playoff_matchups_low_seed_fk 
      FOREIGN KEY (low_seed_team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups DROP CONSTRAINT IF EXISTS playoff_matchups_winner_fk;
    ALTER TABLE playoff_matchups ADD CONSTRAINT playoff_matchups_winner_fk 
      FOREIGN KEY (winner_team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_brackets DROP CONSTRAINT IF EXISTS playoff_brackets_champion_fk;
    ALTER TABLE playoff_brackets ADD CONSTRAINT playoff_brackets_champion_fk 
      FOREIGN KEY (champion_team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE champion_trophies DROP CONSTRAINT IF EXISTS champion_trophies_champion_fk;
    ALTER TABLE champion_trophies ADD CONSTRAINT champion_trophies_champion_fk 
      FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  await db.execute(`
    ALTER TABLE champion_trophies DROP CONSTRAINT IF EXISTS champion_trophies_runner_up_fk;
    ALTER TABLE champion_trophies ADD CONSTRAINT champion_trophies_runner_up_fk 
      FOREIGN KEY (runner_up_team_id) REFERENCES teams(id);
  `);

  // Bracket-level
  await db.execute(`
    ALTER TABLE playoff_matchups DROP CONSTRAINT IF EXISTS playoff_matchups_bracket_fk;
    ALTER TABLE playoff_matchups ADD CONSTRAINT playoff_matchups_bracket_fk 
      FOREIGN KEY (bracket_id) REFERENCES playoff_brackets(id);
  `);

  await db.execute(`
    ALTER TABLE playoff_seeds DROP CONSTRAINT IF EXISTS playoff_seeds_bracket_fk;
    ALTER TABLE playoff_seeds ADD CONSTRAINT playoff_seeds_bracket_fk 
      FOREIGN KEY (bracket_id) REFERENCES playoff_brackets(id);
  `);

  // Draft-level
  await db.execute(`
    ALTER TABLE draft_teams DROP CONSTRAINT IF EXISTS draft_teams_drafts_id_fk;
    ALTER TABLE draft_teams ADD CONSTRAINT draft_teams_drafts_id_fk 
      FOREIGN KEY (draft_id) REFERENCES drafts(id);
  `);

  console.log('✅ CASCADE deletes removed from league and team foreign keys');
};

import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Remaining Optional Foreign Key Indexes
 *
 * Adds indexes for low-frequency foreign key columns that were identified
 * during comprehensive database audit. These are optional indexes for:
 * - Playoff team references (only used during playoff weeks)
 * - Chat moderation columns (low query frequency)
 * - Profile cloning feature (infrequent usage)
 * - Runner-up tracking (query optimization)
 *
 * Priority: LOW
 * Expected Impact: Minimal performance improvement for edge case queries
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('Adding remaining optional foreign key indexes...');

  // ============================================================================
  // PLAYOFF SYSTEM INDEXES
  // ============================================================================
  // Indexes for playoff matchup team references
  // Use case: Finding matchups by specific seed or winner
  // Frequency: Low (only during playoff weeks, ~2-3 weeks per season)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS playoff_matchups_high_seed_team_id_idx 
    ON playoff_matchups(high_seed_team_id);
  `);
  console.log('  ✓ playoff_matchups.high_seed_team_id_idx');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS playoff_matchups_low_seed_team_id_idx 
    ON playoff_matchups(low_seed_team_id);
  `);
  console.log('  ✓ playoff_matchups.low_seed_team_id_idx');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS playoff_matchups_winner_team_id_idx 
    ON playoff_matchups(winner_team_id) 
    WHERE winner_team_id IS NOT NULL;
  `);
  console.log('  ✓ playoff_matchups.winner_team_id_idx (partial)');

  // ============================================================================
  // TROPHY SYSTEM INDEXES
  // ============================================================================
  // Index for runner-up team lookups
  // Use case: Finding trophy history for runner-up teams
  // Frequency: Low (historical queries, rare)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS champion_trophies_runner_up_team_id_idx 
    ON champion_trophies(runner_up_team_id) 
    WHERE runner_up_team_id IS NOT NULL;
  `);
  console.log('  ✓ champion_trophies.runner_up_team_id_idx (partial)');

  // ============================================================================
  // CHAT MODERATION INDEXES
  // ============================================================================
  // Indexes for chat moderation and threading features
  // Use case: Moderator activity tracking, message threading
  // Frequency: Very low (moderation is rare, threading is optional UX)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_messages_flagged_by_idx 
    ON matchup_messages(flagged_by) 
    WHERE flagged_by IS NOT NULL;
  `);
  console.log('  ✓ matchup_messages.flagged_by_idx (partial)');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_messages_reply_to_message_id_idx 
    ON matchup_messages(reply_to_message_id) 
    WHERE reply_to_message_id IS NOT NULL;
  `);
  console.log('  ✓ matchup_messages.reply_to_message_id_idx (partial)');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_message_reports_reported_by_idx 
    ON matchup_message_reports(reported_by);
  `);
  console.log('  ✓ matchup_message_reports.reported_by_idx');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_message_reports_reviewed_by_idx 
    ON matchup_message_reports(reviewed_by) 
    WHERE reviewed_by IS NOT NULL;
  `);
  console.log('  ✓ matchup_message_reports.reviewed_by_idx (partial)');

  // ============================================================================
  // SCORING SYSTEM INDEXES
  // ============================================================================
  // Index for profile cloning feature
  // Use case: Finding profiles cloned from a template
  // Frequency: Very low (only during league setup with profile cloning)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS league_scoring_profiles_copied_from_profile_id_idx 
    ON league_scoring_profiles(copied_from_profile_id) 
    WHERE copied_from_profile_id IS NOT NULL;
  `);
  console.log(
    '  ✓ league_scoring_profiles.copied_from_profile_id_idx (partial)',
  );

  console.log('✅ All optional indexes created successfully');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('Removing optional foreign key indexes...');

  // Remove playoff system indexes
  await db.execute(
    'DROP INDEX IF EXISTS playoff_matchups_high_seed_team_id_idx;',
  );
  await db.execute(
    'DROP INDEX IF EXISTS playoff_matchups_low_seed_team_id_idx;',
  );
  await db.execute('DROP INDEX IF EXISTS playoff_matchups_winner_team_id_idx;');
  console.log('  ✓ Removed playoff_matchups team indexes');

  // Remove trophy system index
  await db.execute(
    'DROP INDEX IF EXISTS champion_trophies_runner_up_team_id_idx;',
  );
  console.log('  ✓ Removed champion_trophies.runner_up_team_id_idx');

  // Remove chat moderation indexes
  await db.execute('DROP INDEX IF EXISTS matchup_messages_flagged_by_idx;');
  await db.execute(
    'DROP INDEX IF EXISTS matchup_messages_reply_to_message_id_idx;',
  );
  await db.execute(
    'DROP INDEX IF EXISTS matchup_message_reports_reported_by_idx;',
  );
  await db.execute(
    'DROP INDEX IF EXISTS matchup_message_reports_reviewed_by_idx;',
  );
  console.log('  ✓ Removed chat moderation indexes');

  // Remove scoring system index
  await db.execute(
    'DROP INDEX IF EXISTS league_scoring_profiles_copied_from_profile_id_idx;',
  );
  console.log('  ✓ Removed league_scoring_profiles.copied_from_profile_id_idx');

  console.log('✅ All optional indexes removed successfully');
};

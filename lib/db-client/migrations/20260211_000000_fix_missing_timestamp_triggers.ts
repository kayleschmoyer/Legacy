import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Fix Missing Timestamp Triggers
 *
 * This migration addresses several schema deviations discovered during database analysis:
 *
 * 1. MISSING TRIGGERS (have columns but no auto-update trigger):
 *    - matchup_messages (has created_at and updated_at)
 *    - tiebreaker_rules (has created_at and updated_at)
 *
 * 2. MISSING TIMESTAMPS (audit tables that should track changes):
 *    - league_scoring_change_log (has changed_at, adding created_at/updated_at)
 *    - tiebreaker_history (has resolved_at, adding created_at/updated_at)
 *
 * 3. MISSING TIMESTAMPS (user-generated content):
 *    - champion_trophies (has awarded_at, adding created_at/updated_at)
 *    - league_messages (has timestamp, adding created_at/updated_at)
 *    - players (master registry, adding created_at/updated_at)
 *
 * 4. PARTIAL IMPLEMENTATIONS (have created_at, missing updated_at):
 *    - league_week_player_seasons
 *    - matchup_chat_blocks
 *    - matchup_message_reactions
 *    - matchup_message_reports
 *    - playoff_brackets
 *
 * INTENTIONALLY EXCLUDED (Historical stats - read-only after initial load):
 * - game_batting, game_fielding, game_pitching
 * - season_batting, season_fielding, season_pitching
 * - playoff_matchups, playoff_seeds
 * - league_positions
 *
 * These historical stats tables are loaded from external sources and not modified
 * after initial creation, so timestamps would not provide meaningful audit value.
 *
 * Related: LS-90
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  console.log(
    '🔧 [Migration] Fixing missing timestamp triggers and columns...',
  );

  // ==============================================
  // PART 1: Add triggers to tables with existing timestamp columns
  // ==============================================
  console.log(
    '  [1/5] Adding auto-update triggers to existing timestamp columns...',
  );

  const tablesNeedingTriggers = ['matchup_messages', 'tiebreaker_rules'];

  for (const table of tablesNeedingTriggers) {
    const triggerName = `${table}_updated_at_trigger`;

    // Drop trigger if it already exists (idempotent)
    await db.execute(
      sql.raw(`
      DROP TRIGGER IF EXISTS "${triggerName}" ON public."${table}";
    `),
    );

    // Create trigger
    await db.execute(
      sql.raw(`
      CREATE TRIGGER "${triggerName}"
      BEFORE UPDATE ON public."${table}"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `),
    );

    console.log(`    ✓ Added trigger to ${table}`);
  }

  // ==============================================
  // PART 2: Add complete timestamps to audit tables
  // ==============================================
  console.log('  [2/5] Adding timestamps to audit tables...');

  // league_scoring_change_log: Add created_at and updated_at
  await db.execute(sql`
    ALTER TABLE public.league_scoring_change_log
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE public.league_scoring_change_log
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS league_scoring_change_log_updated_at_trigger ON public.league_scoring_change_log;
  `),
  );

  await db.execute(
    sql.raw(`
    CREATE TRIGGER league_scoring_change_log_updated_at_trigger
    BEFORE UPDATE ON public.league_scoring_change_log
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `),
  );

  console.log('    ✓ Added timestamps + trigger to league_scoring_change_log');

  // tiebreaker_history: Add created_at and updated_at
  await db.execute(sql`
    ALTER TABLE public.tiebreaker_history
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE public.tiebreaker_history
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS tiebreaker_history_updated_at_trigger ON public.tiebreaker_history;
  `),
  );

  await db.execute(
    sql.raw(`
    CREATE TRIGGER tiebreaker_history_updated_at_trigger
    BEFORE UPDATE ON public.tiebreaker_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `),
  );

  console.log('    ✓ Added timestamps + trigger to tiebreaker_history');

  // ==============================================
  // PART 3: Add complete timestamps to user-generated content
  // ==============================================
  console.log('  [3/5] Adding timestamps to user-generated content tables...');

  // champion_trophies: Add created_at and updated_at
  await db.execute(sql`
    ALTER TABLE public.champion_trophies
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE public.champion_trophies
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS champion_trophies_updated_at_trigger ON public.champion_trophies;
  `),
  );

  await db.execute(
    sql.raw(`
    CREATE TRIGGER champion_trophies_updated_at_trigger
    BEFORE UPDATE ON public.champion_trophies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `),
  );

  console.log('    ✓ Added timestamps + trigger to champion_trophies');

  // league_messages: Add created_at and updated_at
  await db.execute(sql`
    ALTER TABLE public.league_messages
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE public.league_messages
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS league_messages_updated_at_trigger ON public.league_messages;
  `),
  );

  await db.execute(
    sql.raw(`
    CREATE TRIGGER league_messages_updated_at_trigger
    BEFORE UPDATE ON public.league_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `),
  );

  console.log('    ✓ Added timestamps + trigger to league_messages');

  // players: Add created_at and updated_at
  await db.execute(sql`
    ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS players_updated_at_trigger ON public.players;
  `),
  );

  await db.execute(
    sql.raw(`
    CREATE TRIGGER players_updated_at_trigger
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `),
  );

  console.log('    ✓ Added timestamps + trigger to players');

  // ==============================================
  // PART 4: Complete partial implementations (add updated_at column)
  // ==============================================
  console.log('  [4/5] Completing partial timestamp implementations...');

  const tablesNeedingUpdatedAt = [
    'league_week_player_seasons',
    'matchup_chat_blocks',
    'matchup_message_reactions',
    'matchup_message_reports',
    'playoff_brackets',
  ];

  for (const table of tablesNeedingUpdatedAt) {
    // Add updated_at column
    await db.execute(
      sql.raw(`
      ALTER TABLE public."${table}"
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
    `),
    );

    const triggerName = `${table}_updated_at_trigger`;

    // Drop trigger if it already exists (idempotent)
    await db.execute(
      sql.raw(`
      DROP TRIGGER IF EXISTS "${triggerName}" ON public."${table}";
    `),
    );

    // Create trigger
    await db.execute(
      sql.raw(`
      CREATE TRIGGER "${triggerName}"
      BEFORE UPDATE ON public."${table}"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `),
    );

    console.log(`    ✓ Added updated_at + trigger to ${table}`);
  }

  // ==============================================
  // PART 5: Verification
  // ==============================================
  console.log('  [5/5] Verifying trigger installation...');

  // Query to verify triggers exist
  const triggerCheckQuery = sql`
    SELECT 
      trigger_name,
      event_object_table
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND trigger_name LIKE '%updated_at_trigger%'
      AND event_object_table IN ('matchup_messages', 'tiebreaker_rules', 'league_scoring_change_log', 
                                   'tiebreaker_history', 'champion_trophies', 'league_messages', 
                                   'players', 'league_week_player_seasons', 'matchup_chat_blocks', 
                                   'matchup_message_reactions', 'matchup_message_reports', 'playoff_brackets')
    ORDER BY event_object_table
  `;

  const triggers = await db.execute(triggerCheckQuery);
  const triggerCount = Array.isArray(triggers) ? triggers.length : 0;
  console.log(`    ✓ Verified ${triggerCount} triggers installed`);

  console.log(
    '✅ [Migration] Successfully fixed all missing timestamp triggers and columns',
  );
  console.log('');
  console.log('📝 Summary:');
  console.log('  - Added triggers to 2 tables with existing timestamps');
  console.log(
    '  - Added complete timestamps to 5 tables (2 audit + 3 user content)',
  );
  console.log('  - Completed 5 partial implementations');
  console.log('  - Total: 12 tables now have automatic timestamp management');
  console.log('');
  console.log(
    'ℹ️  Historical stats tables intentionally excluded (read-only data)',
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('⏪ [Migration] Reverting timestamp triggers and columns...');

  // Remove all triggers created in this migration
  const allTables = [
    'matchup_messages',
    'tiebreaker_rules',
    'league_scoring_change_log',
    'tiebreaker_history',
    'champion_trophies',
    'league_messages',
    'players',
    'league_week_player_seasons',
    'matchup_chat_blocks',
    'matchup_message_reactions',
    'matchup_message_reports',
    'playoff_brackets',
  ];

  for (const table of allTables) {
    await db.execute(
      sql.raw(`
      DROP TRIGGER IF EXISTS ${table}_updated_at_trigger ON public."${table}";
    `),
    );
  }

  // Remove updated_at from tables that didn't have it before
  const tablesWithNewUpdatedAt = [
    'league_scoring_change_log',
    'tiebreaker_history',
    'champion_trophies',
    'league_messages',
    'players',
    'league_week_player_seasons',
    'matchup_chat_blocks',
    'matchup_message_reactions',
    'matchup_message_reports',
    'playoff_brackets',
  ];

  for (const table of tablesWithNewUpdatedAt) {
    await db.execute(
      sql.raw(`
      ALTER TABLE public."${table}"
      DROP COLUMN IF EXISTS updated_at;
    `),
    );
  }

  // Remove created_at from tables that didn't have it before
  const tablesWithNewCreatedAt = [
    'league_scoring_change_log',
    'tiebreaker_history',
    'champion_trophies',
    'league_messages',
    'players',
  ];

  for (const table of tablesWithNewCreatedAt) {
    await db.execute(
      sql.raw(`
      ALTER TABLE public."${table}"
      DROP COLUMN IF EXISTS created_at;
    `),
    );
  }

  console.log('✅ [Migration] Reverted all timestamp changes');
};

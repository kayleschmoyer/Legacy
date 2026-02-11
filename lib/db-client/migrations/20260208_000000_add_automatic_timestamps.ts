import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add automatic timestamp triggers
 *
 * This migration adds:
 * 1. A reusable trigger function to auto-update `updated_at`
 * 2. Applies triggers to all existing tables with updated_at columns
 * 3. Adds created_at/updated_at to tables that don't have them
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Step 1: Create the reusable trigger function
  await db.execute(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Step 2: Add created_at and updated_at to core tables that don't have them
  const tablesToAddTimestamps = [
    'leagues',
    'teams',
    'league_members',
    'team_members',
    'drafts',
    'draft_teams',
    'matchups',
    'matchup_players',
    'matchup_player_games',
    'roster_lock_rules',
  ];

  for (const table of tablesToAddTimestamps) {
    await db.execute(`
      ALTER TABLE public."${table}"
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
    `);

    await db.execute(`
      ALTER TABLE public."${table}"
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
    `);
  }

  // Add timestamps to app_internal.users table
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
  `);

  // Step 3a: Clean up legacy trigger names created by earlier notification migrations
  // (Prevents two updated_at triggers firing on the same table)
  await db.execute(`
    DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public."notification_preferences";
    DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON public."device_tokens";
    DROP TRIGGER IF EXISTS update_notification_history_updated_at ON public."notification_history";
  `);

  // Step 3: Create triggers for all tables with updated_at column
  const allTablesWithUpdatedAt = [
    // Tables we just added timestamps to
    ...tablesToAddTimestamps,
    // Tables that already have updated_at
    'notification_preferences',
    'device_tokens',
    'notification_history',
    'scoring_stat_definitions',
    'league_scoring_profiles',
    'league_scoring_profile_entries',
  ];

  for (const table of allTablesWithUpdatedAt) {
    const triggerName = `${table}_updated_at_trigger`;

    // Drop trigger if it already exists (idempotent)
    await db.execute(`
      DROP TRIGGER IF EXISTS "${triggerName}" ON public."${table}";
    `);

    // Create trigger
    await db.execute(`
      CREATE TRIGGER "${triggerName}"
      BEFORE UPDATE ON public."${table}"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  // Create trigger for app_internal.users
  await db.execute(`
    DROP TRIGGER IF EXISTS users_updated_at_trigger ON app_internal.users;
  `);

  await db.execute(`
    CREATE TRIGGER users_updated_at_trigger
    BEFORE UPDATE ON app_internal.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Automatic timestamp triggers created successfully');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove all triggers
  const tables = [
    'leagues',
    'teams',
    'league_members',
    'team_members',
    'drafts',
    'draft_teams',
    'matchups',
    'matchup_players',
    'matchup_player_games',
    'roster_lock_rules',
    'notification_preferences',
    'device_tokens',
    'notification_history',
    'scoring_stat_definitions',
    'league_scoring_profiles',
    'league_scoring_profile_entries',
  ];

  for (const table of tables) {
    await db.execute(`
      DROP TRIGGER IF EXISTS ${table}_updated_at_trigger ON public."${table}";
    `);
  }

  // Remove trigger from app_internal.users
  await db.execute(`
    DROP TRIGGER IF EXISTS users_updated_at_trigger ON app_internal.users;
  `);

  // Drop the trigger function
  await db.execute(`
    DROP FUNCTION IF EXISTS update_updated_at_column();
  `);

  console.log('✅ Automatic timestamp triggers removed');
};

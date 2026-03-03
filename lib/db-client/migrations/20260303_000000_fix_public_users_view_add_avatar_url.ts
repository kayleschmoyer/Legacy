import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix public.users VIEW to include avatar_url (LS-415)
 *
 * Purpose:
 * - The initial schema (20251108_000000_initial_schema.ts) created the
 *   public.users VIEW without avatar_url.
 * - Migration 20260301_000000_add_avatar_and_branding_fields.ts (LS-288)
 *   added avatar_url to app_internal.users but did NOT update the VIEW.
 * - Migration 20260301_130000_add_avatar_url_to_users.ts (LS-351) was later
 *   amended to recreate the VIEW (LS-399), but any database that had already
 *   run the migration in its original form won't re-execute the VIEW update.
 *
 * This idempotent migration ensures the VIEW is up to date on all environments
 * by using CREATE OR REPLACE VIEW unconditionally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔧 Ensuring public.users VIEW includes avatar_url...');

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url
      FROM app_internal.users;
  `);

  console.log('✅ public.users VIEW updated to include avatar_url');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Reverting public.users VIEW to exclude avatar_url...');

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level
      FROM app_internal.users;
  `);

  console.log('✅ Reverted: public.users VIEW no longer includes avatar_url');
};

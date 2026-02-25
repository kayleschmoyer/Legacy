import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add message_type and metadata columns to league_messages
 *
 * Purpose:
 * - Enable structured rendering of system-generated chat events (trades,
 *   waiver claims, draft updates) as interactive cards in the league chat UI.
 *
 * Changes:
 * - Add `message_type` VARCHAR(50) NOT NULL DEFAULT 'text'
 *   Values: 'text' | 'trade' | 'waiver' | 'draft_settings'
 * - Add `metadata` JSONB nullable — carries display/navigation context
 *   e.g. { teamName, playerName } for waivers; { action, proposingTeam } for trades
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS metadata JSONB;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      DROP COLUMN IF EXISTS message_type,
      DROP COLUMN IF EXISTS metadata;
  `);
};

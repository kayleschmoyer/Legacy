import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Direct Messages Table
 *
 * Adds the `direct_messages` table to support player-to-player DMs.
 * This completes the chat system alongside the existing `league_messages`
 * table (league-wide chat room) and `matchup_messages` (matchup chat).
 *
 * Table schema:
 *   - id: auto-incrementing primary key
 *   - from_user_id: sender (references users view)
 *   - to_user_id: recipient (references users view)
 *   - league_id: optional league context (for in-league DMs)
 *   - message_text: message body (up to 2000 chars enforced in app layer)
 *   - read_at: null until recipient reads; enables unread counts
 *   - deleted_at: soft-delete (sender can retract before read)
 *   - created_at / updated_at: audit timestamps
 *
 * Indexes:
 *   - from_user_id: inbox queries for the sender
 *   - to_user_id: inbox queries for the recipient
 *   - conversation: composite (from_user_id, to_user_id) for thread view
 *   - unread: partial index on (to_user_id) WHERE read_at IS NULL
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('Adding direct_messages table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "direct_messages" (
      "id"           serial PRIMARY KEY NOT NULL,
      "from_user_id" integer NOT NULL,
      "to_user_id"   integer NOT NULL,
      "league_id"    integer,
      "message_text" text NOT NULL,
      "read_at"      timestamp with time zone,
      "deleted_at"   timestamp with time zone,
      "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ direct_messages table created');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "direct_messages_from_user_id_idx"
      ON "direct_messages" USING btree ("from_user_id");
  `);
  console.log('  ✓ direct_messages.from_user_id index');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "direct_messages_to_user_id_idx"
      ON "direct_messages" USING btree ("to_user_id");
  `);
  console.log('  ✓ direct_messages.to_user_id index');

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "direct_messages_conversation_idx"
      ON "direct_messages" USING btree ("from_user_id", "to_user_id");
  `);
  console.log('  ✓ direct_messages.conversation composite index');

  // Partial index for fast unread message queries (to_user_id WHERE unread)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "direct_messages_unread_idx"
      ON "direct_messages" ("to_user_id")
      WHERE "read_at" IS NULL AND "deleted_at" IS NULL;
  `);
  console.log('  ✓ direct_messages.unread partial index');

  console.log('direct_messages migration complete.');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('Dropping direct_messages table...');
  await db.execute(`DROP TABLE IF EXISTS "direct_messages" CASCADE;`);
  console.log('  ✓ direct_messages dropped');
};

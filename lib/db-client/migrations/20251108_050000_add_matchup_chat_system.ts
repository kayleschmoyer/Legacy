/**
 * Migration: Add matchup chat system
 * Created: 2025-11-08
 * Ticket: LS-31
 *
 * Adds comprehensive matchup chat system with:
 * - Chat-specific enums (block scope, reaction types, report status, message types)
 * - Roster lock rules (emergency_sub_rule, roster_lock_timing enums)
 * - Chat blocks table
 * - Message connections (WebSocket)
 * - Message reactions
 * - Message reports (moderation)
 * - Messages table with full features
 * - Additional league columns for roster lock
 * - Foreign key constraints and indexes
 *
 * Note: This migration assumes notification tables and playoff tables
 * already exist from previous migrations (LS-25, LS-28).
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Create roster lock enums
  await db.execute(`
    CREATE TYPE emergency_sub_rule AS ENUM('none', 'injury_only', 'injury_or_rest', 'commissioner_approval');
  `);

  await db.execute(`
    CREATE TYPE roster_lock_timing AS ENUM('matchup_start', 'day_before', 'week_before', 'custom');
  `);

  // Create chat-specific enums
  await db.execute(`
    CREATE TYPE matchup_chat_block_scope AS ENUM('matchup', 'league', 'global');
  `);

  await db.execute(`
    CREATE TYPE matchup_message_reaction_type AS ENUM('like', 'fire', 'laugh', 'wow', 'trophy', 'thumbs_down');
  `);

  await db.execute(`
    CREATE TYPE matchup_message_report_status AS ENUM('pending', 'reviewing', 'resolved', 'dismissed');
  `);

  await db.execute(`
    CREATE TYPE matchup_message_type AS ENUM('text', 'gif', 'system');
  `);

  // Create roster lock rules table
  await db.execute(`
    CREATE TABLE roster_lock_rules (
      id serial PRIMARY KEY NOT NULL,
      league_id integer NOT NULL,
      allow_emergency_subs boolean DEFAULT false NOT NULL,
      emergency_sub_rule emergency_sub_rule DEFAULT 'none' NOT NULL,
      custom_lock_time timestamp,
      lock_hours_before_matchup integer DEFAULT 0,
      commissioner_can_override boolean DEFAULT true NOT NULL,
      CONSTRAINT roster_lock_rules_league_uk UNIQUE(league_id)
    );
  `);

  // Create chat blocks table
  await db.execute(`
    CREATE TABLE matchup_chat_blocks (
      id serial PRIMARY KEY NOT NULL,
      league_id integer NOT NULL,
      matchup_id integer,
      blocking_user_id integer NOT NULL,
      blocked_user_id integer NOT NULL,
      scope matchup_chat_block_scope DEFAULT 'matchup' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      expires_at timestamp
    );
  `);

  // Create message connections table (WebSocket)
  await db.execute(`
    CREATE TABLE matchup_message_connections (
      connection_id varchar(128) NOT NULL,
      league_id integer NOT NULL,
      matchup_id integer NOT NULL,
      user_id integer NOT NULL,
      platform varchar(32) DEFAULT 'web' NOT NULL,
      connected_at timestamp DEFAULT now() NOT NULL,
      last_seen_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT matchup_message_connections_pk PRIMARY KEY(connection_id)
    );
  `);

  // Create message reactions table
  await db.execute(`
    CREATE TABLE matchup_message_reactions (
      id serial PRIMARY KEY NOT NULL,
      message_id integer NOT NULL,
      user_id integer NOT NULL,
      reaction_type matchup_message_reaction_type DEFAULT 'like' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT matchup_message_reactions_unique UNIQUE(message_id, user_id, reaction_type)
    );
  `);

  // Create message reports table
  await db.execute(`
    CREATE TABLE matchup_message_reports (
      id serial PRIMARY KEY NOT NULL,
      message_id integer NOT NULL,
      reported_by integer NOT NULL,
      reason text NOT NULL,
      status matchup_message_report_status DEFAULT 'pending' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      resolved_at timestamp,
      reviewed_by integer,
      moderator_notes text,
      resolution text
    );
  `);

  // Create messages table
  await db.execute(`
    CREATE TABLE matchup_messages (
      id serial PRIMARY KEY NOT NULL,
      matchup_id integer NOT NULL,
      league_id integer NOT NULL,
      sender_id integer NOT NULL,
      message_type matchup_message_type DEFAULT 'text' NOT NULL,
      message text DEFAULT '' NOT NULL,
      gif_url text,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      contains_profanity boolean DEFAULT false NOT NULL,
      is_flagged boolean DEFAULT false NOT NULL,
      flagged_by integer,
      flagged_reason text,
      moderated_at timestamp,
      deleted_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      reply_to_message_id integer,
      pinned_at timestamp
    );
  `);

  // Add roster lock columns to leagues
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN trade_deadline_week integer,
      ADD COLUMN roster_lock_timing roster_lock_timing DEFAULT 'matchup_start' NOT NULL;
  `);

  // Add foreign key constraints for roster_lock_rules
  await db.execute(`
    ALTER TABLE roster_lock_rules 
      ADD CONSTRAINT roster_lock_rules_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  // Add foreign key constraints for matchup_chat_blocks
  await db.execute(`
    ALTER TABLE matchup_chat_blocks 
      ADD CONSTRAINT matchup_chat_blocks_blocking_fk 
        FOREIGN KEY (blocking_user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_chat_blocks 
      ADD CONSTRAINT matchup_chat_blocks_blocked_fk 
        FOREIGN KEY (blocked_user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_chat_blocks 
      ADD CONSTRAINT matchup_chat_blocks_matchup_fk 
        FOREIGN KEY (matchup_id) 
        REFERENCES matchups(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_chat_blocks 
      ADD CONSTRAINT matchup_chat_blocks_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  // Add foreign key constraints for matchup_message_connections
  await db.execute(`
    ALTER TABLE matchup_message_connections 
      ADD CONSTRAINT matchup_message_connections_user_fk 
        FOREIGN KEY (user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_message_connections 
      ADD CONSTRAINT matchup_message_connections_matchup_fk 
        FOREIGN KEY (matchup_id) 
        REFERENCES matchups(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_message_connections 
      ADD CONSTRAINT matchup_message_connections_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  // Add foreign key constraints for matchup_message_reactions
  await db.execute(`
    ALTER TABLE matchup_message_reactions 
      ADD CONSTRAINT matchup_message_reactions_message_fk 
        FOREIGN KEY (message_id) 
        REFERENCES matchup_messages(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_message_reactions 
      ADD CONSTRAINT matchup_message_reactions_user_fk 
        FOREIGN KEY (user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  // Add foreign key constraints for matchup_message_reports
  await db.execute(`
    ALTER TABLE matchup_message_reports 
      ADD CONSTRAINT matchup_message_reports_message_fk 
        FOREIGN KEY (message_id) 
        REFERENCES matchup_messages(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_message_reports 
      ADD CONSTRAINT matchup_message_reports_reporter_fk 
        FOREIGN KEY (reported_by) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_message_reports 
      ADD CONSTRAINT matchup_message_reports_reviewer_fk 
        FOREIGN KEY (reviewed_by) 
        REFERENCES app_internal.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
  `);

  // Add foreign key constraints for matchup_messages
  await db.execute(`
    ALTER TABLE matchup_messages 
      ADD CONSTRAINT matchup_messages_matchup_fk 
        FOREIGN KEY (matchup_id) 
        REFERENCES matchups(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_messages 
      ADD CONSTRAINT matchup_messages_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_messages 
      ADD CONSTRAINT matchup_messages_sender_fk 
        FOREIGN KEY (sender_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_messages 
      ADD CONSTRAINT matchup_messages_reply_fk 
        FOREIGN KEY (reply_to_message_id) 
        REFERENCES matchup_messages(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE matchup_messages 
      ADD CONSTRAINT matchup_messages_flagger_fk 
        FOREIGN KEY (flagged_by) 
        REFERENCES app_internal.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
  `);

  // Create indexes
  await db.execute(`
    CREATE UNIQUE INDEX matchup_chat_blocks_unique 
      ON matchup_chat_blocks (blocking_user_id, blocked_user_id, scope, league_id, matchup_id);
  `);

  await db.execute(
    `CREATE INDEX matchup_message_connections_matchup_idx ON matchup_message_connections(matchup_id);`,
  );
  await db.execute(
    `CREATE INDEX matchup_message_connections_user_idx ON matchup_message_connections(user_id);`,
  );
  await db.execute(
    `CREATE INDEX matchup_message_connections_league_idx ON matchup_message_connections(league_id);`,
  );
  await db.execute(
    `CREATE INDEX matchup_message_reactions_message_idx ON matchup_message_reactions(message_id);`,
  );
  await db.execute(
    `CREATE INDEX matchup_message_reports_status_idx ON matchup_message_reports(status);`,
  );
  await db.execute(
    `CREATE INDEX matchup_messages_matchup_idx ON matchup_messages(matchup_id, created_at);`,
  );
  await db.execute(
    `CREATE INDEX matchup_messages_league_idx ON matchup_messages(league_id, created_at);`,
  );
  await db.execute(
    `CREATE INDEX matchup_messages_sender_idx ON matchup_messages(sender_id);`,
  );
  await db.execute(
    `CREATE INDEX matchup_messages_flagged_idx ON matchup_messages(is_flagged);`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop indexes
  await db.execute(`DROP INDEX IF EXISTS matchup_messages_flagged_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_messages_sender_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_messages_league_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_messages_matchup_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_message_reports_status_idx;`);
  await db.execute(
    `DROP INDEX IF EXISTS matchup_message_reactions_message_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS matchup_message_connections_league_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS matchup_message_connections_user_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS matchup_message_connections_matchup_idx;`,
  );
  await db.execute(`DROP INDEX IF EXISTS matchup_chat_blocks_unique;`);

  // Drop league columns
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS roster_lock_timing,
      DROP COLUMN IF EXISTS trade_deadline_week;
  `);

  // Drop tables (constraints will be dropped automatically)
  await db.execute(`DROP TABLE IF EXISTS matchup_messages;`);
  await db.execute(`DROP TABLE IF EXISTS matchup_message_reports;`);
  await db.execute(`DROP TABLE IF EXISTS matchup_message_reactions;`);
  await db.execute(`DROP TABLE IF EXISTS matchup_message_connections;`);
  await db.execute(`DROP TABLE IF EXISTS matchup_chat_blocks;`);
  await db.execute(`DROP TABLE IF EXISTS roster_lock_rules;`);

  // Drop enums
  await db.execute(`DROP TYPE IF EXISTS matchup_message_type;`);
  await db.execute(`DROP TYPE IF EXISTS matchup_message_report_status;`);
  await db.execute(`DROP TYPE IF EXISTS matchup_message_reaction_type;`);
  await db.execute(`DROP TYPE IF EXISTS matchup_chat_block_scope;`);
  await db.execute(`DROP TYPE IF EXISTS roster_lock_timing;`);
  await db.execute(`DROP TYPE IF EXISTS emergency_sub_rule;`);
};

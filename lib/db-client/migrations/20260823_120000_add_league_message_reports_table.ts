/**
 * Migration: Add league message reports table
 * Created: 2026-08-23
 * Ticket: LS-6297
 *
 * League chat has no moderation report table analogous to
 * matchup_message_reports (LS-31). matchup_message_reports.message_id is a
 * hard FK to matchup_messages, so it cannot be reused for league_messages —
 * this migration creates a parallel league_message_reports table FK'd to
 * league_messages instead, reusing the existing matchup_message_report_status
 * enum since the moderation lifecycle is identical.
 *
 * Blocking does not need a new table: matchup_chat_blocks already supports
 * scope='league' with a nullable matchup_id, so league chat blocks reuse
 * that table directly.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE TABLE league_message_reports (
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

  await db.execute(`
    ALTER TABLE league_message_reports
      ADD CONSTRAINT league_message_reports_message_fk
        FOREIGN KEY (message_id)
        REFERENCES league_messages(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE league_message_reports
      ADD CONSTRAINT league_message_reports_reporter_fk
        FOREIGN KEY (reported_by)
        REFERENCES app_internal.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE league_message_reports
      ADD CONSTRAINT league_message_reports_reviewer_fk
        FOREIGN KEY (reviewed_by)
        REFERENCES app_internal.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
  `);

  await db.execute(
    `CREATE INDEX league_message_reports_message_idx ON league_message_reports(message_id);`,
  );
  await db.execute(
    `CREATE INDEX league_message_reports_status_idx ON league_message_reports(status);`,
  );
  await db.execute(
    `CREATE INDEX league_message_reports_reported_by_idx ON league_message_reports(reported_by);`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(
    `DROP INDEX IF EXISTS league_message_reports_reported_by_idx;`,
  );
  await db.execute(`DROP INDEX IF EXISTS league_message_reports_status_idx;`);
  await db.execute(`DROP INDEX IF EXISTS league_message_reports_message_idx;`);
  await db.execute(`DROP TABLE IF EXISTS league_message_reports;`);
};

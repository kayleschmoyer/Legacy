/**
 * Migration: Add public.mock_draft_usage ledger (LS-10483)
 *
 * The free-tier weekly mock-draft cap counted live `drafts` rows
 * (kind = 'mock', created_by = user, last 7 days). Deleting a draft —
 * `deleteMockDraft` / `deleteMyMockDrafts`, both callable by any signed-in
 * user — therefore refunded quota. Owner decision (LS-10455): every mock draft
 * counts at creation, so the count must not be reversible by the user.
 *
 * Changes:
 * - Creates public.mock_draft_usage: one append-only row per mock draft
 *   created. draft_id is deliberately NOT a foreign key, so deleting the draft
 *   leaves its usage row behind. Rows cascade only when the user is deleted.
 * - Index on (user_id, created_at) for the rolling-window count.
 * - AFTER INSERT trigger on drafts records a usage row for every mock draft,
 *   whichever writer inserts it (so lambdas deployed before the reader switch
 *   are still counted).
 * - Backfills a row for every existing mock draft (guarded, re-runnable).
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

const RECORD_USAGE_FN = `
  CREATE OR REPLACE FUNCTION drafts_record_mock_usage()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.kind = 'mock' THEN
      INSERT INTO mock_draft_usage (user_id, draft_id, created_at)
      VALUES (NEW.created_by, NEW.id, NEW.created_at);
    END IF;
    RETURN NULL;
  END;
  $fn$;
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.mock_draft_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      draft_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS mock_draft_usage_user_id_created_at_idx
      ON public.mock_draft_usage(user_id, created_at);
  `);

  await db.execute(RECORD_USAGE_FN);
  await db.execute(
    `DROP TRIGGER IF EXISTS drafts_record_mock_usage_trigger ON drafts;`,
  );
  await db.execute(`
    CREATE TRIGGER drafts_record_mock_usage_trigger
      AFTER INSERT ON drafts
      FOR EACH ROW EXECUTE FUNCTION drafts_record_mock_usage();
  `);

  await db.execute(`
    INSERT INTO public.mock_draft_usage (user_id, draft_id, created_at)
    SELECT d.created_by, d.id, d.created_at
    FROM drafts d
    WHERE d.kind = 'mock'
      AND NOT EXISTS (
        SELECT 1 FROM public.mock_draft_usage u WHERE u.draft_id = d.id
      );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS drafts_record_mock_usage_trigger ON drafts;
    DROP FUNCTION IF EXISTS drafts_record_mock_usage();
    DROP TABLE IF EXISTS public.mock_draft_usage;
  `);
};

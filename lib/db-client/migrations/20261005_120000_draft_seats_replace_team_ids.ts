/**
 * Migration: Auction writers stop writing team ids (LS-10080)
 * Created: 2026-10-05
 * Ticket: LS-10080 (slice 8 of 8, epic LS-9252 "Draft-First Mock Drafts")
 *
 * The draft-first contract is split so it never breaks a deployed lambda:
 * LS-10080 moves every reader and writer onto draft_participants, and a
 * follow-up migration drops the legacy schema (draft_teams, the leagues
 * mock-draft columns, the auction/queue team-id columns) once that code is
 * deployed.
 *
 * This half is additive, so lambdas built before and after LS-10080 both run
 * against it:
 *
 *   1. auction_budgets.team_id and auction_state.nominator_team_id become
 *      nullable. The new auction writers name the seat (participant_id) only.
 *      The LS-10073 fill triggers still resolve participant_id for writers
 *      that send a team id.
 *   2. auction_budgets gains UNIQUE (draft_id, participant_id), the conflict
 *      target the keeper-cost seeding now upserts on.
 *
 * draft_queue.team_id already went nullable in LS-10076.
 *
 * Re-runnable: DROP NOT NULL is idempotent and the constraint add is guarded.
 */

interface MigrationDb {
  execute: (query: string) => Promise<unknown>;
}

export const up = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(
    `ALTER TABLE public.auction_budgets ALTER COLUMN team_id DROP NOT NULL;`,
  );
  await db.execute(
    `ALTER TABLE public.auction_state ALTER COLUMN nominator_team_id DROP NOT NULL;`,
  );
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'auction_budgets_uk_draft_participant'
          AND conrelid = 'public.auction_budgets'::regclass
      ) THEN
        ALTER TABLE public.auction_budgets
          ADD CONSTRAINT auction_budgets_uk_draft_participant
          UNIQUE (draft_id, participant_id);
      END IF;
    END $$;
  `);
};

export const down = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`
    ALTER TABLE public.auction_budgets
      DROP CONSTRAINT IF EXISTS auction_budgets_uk_draft_participant;
  `);
  // Rows written by seat alone get their team back from the seat before the
  // columns are re-required.
  await db.execute(`
    UPDATE public.auction_budgets a
    SET team_id = p.team_id
    FROM public.draft_participants p
    WHERE p.id = a.participant_id AND a.team_id IS NULL;
  `);
  await db.execute(`
    UPDATE public.auction_state s
    SET nominator_team_id = p.team_id
    FROM public.draft_participants p
    WHERE p.id = s.nominator_participant_id AND s.nominator_team_id IS NULL;
  `);
  await db.execute(
    `ALTER TABLE public.auction_budgets ALTER COLUMN team_id SET NOT NULL;`,
  );
  await db.execute(
    `ALTER TABLE public.auction_state ALTER COLUMN nominator_team_id SET NOT NULL;`,
  );
};

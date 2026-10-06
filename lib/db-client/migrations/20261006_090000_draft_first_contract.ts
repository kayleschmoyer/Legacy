/**
 * Migration: Draft-first contract drops (LS-10592)
 * Created: 2026-10-05
 * Ticket: LS-10592 (contract drops for LS-10080, slice 8 of 8, epic LS-9252 "Draft-First Mock Drafts")
 *
 * Drops what the draft-first expand (LS-10073) kept only so already-deployed
 * lambdas could keep working. Every writer now speaks draft_participants
 * (LS-10074, LS-10076, LS-10080), so:
 *
 *   1. leagues.is_mock_draft / is_offline_draft / control_all_teams and
 *      idx_leagues_owner_created_at_mock go. LS-10076 already deleted every
 *      mock-draft league; the guarded delete here only re-checks that, so the
 *      column drop can never strand one.
 *   2. draft_teams goes, with its LS-10073 bridge trigger and the functions
 *      only that bridge used. draft_participant_id_for_team stays (the
 *      draft_picks fill trigger still calls it) but no longer seats teams from
 *      draft_teams.
 *   3. draft_queue.team_id, auction_budgets.team_id and auction_state's
 *      nominator_team_id / current_bidder_team_id go: participant ids replace
 *      them, and become NOT NULL. Their fill triggers go too. Seat-keyed
 *      unique constraints replace the team-keyed ones (and LS-10076's partial
 *      seat indexes, which depend on team_id and drop with it).
 *
 * draft_picks keeps team_id (roster and pick-history readers join on it) and
 * its fill trigger.
 *
 * ── Irreversible ───────────────────────────────────────────────────────────
 * The dropped columns and draft_teams rows are not recoverable. `down`
 * rebuilds the structures and backfills team ids from draft_participants, but
 * not the bridge triggers: nothing writes the restored columns any more.
 *
 * ── Re-runnable ────────────────────────────────────────────────────────────
 * The runner is autocommit-per-statement, so every step is guarded
 * (IF EXISTS / IF NOT EXISTS / pg_constraint checks).
 */

interface MigrationDb {
  execute: (query: string) => Promise<unknown>;
}

/** ADD CONSTRAINT guarded on pg_constraint, since Postgres has no IF NOT EXISTS for it. */
const addConstraint = (table: string, name: string, definition: string) => `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = '${name}' AND conrelid = '${table}'::regclass
    ) THEN
      ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition};
    END IF;
  END $$;
`;

/** draft_participant_id_for_team without the draft_teams seating fallback. */
const PARTICIPANT_FOR_TEAM_FN = `
  CREATE OR REPLACE FUNCTION draft_participant_id_for_team(
    p_draft_id integer, p_team_id integer
  ) RETURNS integer
  LANGUAGE sql STABLE AS $fn$
    SELECT id FROM draft_participants
    WHERE draft_id = p_draft_id AND team_id = p_team_id;
  $fn$;
`;

export const up = async ({ db }: { db: MigrationDb }): Promise<void> => {
  // ── 1. leagues mock-draft columns ────────────────────────────────────────
  // LS-10076 deleted every mock-draft league; re-check before the flag that
  // identifies them disappears. Scoring-profile copy pointers into them are
  // cleared first, as in deleteLeaguesAtomically (LS-8125).
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'is_mock_draft'
      ) THEN
        UPDATE public.league_scoring_profiles
        SET copied_from_profile_id = NULL
        WHERE copied_from_profile_id IN (
          SELECT p.id
          FROM public.league_scoring_profiles p
          JOIN public.leagues l ON l.id = p.league_id
          WHERE l.is_mock_draft = true
        );
        DELETE FROM public.leagues WHERE is_mock_draft = true;
      END IF;
    END $$;
  `);
  await db.execute(
    `DROP INDEX IF EXISTS public.idx_leagues_owner_created_at_mock;`,
  );
  await db.execute(`
    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS is_mock_draft,
      DROP COLUMN IF EXISTS is_offline_draft,
      DROP COLUMN IF EXISTS control_all_teams;
  `);

  // ── 2. draft_teams and its bridge ────────────────────────────────────────
  await db.execute(PARTICIPANT_FOR_TEAM_FN);
  await db.execute(`DROP TABLE IF EXISTS public.draft_teams;`);
  await db.execute(
    `DROP FUNCTION IF EXISTS draft_teams_reconcile_participants();`,
  );
  await db.execute(
    `DROP FUNCTION IF EXISTS draft_participants_reconcile(integer);`,
  );
  await db.execute(
    `DROP FUNCTION IF EXISTS draft_participants_seat_missing(integer);`,
  );
  await db.execute(
    `DROP FUNCTION IF EXISTS draft_seat_controller(integer, integer, boolean);`,
  );

  // ── 3a. draft_queue ──────────────────────────────────────────────────────
  await db.execute(
    `DROP TRIGGER IF EXISTS draft_queue_fill_participant_id_trigger ON public.draft_queue;`,
  );
  await db.execute(
    `ALTER TABLE public.draft_queue ALTER COLUMN participant_id SET NOT NULL;`,
  );
  await db.execute(
    `ALTER TABLE public.draft_queue DROP COLUMN IF EXISTS team_id;`,
  );
  await db.execute(
    addConstraint(
      'public.draft_queue',
      'draft_queue_uk_draft_participant_player',
      'UNIQUE (draft_id, participant_id, player_id)',
    ),
  );
  await db.execute(
    addConstraint(
      'public.draft_queue',
      'draft_queue_uk_draft_participant_priority',
      'UNIQUE (draft_id, participant_id, priority)',
    ),
  );

  // ── 3b. auction_budgets ──────────────────────────────────────────────────
  await db.execute(
    `DROP TRIGGER IF EXISTS auction_budgets_fill_participant_id_trigger ON public.auction_budgets;`,
  );
  await db.execute(
    `ALTER TABLE public.auction_budgets ALTER COLUMN participant_id SET NOT NULL;`,
  );
  await db.execute(
    `ALTER TABLE public.auction_budgets DROP COLUMN IF EXISTS team_id;`,
  );
  await db.execute(
    addConstraint(
      'public.auction_budgets',
      'auction_budgets_uk_draft_participant',
      'UNIQUE (draft_id, participant_id)',
    ),
  );

  // ── 3c. auction_state ────────────────────────────────────────────────────
  await db.execute(
    `DROP TRIGGER IF EXISTS auction_state_fill_participant_ids_trigger ON public.auction_state;`,
  );
  await db.execute(
    `DROP FUNCTION IF EXISTS auction_state_fill_participant_ids();`,
  );
  await db.execute(
    `ALTER TABLE public.auction_state ALTER COLUMN nominator_participant_id SET NOT NULL;`,
  );
  // SET NULL cannot apply to a NOT NULL column: the ephemeral auction row goes
  // with its nominator's seat instead.
  await db.execute(`
    ALTER TABLE public.auction_state
      DROP CONSTRAINT IF EXISTS auction_state_nominator_participant_id_fk;
  `);
  await db.execute(
    addConstraint(
      'public.auction_state',
      'auction_state_nominator_participant_id_fk',
      'FOREIGN KEY (nominator_participant_id) REFERENCES draft_participants(id) ON DELETE CASCADE',
    ),
  );
  await db.execute(`
    ALTER TABLE public.auction_state
      DROP COLUMN IF EXISTS nominator_team_id,
      DROP COLUMN IF EXISTS current_bidder_team_id;
  `);
};

export const down = async ({ db }: { db: MigrationDb }): Promise<void> => {
  // ── 3c. auction_state ────────────────────────────────────────────────────
  await db.execute(`
    ALTER TABLE public.auction_state
      ADD COLUMN IF NOT EXISTS nominator_team_id integer,
      ADD COLUMN IF NOT EXISTS current_bidder_team_id integer;
  `);
  await db.execute(`
    UPDATE public.auction_state s
    SET nominator_team_id = n.team_id
    FROM public.draft_participants n
    WHERE n.id = s.nominator_participant_id;
  `);
  await db.execute(`
    UPDATE public.auction_state s
    SET current_bidder_team_id = b.team_id
    FROM public.draft_participants b
    WHERE b.id = s.current_bidder_participant_id;
  `);
  await db.execute(`
    ALTER TABLE public.auction_state
      DROP CONSTRAINT IF EXISTS auction_state_nominator_participant_id_fk;
  `);
  await db.execute(
    addConstraint(
      'public.auction_state',
      'auction_state_nominator_participant_id_fk',
      'FOREIGN KEY (nominator_participant_id) REFERENCES draft_participants(id) ON DELETE SET NULL',
    ),
  );
  await db.execute(
    `ALTER TABLE public.auction_state ALTER COLUMN nominator_participant_id DROP NOT NULL;`,
  );

  // ── 3b. auction_budgets ──────────────────────────────────────────────────
  await db.execute(
    `ALTER TABLE public.auction_budgets DROP CONSTRAINT IF EXISTS auction_budgets_uk_draft_participant;`,
  );
  await db.execute(
    `ALTER TABLE public.auction_budgets ADD COLUMN IF NOT EXISTS team_id integer;`,
  );
  await db.execute(`
    UPDATE public.auction_budgets a
    SET team_id = p.team_id
    FROM public.draft_participants p
    WHERE p.id = a.participant_id AND a.team_id IS NULL;
  `);
  await db.execute(
    `ALTER TABLE public.auction_budgets ALTER COLUMN participant_id DROP NOT NULL;`,
  );

  // ── 3a. draft_queue ──────────────────────────────────────────────────────
  await db.execute(
    `ALTER TABLE public.draft_queue DROP CONSTRAINT IF EXISTS draft_queue_uk_draft_participant_priority;`,
  );
  await db.execute(
    `ALTER TABLE public.draft_queue DROP CONSTRAINT IF EXISTS draft_queue_uk_draft_participant_player;`,
  );
  await db.execute(
    `ALTER TABLE public.draft_queue ADD COLUMN IF NOT EXISTS team_id integer;`,
  );
  await db.execute(`
    UPDATE public.draft_queue q
    SET team_id = p.team_id
    FROM public.draft_participants p
    WHERE p.id = q.participant_id AND q.team_id IS NULL;
  `);
  await db.execute(
    `ALTER TABLE public.draft_queue ALTER COLUMN participant_id DROP NOT NULL;`,
  );

  // ── 2. draft_teams (structure + league seats; no bridge trigger) ─────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.draft_teams (
      draft_id integer NOT NULL,
      team_id integer NOT NULL,
      league_id integer NOT NULL,
      draft_order integer NOT NULL,
      auto_pick boolean NOT NULL DEFAULT false,
      CONSTRAINT draft_teams_pk PRIMARY KEY (draft_id, team_id, league_id),
      CONSTRAINT draft_teams_uk_order UNIQUE (draft_id, draft_order),
      CONSTRAINT draft_teams_drafts_id_fk FOREIGN KEY (draft_id)
        REFERENCES public.drafts(id) ON DELETE CASCADE,
      CONSTRAINT draft_teams_teams_id_league_id_fk FOREIGN KEY (team_id, league_id)
        REFERENCES public.teams(id, league_id)
    );
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS draft_teams_draft_id_idx ON public.draft_teams(draft_id);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS draft_teams_team_id_league_id_idx ON public.draft_teams(team_id, league_id);`,
  );
  await db.execute(`
    INSERT INTO public.draft_teams (draft_id, team_id, league_id, draft_order, auto_pick)
    SELECT draft_id, team_id, league_id, slot, auto_pick
    FROM public.draft_participants
    WHERE team_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  // ── 1. leagues mock-draft columns (the deleted leagues stay deleted) ─────
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS is_mock_draft boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_offline_draft boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS control_all_teams boolean NOT NULL DEFAULT false;
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_leagues_owner_created_at_mock
      ON public.leagues (owner, created_at)
      WHERE is_mock_draft = true;
  `);
};

/**
 * Migration: Draft-first schema expand + backfill (LS-10073)
 * Created: 2026-09-11
 * Ticket: LS-10073 (slice 1 of 8, epic LS-9252 "Draft-First Mock Drafts")
 *
 * Makes `drafts` the aggregate root so a later slice can create mock drafts
 * without a leagues/teams/league_members graph. Purely additive — no reader
 * or writer switches here (that is LS-10074):
 *
 *   - drafts gains kind / status / created_by / sport / mock-draft columns and
 *     league_id becomes nullable (CHECK: only mock drafts may omit it).
 *   - draft_participants: one seat per draft slot, for both draft kinds.
 *   - mock_draft_settings, invitations, draft_messages: new, unused until
 *     later slices.
 *   - draft_picks / draft_queue / auction_budgets / auction_state reference
 *     the seat via participant_id; team_id columns stay for now.
 *
 * ── Bridge triggers ────────────────────────────────────────────────────────
 * The currently deployed lambdas know nothing about these columns, but
 * drafts.status/created_by/sport and draft_picks.participant_id become
 * NOT NULL. Four triggers keep the old writers working and the new columns
 * correct until LS-10074 moves the writers over:
 *   1. drafts BEFORE INSERT fills status/created_by/sport from the league.
 *   2. leagues AFTER UPDATE OF draft_status mirrors it onto drafts.status.
 *   3. draft_teams (deferred, commit-time) reconciles draft_participants to
 *      the final draft_teams state — delete+reinsert reorders and sentinel
 *      slot swaps net out, so seat ids (and the rows that reference them)
 *      survive.
 *   4. draft_picks / draft_queue / auction_budgets / auction_state BEFORE
 *      INSERT/UPDATE resolve participant_id from (draft_id, team_id).
 *
 * ── Re-runnable ────────────────────────────────────────────────────────────
 * The runner is autocommit-per-statement, so every step is guarded
 * (IF NOT EXISTS / CREATE OR REPLACE / NOT EXISTS backfills) and the backfill
 * plus its NOT NULL flips run in one DO block, which commits atomically.
 * Shared-lobby mock drafts (teams but no draft_teams yet, LS-9181) are seated
 * from their teams rows, ordered by team id — the order they were created in.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

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

/** Controller for a league seat: AI only when nobody manages the team and it auto-picks. */
const SEAT_CONTROLLER_FN = `
  CREATE OR REPLACE FUNCTION draft_seat_controller(
    p_league_id integer, p_team_id integer, p_auto_pick boolean
  ) RETURNS draft_participant_controller
  LANGUAGE sql STABLE AS $fn$
    SELECT CASE
      WHEN p_auto_pick AND NOT EXISTS (
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id AND lm.team_id = p_team_id
      ) THEN 'ai'::draft_participant_controller
      ELSE 'user'::draft_participant_controller
    END;
  $fn$;
`;

/** Insert a seat for every draft_teams row of the draft that has none (never updates or deletes). */
const SEAT_MISSING_FN = `
  CREATE OR REPLACE FUNCTION draft_participants_seat_missing(p_draft_id integer)
  RETURNS void
  LANGUAGE sql AS $fn$
    INSERT INTO draft_participants
      (draft_id, slot, team_id, league_id, controller, seat_name, auto_pick)
    SELECT dt.draft_id, dt.draft_order, dt.team_id, dt.league_id,
           draft_seat_controller(dt.league_id, dt.team_id, dt.auto_pick),
           left(t.name, 40), dt.auto_pick
    FROM draft_teams dt
    JOIN teams t ON t.id = dt.team_id
    WHERE dt.draft_id = p_draft_id
      AND NOT EXISTS (
        SELECT 1 FROM draft_participants p
        WHERE p.draft_id = dt.draft_id AND p.team_id = dt.team_id
      );
  $fn$;
`;

/**
 * Make the draft's seats match draft_teams exactly. Drafts with no draft_teams
 * (unstarted shared lobbies) keep their teams-seeded seats. A seat that
 * already has picks is never deleted — a slot collision error is preferable
 * to cascading picks away.
 */
const RECONCILE_FN = `
  CREATE OR REPLACE FUNCTION draft_participants_reconcile(p_draft_id integer)
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM draft_teams WHERE draft_id = p_draft_id) THEN
      RETURN;
    END IF;

    DELETE FROM draft_participants p
    WHERE p.draft_id = p_draft_id
      AND NOT EXISTS (
        SELECT 1 FROM draft_teams dt
        WHERE dt.draft_id = p.draft_id AND dt.team_id = p.team_id
      )
      AND NOT EXISTS (SELECT 1 FROM draft_picks dp WHERE dp.participant_id = p.id);

    UPDATE draft_participants p
    SET slot = dt.draft_order,
        auto_pick = dt.auto_pick,
        controller = draft_seat_controller(dt.league_id, dt.team_id, dt.auto_pick)
    FROM draft_teams dt
    WHERE p.draft_id = p_draft_id
      AND dt.draft_id = p.draft_id
      AND dt.team_id = p.team_id
      AND (p.slot, p.auto_pick, p.controller) IS DISTINCT FROM (
        dt.draft_order, dt.auto_pick,
        draft_seat_controller(dt.league_id, dt.team_id, dt.auto_pick)
      );

    PERFORM draft_participants_seat_missing(p_draft_id);
  END;
  $fn$;
`;

const DRAFT_TEAMS_TRIGGER_FN = `
  CREATE OR REPLACE FUNCTION draft_teams_reconcile_participants()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM draft_participants_reconcile(NEW.draft_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
      PERFORM draft_participants_reconcile(OLD.draft_id);
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.draft_id IS DISTINCT FROM NEW.draft_id THEN
        PERFORM draft_participants_reconcile(OLD.draft_id);
      END IF;
    END IF;
    RETURN NULL;
  END;
  $fn$;
`;

/** Seat id for (draft, team), seating the team first if its draft_teams row has no seat yet. */
const PARTICIPANT_FOR_TEAM_FN = `
  CREATE OR REPLACE FUNCTION draft_participant_id_for_team(
    p_draft_id integer, p_team_id integer
  ) RETURNS integer
  LANGUAGE plpgsql AS $fn$
  DECLARE
    v_id integer;
  BEGIN
    IF p_draft_id IS NULL OR p_team_id IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT id INTO v_id FROM draft_participants
    WHERE draft_id = p_draft_id AND team_id = p_team_id;
    IF v_id IS NULL THEN
      PERFORM draft_participants_seat_missing(p_draft_id);
      SELECT id INTO v_id FROM draft_participants
      WHERE draft_id = p_draft_id AND team_id = p_team_id;
    END IF;
    RETURN v_id;
  END;
  $fn$;
`;

/** Shared by draft_picks, draft_queue and auction_budgets (same column names). */
const SEAT_FILL_FN = `
  CREATE OR REPLACE FUNCTION draft_seat_fill_participant_id()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.participant_id IS NULL THEN
        NEW.participant_id := draft_participant_id_for_team(NEW.draft_id, NEW.team_id);
      END IF;
    ELSIF (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.draft_id IS DISTINCT FROM OLD.draft_id)
      AND NEW.participant_id IS NOT DISTINCT FROM OLD.participant_id THEN
      NEW.participant_id := draft_participant_id_for_team(NEW.draft_id, NEW.team_id);
    END IF;
    RETURN NEW;
  END;
  $fn$;
`;

const AUCTION_STATE_FILL_FN = `
  CREATE OR REPLACE FUNCTION auction_state_fill_participant_ids()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.nominator_participant_id IS NULL THEN
        NEW.nominator_participant_id :=
          draft_participant_id_for_team(NEW.draft_id, NEW.nominator_team_id);
      END IF;
      IF NEW.current_bidder_participant_id IS NULL THEN
        NEW.current_bidder_participant_id :=
          draft_participant_id_for_team(NEW.draft_id, NEW.current_bidder_team_id);
      END IF;
    ELSE
      IF (NEW.nominator_team_id IS DISTINCT FROM OLD.nominator_team_id
          OR NEW.draft_id IS DISTINCT FROM OLD.draft_id)
        AND NEW.nominator_participant_id IS NOT DISTINCT FROM OLD.nominator_participant_id THEN
        NEW.nominator_participant_id :=
          draft_participant_id_for_team(NEW.draft_id, NEW.nominator_team_id);
      END IF;
      IF (NEW.current_bidder_team_id IS DISTINCT FROM OLD.current_bidder_team_id
          OR NEW.draft_id IS DISTINCT FROM OLD.draft_id)
        AND NEW.current_bidder_participant_id IS NOT DISTINCT FROM OLD.current_bidder_participant_id THEN
        NEW.current_bidder_participant_id :=
          draft_participant_id_for_team(NEW.draft_id, NEW.current_bidder_team_id);
      END IF;
    END IF;
    RETURN NEW;
  END;
  $fn$;
`;

const DRAFTS_FILL_FN = `
  CREATE OR REPLACE FUNCTION drafts_fill_from_league()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.league_id IS NOT NULL
      AND (NEW.status IS NULL OR NEW.created_by IS NULL OR NEW.sport IS NULL) THEN
      SELECT COALESCE(NEW.status, l.draft_status),
             COALESCE(NEW.created_by, l.owner),
             COALESCE(NEW.sport, l.sport)
      INTO NEW.status, NEW.created_by, NEW.sport
      FROM leagues l
      WHERE l.id = NEW.league_id;
    END IF;
    RETURN NEW;
  END;
  $fn$;
`;

const LEAGUE_STATUS_SYNC_FN = `
  CREATE OR REPLACE FUNCTION leagues_sync_draft_status()
  RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    UPDATE drafts
    SET status = NEW.draft_status
    WHERE league_id = NEW.id AND status IS DISTINCT FROM NEW.draft_status;
    RETURN NULL;
  END;
  $fn$;
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // ── 1. Enums ──────────────────────────────────────────────────────────────
  await db.execute(`
    DO $$
    BEGIN
      IF to_regtype('public.draft_kind') IS NULL THEN
        CREATE TYPE draft_kind AS ENUM ('league', 'mock');
      END IF;
      IF to_regtype('public.mock_draft_mode') IS NULL THEN
        CREATE TYPE mock_draft_mode AS ENUM ('offline', 'online');
      END IF;
      IF to_regtype('public.draft_participant_controller') IS NULL THEN
        CREATE TYPE draft_participant_controller AS ENUM ('user', 'ai', 'open');
      END IF;
      IF to_regtype('public.invitation_status') IS NULL THEN
        CREATE TYPE invitation_status AS ENUM
          ('pending', 'accepted', 'declined', 'revoked', 'expired');
      END IF;
    END $$;
  `);

  // ── 2. drafts columns (NOT NULL flips happen after the backfill) ─────────
  await db.execute(`
    ALTER TABLE drafts
      ADD COLUMN IF NOT EXISTS kind draft_kind DEFAULT 'league' NOT NULL,
      ADD COLUMN IF NOT EXISTS status draft_status,
      ADD COLUMN IF NOT EXISTS created_by integer,
      ADD COLUMN IF NOT EXISTS sport sport_kind,
      ADD COLUMN IF NOT EXISTS mock_mode mock_draft_mode,
      ADD COLUMN IF NOT EXISTS control_all_teams boolean DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS invite_code varchar(8),
      ADD COLUMN IF NOT EXISTS lobby_expires_at timestamp with time zone;
  `);
  await db.execute(`ALTER TABLE drafts ALTER COLUMN league_id DROP NOT NULL;`);

  // ── 3. New tables ─────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS draft_participants (
      id serial PRIMARY KEY NOT NULL,
      draft_id integer NOT NULL,
      slot integer NOT NULL,
      team_id integer,
      league_id integer,
      user_id integer,
      controller draft_participant_controller NOT NULL,
      seat_name varchar(40) NOT NULL,
      auto_pick boolean DEFAULT false NOT NULL,
      joined_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT draft_participants_drafts_id_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT draft_participants_teams_id_league_id_fk
        FOREIGN KEY (team_id, league_id) REFERENCES teams(id, league_id) ON DELETE CASCADE,
      CONSTRAINT draft_participants_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE SET NULL,
      CONSTRAINT draft_participants_uk_draft_slot
        UNIQUE (draft_id, slot) DEFERRABLE INITIALLY IMMEDIATE,
      CONSTRAINT draft_participants_uk_draft_team UNIQUE (draft_id, team_id),
      CONSTRAINT draft_participants_team_league_pair_ck
        CHECK ((team_id IS NULL) = (league_id IS NULL)),
      CONSTRAINT draft_participants_team_or_user_ck
        CHECK (team_id IS NULL OR user_id IS NULL),
      CONSTRAINT draft_participants_slot_positive_ck CHECK (slot >= 1)
    );
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_participants_user_id_idx
      ON draft_participants(user_id) WHERE user_id IS NOT NULL;
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_participants_team_id_league_id_idx
      ON draft_participants(team_id, league_id) WHERE team_id IS NOT NULL;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mock_draft_settings (
      draft_id integer PRIMARY KEY NOT NULL,
      player_pool player_pool DEFAULT 'all' NOT NULL,
      roster_size integer DEFAULT 25 NOT NULL,
      defensive_format varchar(10) DEFAULT 'idp' NOT NULL,
      era_filter era_filter DEFAULT 'all' NOT NULL,
      hof_only boolean DEFAULT false NOT NULL,
      custom_era_start_year integer,
      custom_era_end_year integer,
      min_career_games integer DEFAULT 0 NOT NULL,
      min_career_seasons integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT mock_draft_settings_drafts_id_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT mock_draft_settings_defensive_format_ck
        CHECK (defensive_format IN ('dst', 'idp')),
      CONSTRAINT mock_draft_settings_roster_size_ck CHECK (roster_size >= 1)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS invitations (
      id serial PRIMARY KEY NOT NULL,
      draft_id integer,
      league_id integer,
      invited_user_id integer NOT NULL,
      invited_by integer NOT NULL,
      status invitation_status DEFAULT 'pending' NOT NULL,
      reserved_slot integer,
      expires_at timestamp with time zone,
      responded_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT invitations_drafts_id_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT invitations_leagues_id_fk
        FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      CONSTRAINT invitations_invited_user_id_fk
        FOREIGN KEY (invited_user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE,
      CONSTRAINT invitations_invited_by_fk
        FOREIGN KEY (invited_by) REFERENCES app_internal.users(id) ON DELETE CASCADE,
      CONSTRAINT invitations_target_ck
        CHECK ((draft_id IS NULL) <> (league_id IS NULL)),
      CONSTRAINT invitations_reserved_slot_ck
        CHECK (reserved_slot IS NULL OR (draft_id IS NOT NULL AND reserved_slot >= 1))
    );
  `);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS invitations_uk_pending_draft_user
      ON invitations(draft_id, invited_user_id)
      WHERE status = 'pending' AND draft_id IS NOT NULL;
  `);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS invitations_uk_pending_league_user
      ON invitations(league_id, invited_user_id)
      WHERE status = 'pending' AND league_id IS NOT NULL;
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS invitations_invited_user_status_idx
      ON invitations(invited_user_id, status);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS draft_messages (
      id serial PRIMARY KEY NOT NULL,
      draft_id integer NOT NULL,
      user_id integer,
      message_text varchar NOT NULL,
      message_type varchar(50) DEFAULT 'text' NOT NULL,
      metadata jsonb,
      gif_url text,
      contains_profanity boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT draft_messages_drafts_id_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT draft_messages_user_id_fk
        FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE SET NULL
    );
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_messages_draft_id_created_at_idx
      ON draft_messages(draft_id, created_at);
  `);

  for (const table of ['draft_participants', 'mock_draft_settings']) {
    await db.execute(
      `DROP TRIGGER IF EXISTS ${table}_updated_at_trigger ON public."${table}";`,
    );
    await db.execute(`
      CREATE TRIGGER ${table}_updated_at_trigger
        BEFORE UPDATE ON public."${table}"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  // ── 4. Seat references ────────────────────────────────────────────────────
  await db.execute(
    `ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS participant_id integer;`,
  );
  await db.execute(`ALTER TABLE draft_picks ALTER COLUMN team_id DROP NOT NULL;`);
  await db.execute(
    `ALTER TABLE draft_queue ADD COLUMN IF NOT EXISTS participant_id integer;`,
  );
  await db.execute(
    `ALTER TABLE auction_budgets ADD COLUMN IF NOT EXISTS participant_id integer;`,
  );
  await db.execute(`
    ALTER TABLE auction_state
      ADD COLUMN IF NOT EXISTS nominator_participant_id integer,
      ADD COLUMN IF NOT EXISTS current_bidder_participant_id integer;
  `);
  for (const table of ['draft_picks', 'draft_queue', 'auction_budgets']) {
    await db.execute(
      addConstraint(
        table,
        `${table}_participant_id_fk`,
        'FOREIGN KEY (participant_id) REFERENCES draft_participants(id) ON DELETE CASCADE',
      ),
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS ${table}_participant_id_idx ON ${table}(participant_id);`,
    );
  }
  await db.execute(
    addConstraint(
      'auction_state',
      'auction_state_nominator_participant_id_fk',
      'FOREIGN KEY (nominator_participant_id) REFERENCES draft_participants(id) ON DELETE SET NULL',
    ),
  );
  await db.execute(
    addConstraint(
      'auction_state',
      'auction_state_current_bidder_participant_id_fk',
      'FOREIGN KEY (current_bidder_participant_id) REFERENCES draft_participants(id) ON DELETE SET NULL',
    ),
  );

  // ── 5. Bridge functions + triggers (before the backfill, so rows written
  //       by deployed lambdas mid-migration are covered too) ───────────────
  for (const fn of [
    SEAT_CONTROLLER_FN,
    SEAT_MISSING_FN,
    RECONCILE_FN,
    DRAFT_TEAMS_TRIGGER_FN,
    PARTICIPANT_FOR_TEAM_FN,
    SEAT_FILL_FN,
    AUCTION_STATE_FILL_FN,
    DRAFTS_FILL_FN,
    LEAGUE_STATUS_SYNC_FN,
  ]) {
    await db.execute(fn);
  }

  await db.execute(
    `DROP TRIGGER IF EXISTS drafts_fill_from_league_trigger ON drafts;`,
  );
  await db.execute(`
    CREATE TRIGGER drafts_fill_from_league_trigger
      BEFORE INSERT ON drafts
      FOR EACH ROW EXECUTE FUNCTION drafts_fill_from_league();
  `);

  await db.execute(
    `DROP TRIGGER IF EXISTS leagues_sync_draft_status_trigger ON leagues;`,
  );
  await db.execute(`
    CREATE TRIGGER leagues_sync_draft_status_trigger
      AFTER UPDATE OF draft_status ON leagues
      FOR EACH ROW
      WHEN (OLD.draft_status IS DISTINCT FROM NEW.draft_status)
      EXECUTE FUNCTION leagues_sync_draft_status();
  `);

  await db.execute(
    `DROP TRIGGER IF EXISTS draft_teams_reconcile_participants_trigger ON draft_teams;`,
  );
  await db.execute(`
    CREATE CONSTRAINT TRIGGER draft_teams_reconcile_participants_trigger
      AFTER INSERT OR UPDATE OR DELETE ON draft_teams
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION draft_teams_reconcile_participants();
  `);

  for (const table of ['draft_picks', 'draft_queue', 'auction_budgets']) {
    await db.execute(
      `DROP TRIGGER IF EXISTS ${table}_fill_participant_id_trigger ON ${table};`,
    );
    await db.execute(`
      CREATE TRIGGER ${table}_fill_participant_id_trigger
        BEFORE INSERT OR UPDATE OF team_id, draft_id ON ${table}
        FOR EACH ROW EXECUTE FUNCTION draft_seat_fill_participant_id();
    `);
  }
  await db.execute(
    `DROP TRIGGER IF EXISTS auction_state_fill_participant_ids_trigger ON auction_state;`,
  );
  await db.execute(`
    CREATE TRIGGER auction_state_fill_participant_ids_trigger
      BEFORE INSERT OR UPDATE OF nominator_team_id, current_bidder_team_id, draft_id
      ON auction_state
      FOR EACH ROW EXECUTE FUNCTION auction_state_fill_participant_ids();
  `);

  // ── 6. Backfill + NOT NULL flips — one DO block, so it commits atomically ─
  await db.execute(`
    DO $$
    DECLARE
      r record;
    BEGIN
      UPDATE drafts d
      SET status = l.draft_status,
          created_by = COALESCE(d.created_by, l.owner),
          sport = COALESCE(d.sport, l.sport)
      FROM leagues l
      WHERE l.id = d.league_id
        AND (d.status IS DISTINCT FROM l.draft_status
             OR d.created_by IS NULL
             OR d.sport IS NULL);

      ALTER TABLE drafts
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN created_by SET NOT NULL,
        ALTER COLUMN sport SET NOT NULL;

      -- One seat per draft_teams row.
      FOR r IN SELECT DISTINCT draft_id FROM draft_teams LOOP
        PERFORM draft_participants_reconcile(r.draft_id);
      END LOOP;

      -- Shared-lobby mock drafts (LS-9181): teams exist, draft_teams do not
      -- until the host starts the draft. Claimed teams are user seats, the
      -- rest are open.
      INSERT INTO draft_participants
        (draft_id, slot, team_id, league_id, controller, seat_name, auto_pick, joined_at)
      SELECT d.id,
             row_number() OVER (PARTITION BY d.id ORDER BY t.id),
             t.id,
             t.league_id,
             CASE WHEN m.joined_at IS NOT NULL
               THEN 'user'::draft_participant_controller
               ELSE 'open'::draft_participant_controller
             END,
             left(t.name, 40),
             false,
             m.joined_at
      FROM drafts d
      JOIN leagues l ON l.id = d.league_id AND l.is_mock_draft
      JOIN teams t ON t.league_id = l.id
      LEFT JOIN LATERAL (
        SELECT min(lm.created_at) AS joined_at
        FROM league_members lm
        WHERE lm.league_id = t.league_id AND lm.team_id = t.id
      ) m ON true
      WHERE NOT EXISTS (SELECT 1 FROM draft_teams dt WHERE dt.draft_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM draft_participants p WHERE p.draft_id = d.id);

      UPDATE draft_picks x SET participant_id = p.id
      FROM draft_participants p
      WHERE x.participant_id IS NULL
        AND p.draft_id = x.draft_id AND p.team_id = x.team_id;

      UPDATE draft_queue x SET participant_id = p.id
      FROM draft_participants p
      WHERE x.participant_id IS NULL
        AND p.draft_id = x.draft_id AND p.team_id = x.team_id;

      UPDATE auction_budgets x SET participant_id = p.id
      FROM draft_participants p
      WHERE x.participant_id IS NULL
        AND p.draft_id = x.draft_id AND p.team_id = x.team_id;

      UPDATE auction_state x SET nominator_participant_id = p.id
      FROM draft_participants p
      WHERE x.nominator_participant_id IS NULL
        AND p.draft_id = x.draft_id AND p.team_id = x.nominator_team_id;

      UPDATE auction_state x SET current_bidder_participant_id = p.id
      FROM draft_participants p
      WHERE x.current_bidder_participant_id IS NULL
        AND p.draft_id = x.draft_id AND p.team_id = x.current_bidder_team_id;

      ALTER TABLE draft_picks ALTER COLUMN participant_id SET NOT NULL;
    END $$;
  `);

  // ── 7. drafts constraints + indexes ───────────────────────────────────────
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_created_by_fk',
      'FOREIGN KEY (created_by) REFERENCES app_internal.users(id)',
    ),
  );
  await db.execute(
    addConstraint('drafts', 'drafts_uk_invite_code', 'UNIQUE (invite_code)'),
  );
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_kind_league_ck',
      "CHECK ((kind = 'league') = (league_id IS NOT NULL))",
    ),
  );
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_mock_mode_ck',
      "CHECK ((kind = 'mock') = (mock_mode IS NOT NULL))",
    ),
  );
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_control_all_teams_ck',
      "CHECK (NOT control_all_teams OR mock_mode = 'offline')",
    ),
  );
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_is_public_ck',
      "CHECK (NOT is_public OR (kind = 'mock' AND mock_mode = 'online'))",
    ),
  );
  await db.execute(
    addConstraint(
      'drafts',
      'drafts_invite_code_mock_ck',
      "CHECK (invite_code IS NULL OR kind = 'mock')",
    ),
  );
  await db.execute(`
    CREATE INDEX IF NOT EXISTS drafts_mock_created_by_created_at_idx
      ON drafts(created_by, created_at) WHERE kind = 'mock';
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS drafts_public_mock_lobby_idx
      ON drafts(sport, created_at)
      WHERE kind = 'mock' AND is_public AND status = 'not-started';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(
    `DROP TRIGGER IF EXISTS auction_state_fill_participant_ids_trigger ON auction_state;`,
  );
  for (const table of ['draft_picks', 'draft_queue', 'auction_budgets']) {
    await db.execute(
      `DROP TRIGGER IF EXISTS ${table}_fill_participant_id_trigger ON ${table};`,
    );
  }
  await db.execute(
    `DROP TRIGGER IF EXISTS draft_teams_reconcile_participants_trigger ON draft_teams;`,
  );
  await db.execute(
    `DROP TRIGGER IF EXISTS leagues_sync_draft_status_trigger ON leagues;`,
  );
  await db.execute(
    `DROP TRIGGER IF EXISTS drafts_fill_from_league_trigger ON drafts;`,
  );
  for (const fn of [
    'auction_state_fill_participant_ids()',
    'draft_seat_fill_participant_id()',
    'draft_participant_id_for_team(integer, integer)',
    'draft_teams_reconcile_participants()',
    'draft_participants_reconcile(integer)',
    'draft_participants_seat_missing(integer)',
    'draft_seat_controller(integer, integer, boolean)',
    'leagues_sync_draft_status()',
    'drafts_fill_from_league()',
  ]) {
    await db.execute(`DROP FUNCTION IF EXISTS ${fn};`);
  }

  await db.execute(`
    ALTER TABLE auction_state
      DROP COLUMN IF EXISTS nominator_participant_id,
      DROP COLUMN IF EXISTS current_bidder_participant_id;
  `);
  await db.execute(
    `ALTER TABLE auction_budgets DROP COLUMN IF EXISTS participant_id;`,
  );
  await db.execute(
    `ALTER TABLE draft_queue DROP COLUMN IF EXISTS participant_id;`,
  );
  await db.execute(
    `ALTER TABLE draft_picks DROP COLUMN IF EXISTS participant_id;`,
  );
  // Fails once seat-only (mock) picks exist — roll forward instead.
  await db.execute(`ALTER TABLE draft_picks ALTER COLUMN team_id SET NOT NULL;`);

  await db.execute(`DROP TABLE IF EXISTS draft_messages;`);
  await db.execute(`DROP TABLE IF EXISTS invitations;`);
  await db.execute(`DROP TABLE IF EXISTS mock_draft_settings;`);
  await db.execute(`DROP TABLE IF EXISTS draft_participants;`);

  await db.execute(`DROP INDEX IF EXISTS drafts_public_mock_lobby_idx;`);
  await db.execute(`DROP INDEX IF EXISTS drafts_mock_created_by_created_at_idx;`);
  await db.execute(`
    ALTER TABLE drafts
      DROP CONSTRAINT IF EXISTS drafts_invite_code_mock_ck,
      DROP CONSTRAINT IF EXISTS drafts_is_public_ck,
      DROP CONSTRAINT IF EXISTS drafts_control_all_teams_ck,
      DROP CONSTRAINT IF EXISTS drafts_mock_mode_ck,
      DROP CONSTRAINT IF EXISTS drafts_kind_league_ck,
      DROP CONSTRAINT IF EXISTS drafts_uk_invite_code,
      DROP CONSTRAINT IF EXISTS drafts_created_by_fk;
  `);
  // Fails once league-less (mock) drafts exist — roll forward instead.
  await db.execute(`ALTER TABLE drafts ALTER COLUMN league_id SET NOT NULL;`);
  await db.execute(`
    ALTER TABLE drafts
      DROP COLUMN IF EXISTS lobby_expires_at,
      DROP COLUMN IF EXISTS invite_code,
      DROP COLUMN IF EXISTS is_public,
      DROP COLUMN IF EXISTS control_all_teams,
      DROP COLUMN IF EXISTS mock_mode,
      DROP COLUMN IF EXISTS sport,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS kind;
  `);

  await db.execute(`DROP TYPE IF EXISTS invitation_status;`);
  await db.execute(`DROP TYPE IF EXISTS draft_participant_controller;`);
  await db.execute(`DROP TYPE IF EXISTS mock_draft_mode;`);
  await db.execute(`DROP TYPE IF EXISTS draft_kind;`);
};

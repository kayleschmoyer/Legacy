import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260911_120000_draft_first_schema_expand';

/**
 * Migration test for LS-10073: draft-first schema expand + backfill.
 *
 * Statement-level assertions on the generated SQL. The constraints and bridge
 * triggers are exercised against a real Postgres in
 * lambdas/db/src/schema/drafts/draft-participants-bridge.db.spec.ts.
 */
describe('Migration — draft-first schema expand + backfill (LS-10073)', () => {
  const capture = async (
    fn: (args: { db: PgDatabase<any> }) => Promise<void>,
  ): Promise<string[]> => {
    const statements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        statements.push(String(stmt));
        return Promise.resolve();
      },
    };
    await fn({ db: mockDb as unknown as PgDatabase<any> });
    return statements;
  };
  const indexOf = (statements: string[], needle: string) =>
    statements.findIndex((s) => s.includes(needle));

  describe('up', () => {
    it('creates the four enums idempotently', async () => {
      const sql = (await capture(up)).join('\n');
      for (const type of [
        'draft_kind',
        'mock_draft_mode',
        'draft_participant_controller',
        'invitation_status',
      ]) {
        expect(sql).toContain(`to_regtype('public.${type}') IS NULL`);
      }
      expect(sql).toContain(
        "CREATE TYPE draft_kind AS ENUM ('league', 'mock')",
      );
      expect(sql).toContain(
        "('pending', 'accepted', 'declined', 'revoked', 'expired')",
      );
    });

    it('adds the drafts columns and makes league_id nullable', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        "ADD COLUMN IF NOT EXISTS kind draft_kind DEFAULT 'league' NOT NULL",
      );
      for (const col of [
        'status draft_status',
        'created_by integer',
        'sport sport_kind',
        'mock_mode mock_draft_mode',
        'control_all_teams boolean DEFAULT false NOT NULL',
        'is_public boolean DEFAULT false NOT NULL',
        'invite_code varchar(8)',
        'lobby_expires_at timestamp with time zone',
      ]) {
        expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
      }
      expect(sql).toContain(
        'ALTER TABLE drafts ALTER COLUMN league_id DROP NOT NULL',
      );
    });

    it('declares every drafts CHECK constraint', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        "CHECK ((kind = 'league') = (league_id IS NOT NULL))",
      );
      expect(sql).toContain(
        "CHECK ((kind = 'mock') = (mock_mode IS NOT NULL))",
      );
      expect(sql).toContain(
        "CHECK (NOT control_all_teams OR mock_mode = 'offline')",
      );
      expect(sql).toContain(
        "CHECK (NOT is_public OR (kind = 'mock' AND mock_mode = 'online'))",
      );
      expect(sql).toContain("CHECK (invite_code IS NULL OR kind = 'mock')");
    });

    it('guards every ADD CONSTRAINT on pg_constraint so the migration re-runs', async () => {
      const statements = await capture(up);
      const adds = statements.filter((s) => s.includes('ADD CONSTRAINT'));
      expect(adds.length).toBeGreaterThan(0);
      for (const s of adds) {
        expect(s).toContain('IF NOT EXISTS');
        expect(s).toContain('FROM pg_constraint');
      }
      for (const s of statements.filter((s) =>
        /CREATE (UNIQUE )?INDEX|CREATE TABLE/.test(s),
      )) {
        expect(s).toContain('IF NOT EXISTS');
      }
    });

    it('creates draft_participants with its seat CHECKs and keys', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS draft_participants');
      expect(sql).toContain(
        'UNIQUE (draft_id, slot) DEFERRABLE INITIALLY IMMEDIATE',
      );
      expect(sql).toContain(
        'FOREIGN KEY (team_id, league_id) REFERENCES teams(id, league_id) ON DELETE CASCADE',
      );
      expect(sql).toContain(
        'FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE SET NULL',
      );
      expect(sql).toContain('CHECK ((team_id IS NULL) = (league_id IS NULL))');
      expect(sql).toContain('CHECK (team_id IS NULL OR user_id IS NULL)');
      expect(sql).toContain('seat_name varchar(40) NOT NULL');
      expect(sql).toContain(
        'ON draft_participants(user_id) WHERE user_id IS NOT NULL',
      );
    });

    it('creates mock_draft_settings, invitations and draft_messages', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        "defensive_format varchar(10) DEFAULT 'idp' NOT NULL",
      );
      expect(sql).toContain('min_career_games integer DEFAULT 0 NOT NULL');
      expect(sql).toContain('min_career_seasons integer DEFAULT 0 NOT NULL');
      expect(sql).toContain(
        'CHECK ((draft_id IS NULL) <> (league_id IS NULL))',
      );
      expect(sql).toContain(
        "ON invitations(draft_id, invited_user_id)\n      WHERE status = 'pending'",
      );
      expect(sql).toContain(
        "ON invitations(league_id, invited_user_id)\n      WHERE status = 'pending'",
      );
      expect(sql).toContain('ON draft_messages(draft_id, created_at)');
    });

    it('adds seat references to picks, queue and auction tables', async () => {
      const sql = (await capture(up)).join('\n');
      for (const table of ['draft_picks', 'draft_queue', 'auction_budgets']) {
        expect(sql).toContain(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS participant_id integer`,
        );
        expect(sql).toContain(`${table}_participant_id_fk`);
      }
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS nominator_participant_id integer',
      );
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS current_bidder_participant_id integer',
      );
      expect(sql).toContain(
        'ALTER TABLE draft_picks ALTER COLUMN team_id DROP NOT NULL',
      );
    });

    it('installs the bridge triggers before the backfill runs', async () => {
      const statements = await capture(up);
      const backfill = indexOf(
        statements,
        'PERFORM draft_participants_reconcile(r.draft_id)',
      );
      expect(backfill).toBeGreaterThan(-1);
      for (const trigger of [
        'CREATE TRIGGER drafts_fill_from_league_trigger',
        'CREATE TRIGGER leagues_sync_draft_status_trigger',
        'CREATE CONSTRAINT TRIGGER draft_teams_reconcile_participants_trigger',
        'CREATE TRIGGER draft_picks_fill_participant_id_trigger',
        'CREATE TRIGGER draft_queue_fill_participant_id_trigger',
        'CREATE TRIGGER auction_budgets_fill_participant_id_trigger',
        'CREATE TRIGGER auction_state_fill_participant_ids_trigger',
      ]) {
        const at = indexOf(statements, trigger);
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeLessThan(backfill);
      }
      expect(
        statements[indexOf(statements, 'CREATE CONSTRAINT TRIGGER')],
      ).toContain('DEFERRABLE INITIALLY DEFERRED');
    });

    it('backfills and flips NOT NULL in one atomic statement', async () => {
      const statements = await capture(up);
      const block =
        statements[
          indexOf(
            statements,
            'PERFORM draft_participants_reconcile(r.draft_id)',
          )
        ];
      const order = [
        'UPDATE drafts d',
        'ALTER COLUMN status SET NOT NULL',
        'ALTER COLUMN created_by SET NOT NULL',
        'ALTER COLUMN sport SET NOT NULL',
        'PERFORM draft_participants_reconcile(r.draft_id)',
        'JOIN leagues l ON l.id = d.league_id AND l.is_mock_draft',
        'UPDATE draft_picks x SET participant_id',
        'ALTER TABLE draft_picks ALTER COLUMN participant_id SET NOT NULL',
      ].map((needle) => block.indexOf(needle));
      expect(order.every((i) => i > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(block.trimStart().startsWith('DO $$')).toBe(true);
    });

    it('only backfills rows that are still missing seat data', async () => {
      const statements = await capture(up);
      const block =
        statements[
          indexOf(
            statements,
            'PERFORM draft_participants_reconcile(r.draft_id)',
          )
        ];
      expect(block).toContain('WHERE x.participant_id IS NULL');
      expect(block).toContain(
        'NOT EXISTS (SELECT 1 FROM draft_participants p WHERE p.draft_id = d.id)',
      );
      expect(block).toContain(
        'NOT EXISTS (SELECT 1 FROM draft_teams dt WHERE dt.draft_id = d.id)',
      );
    });

    it('never deletes a seat that already has picks when reconciling', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'AND NOT EXISTS (SELECT 1 FROM draft_picks dp WHERE dp.participant_id = p.id)',
      );
    });
  });

  describe('down', () => {
    it('drops triggers, functions, tables, columns and enums', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain(
        'DROP TRIGGER IF EXISTS draft_teams_reconcile_participants_trigger ON draft_teams',
      );
      expect(sql).toContain(
        'DROP FUNCTION IF EXISTS draft_participants_reconcile(integer)',
      );
      for (const table of [
        'draft_messages',
        'invitations',
        'mock_draft_settings',
        'draft_participants',
      ]) {
        expect(sql).toContain(`DROP TABLE IF EXISTS ${table}`);
      }
      expect(sql).toContain('DROP COLUMN IF EXISTS kind');
      expect(sql).toContain('DROP TYPE IF EXISTS draft_kind');
    });

    it('drops seat tables before draft_participants and enums last', async () => {
      const statements = await capture(down);
      expect(
        indexOf(statements, 'DROP COLUMN IF EXISTS participant_id'),
      ).toBeLessThan(
        indexOf(statements, 'DROP TABLE IF EXISTS draft_participants'),
      );
      expect(
        indexOf(statements, 'DROP TABLE IF EXISTS draft_participants'),
      ).toBeLessThan(
        indexOf(statements, 'DROP TYPE IF EXISTS draft_participant_controller'),
      );
    });
  });
});

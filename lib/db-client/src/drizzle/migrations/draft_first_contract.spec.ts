import {
  up,
  down,
} from '../../../migrations/20261006_090000_draft_first_contract';

/**
 * Migration test for LS-10080: draft-first contract.
 *
 * Statement-level assertions on the generated SQL; the migration's up/down
 * round trip runs against a real Postgres in the DB test workflow.
 */
describe('Migration — draft-first contract (LS-10080)', () => {
  const capture = async (fn: typeof up): Promise<string[]> => {
    const statements: string[] = [];
    await fn({
      db: {
        execute: (query: string) => {
          statements.push(query);
          return Promise.resolve();
        },
      },
    });
    return statements;
  };
  const indexOf = (statements: string[], needle: string) =>
    statements.findIndex((s) => s.includes(needle));

  describe('up', () => {
    it('re-checks for mock-draft leagues before dropping the leagues columns', async () => {
      const statements = await capture(up);
      const guardedDelete = indexOf(
        statements,
        'DELETE FROM public.leagues WHERE is_mock_draft = true',
      );
      const dropColumns = indexOf(
        statements,
        'DROP COLUMN IF EXISTS is_mock_draft',
      );
      expect(guardedDelete).toBeGreaterThanOrEqual(0);
      expect(statements[guardedDelete]).toContain(
        "column_name = 'is_mock_draft'",
      );
      expect(dropColumns).toBeGreaterThan(guardedDelete);
      expect(statements[dropColumns]).toContain(
        'DROP COLUMN IF EXISTS is_offline_draft',
      );
      expect(statements[dropColumns]).toContain(
        'DROP COLUMN IF EXISTS control_all_teams',
      );
      expect(statements.join('\n')).toContain(
        'DROP INDEX IF EXISTS public.idx_leagues_owner_created_at_mock',
      );
    });

    it('drops draft_teams and the bridge functions only it used', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('DROP TABLE IF EXISTS public.draft_teams;');
      for (const fn of [
        'draft_teams_reconcile_participants()',
        'draft_participants_reconcile(integer)',
        'draft_participants_seat_missing(integer)',
        'draft_seat_controller(integer, integer, boolean)',
        'auction_state_fill_participant_ids()',
      ]) {
        expect(sql).toContain(`DROP FUNCTION IF EXISTS ${fn};`);
      }
    });

    it('keeps the draft_picks fill trigger working without draft_teams', async () => {
      const statements = await capture(up);
      const replaceFn = indexOf(
        statements,
        'CREATE OR REPLACE FUNCTION draft_participant_id_for_team',
      );
      expect(replaceFn).toBeGreaterThanOrEqual(0);
      expect(replaceFn).toBeLessThan(
        indexOf(statements, 'DROP TABLE IF EXISTS public.draft_teams'),
      );
      expect(statements[replaceFn]).not.toContain('draft_teams');
      expect(statements.join('\n')).not.toContain(
        'draft_picks_fill_participant_id_trigger',
      );
    });

    it.each([
      ['draft_queue', 'team_id'],
      ['auction_budgets', 'team_id'],
    ])(
      'makes %s.participant_id NOT NULL before dropping %s',
      async (table, column) => {
        const statements = await capture(up);
        const notNull = indexOf(
          statements,
          `ALTER TABLE public.${table} ALTER COLUMN participant_id SET NOT NULL`,
        );
        const drop = indexOf(
          statements,
          `ALTER TABLE public.${table} DROP COLUMN IF EXISTS ${column}`,
        );
        expect(notNull).toBeGreaterThanOrEqual(0);
        expect(drop).toBeGreaterThan(notNull);
        expect(
          indexOf(
            statements,
            `DROP TRIGGER IF EXISTS ${table}_fill_participant_id_trigger`,
          ),
        ).toBeLessThan(notNull);
      },
    );

    it('replaces the team-keyed uniques with seat-keyed constraints', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('UNIQUE (draft_id, participant_id, player_id)');
      expect(sql).toContain('UNIQUE (draft_id, participant_id, priority)');
      expect(sql).toContain('UNIQUE (draft_id, participant_id)');
    });

    it('drops the auction_state team columns and cascades the nominator seat', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('DROP COLUMN IF EXISTS nominator_team_id');
      expect(sql).toContain('DROP COLUMN IF EXISTS current_bidder_team_id');
      expect(sql).toContain(
        'FOREIGN KEY (nominator_participant_id) REFERENCES draft_participants(id) ON DELETE CASCADE',
      );
    });
  });

  describe('down', () => {
    it('restores the dropped structures and backfills team ids from seats', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.draft_teams');
      expect(sql).toContain(
        'SELECT draft_id, team_id, league_id, slot, auto_pick',
      );
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS is_mock_draft boolean NOT NULL DEFAULT false',
      );
      expect(sql).toContain(
        'ALTER TABLE public.draft_queue ADD COLUMN IF NOT EXISTS team_id integer',
      );
      expect(sql).toContain(
        'ALTER TABLE public.auction_budgets ADD COLUMN IF NOT EXISTS team_id integer',
      );
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS nominator_team_id integer',
      );
    });
  });
});

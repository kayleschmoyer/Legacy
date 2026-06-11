import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260610_000000_add_trade_name_snapshots';

/**
 * Migration test for LS-7527.
 *
 * Asserts the SQL emitted by up/down: the ADD COLUMN statements and DROP COLUMN
 * rollback. Backfill UPDATEs were intentionally omitted from this migration
 * (the columns are nullable; hydration falls back to a live JOIN for pre-migration
 * rows, and all new trades carry snapshots from proposal time).
 */
describe('Migration — add name snapshots to trade_offers and trade_offer_players (LS-7527)', () => {
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

  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  describe('up', () => {
    it('adds proposing_team_name and receiving_team_name columns to trade_offers (AC1)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('ALTER TABLE public.trade_offers');
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS proposing_team_name VARCHAR(255)',
      );
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS receiving_team_name VARCHAR(255)',
      );
    });

    it('adds player_name column to trade_offer_players (AC2)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('ALTER TABLE public.trade_offer_players');
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS player_name VARCHAR(255)',
      );
    });

    it('emits exactly 2 statements', async () => {
      const statements = await capture(up);
      expect(statements).toHaveLength(2);
    });
  });

  describe('down', () => {
    it('drops player_name from trade_offer_players (AC6)', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('ALTER TABLE public.trade_offer_players');
      expect(sql).toContain('DROP COLUMN IF EXISTS player_name');
    });

    it('drops proposing_team_name and receiving_team_name from trade_offers (AC6)', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('ALTER TABLE public.trade_offers');
      expect(sql).toContain('DROP COLUMN IF EXISTS proposing_team_name');
      expect(sql).toContain('DROP COLUMN IF EXISTS receiving_team_name');
    });

    it('emits exactly 2 statements (AC7)', async () => {
      const statements = await capture(down);
      expect(statements).toHaveLength(2);
    });
  });
});

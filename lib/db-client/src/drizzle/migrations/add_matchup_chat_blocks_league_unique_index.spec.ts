import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260823_130000_add_matchup_chat_blocks_league_unique_index';

/**
 * Migration test for LS-6297: partial unique index on matchup_chat_blocks
 * for league-scoped blocks.
 *
 * blockLeagueChatUser's SELECT-then-INSERT dedupe check isn't atomic; this
 * index backs it with a DB-level guarantee, scoped to scope = 'league' only
 * so the unused matchup-scoped block path stays unconstrained.
 */
describe('Migration — add matchup_chat_blocks league unique index (LS-6297)', () => {
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
    it('dedupes existing league-scoped rows before indexing', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('DELETE FROM matchup_chat_blocks');
      expect(sql).toContain("a.scope = 'league'");
    });

    it('creates a partial unique index scoped to scope = league only', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE UNIQUE INDEX matchup_chat_blocks_league_uk',
      );
      expect(sql).toContain(
        'ON matchup_chat_blocks(blocking_user_id, blocked_user_id, league_id)',
      );
      expect(sql).toContain("WHERE scope = 'league'");
    });
  });

  describe('down', () => {
    it('drops the index', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain(
        'DROP INDEX IF EXISTS matchup_chat_blocks_league_uk;',
      );
    });
  });
});

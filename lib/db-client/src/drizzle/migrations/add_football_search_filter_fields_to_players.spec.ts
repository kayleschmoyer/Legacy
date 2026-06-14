import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import {
  up,
  down,
} from '../../../migrations/20260614_000000_add_football_search_filter_fields_to_players';

describe('Migration — add football search filter fields to players (LS-6489)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds projected_fantasy_points and adp_rank columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"projected_fantasy_points"');
    expect(allSql).toContain('"adp_rank"');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('down removes both columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"projected_fantasy_points"');
    expect(allSql).toContain('"adp_rank"');
    expect(allSql).toContain('DROP COLUMN IF EXISTS');
  });
});

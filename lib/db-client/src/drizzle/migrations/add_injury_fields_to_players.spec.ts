import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import {
  up,
  down,
} from '../../../migrations/20260611_000000_add_injury_fields_to_players';

describe('Migration — add injury fields to players (LS-5436)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds injury_status, injury_designation, and news columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"injury_status"');
    expect(allSql).toContain('"injury_designation"');
    expect(allSql).toContain('"news"');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('down removes the three injury columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"injury_status"');
    expect(allSql).toContain('"injury_designation"');
    expect(allSql).toContain('"news"');
    expect(allSql).toContain('DROP COLUMN IF EXISTS');
  });
});

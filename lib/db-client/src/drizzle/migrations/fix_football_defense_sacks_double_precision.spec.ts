import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260525_000000_fix_football_defense_sacks_double_precision';

describe('Migration — fix football defense sacks to double precision (LS-248)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up alters sacks column to double precision', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(1);
    expect(executedStatements[0]).toContain('game_football_defense');
    expect(executedStatements[0]).toContain('ALTER COLUMN');
    expect(executedStatements[0]).toContain('"sacks"');
    expect(executedStatements[0]).toContain('double precision');
  });

  it('down reverts sacks column to integer with cast', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(1);
    expect(executedStatements[0]).toContain('game_football_defense');
    expect(executedStatements[0]).toContain('ALTER COLUMN');
    expect(executedStatements[0]).toContain('"sacks"');
    expect(executedStatements[0]).toContain('integer');
    expect(executedStatements[0]).toContain('sacks::integer');
  });
});

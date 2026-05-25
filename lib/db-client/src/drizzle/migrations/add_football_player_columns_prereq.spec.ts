import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260522_190150_add_football_player_columns_prereq';

describe('Migration — add football player columns prerequisite (LS-248)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds sport, is_dst, and nfl_team columns with IF NOT EXISTS', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(3);
    expect(executedStatements.some((s) => s.includes('"sport"'))).toBe(true);
    expect(executedStatements.some((s) => s.includes('"is_dst"'))).toBe(true);
    expect(executedStatements.some((s) => s.includes('"nfl_team"'))).toBe(true);
    for (const stmt of executedStatements) {
      expect(stmt).toContain('IF NOT EXISTS');
      expect(stmt).toContain('ALTER TABLE');
    }
  });

  it('down drops the three columns with IF EXISTS', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(1);
    expect(executedStatements[0]).toContain('"nfl_team"');
    expect(executedStatements[0]).toContain('"is_dst"');
    expect(executedStatements[0]).toContain('"sport"');
    expect(executedStatements[0]).toContain('IF EXISTS');
  });
});

import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260522_190199_prereq_football_columns_for_dst_seed';

describe('Migration — prereq football columns for DST seed (LS-250)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds sport, is_dst, and nfl_team columns with IF NOT EXISTS guards', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(3);

    // sport column using sport_kind enum
    expect(executedStatements[0]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(executedStatements[0]).toContain('"sport"');
    expect(executedStatements[0]).toContain('sport_kind');

    // is_dst boolean
    expect(executedStatements[1]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(executedStatements[1]).toContain('"is_dst"');
    expect(executedStatements[1]).toContain('BOOLEAN');

    // nfl_team without FK constraint
    expect(executedStatements[2]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(executedStatements[2]).toContain('"nfl_team"');
    expect(executedStatements[2]).not.toContain('FOREIGN KEY');
    expect(executedStatements[2]).not.toContain('REFERENCES');
  });

  it('down is a no-op (columns owned by 20260524_000100)', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(0);
  });
});

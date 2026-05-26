import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260524_000000_create_career_football_tables';

describe('Migration — create career_football_* tables (LS-250)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates all 5 career_football tables and their indexes', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    // 5 CREATE TABLE + 5 CREATE INDEX (career_football_defense_idp is a VIEW owned by LS-4155)
    expect(executedStatements).toHaveLength(10);

    const allSql = executedStatements.join('\n');

    // Verify all 5 tables are created
    expect(allSql).toContain('career_football_passing');
    expect(allSql).toContain('career_football_rushing');
    expect(allSql).toContain('career_football_receiving');
    expect(allSql).toContain('career_football_kicking');
    expect(allSql).toContain('career_football_defense');

    // Verify player_id FK references players table
    expect(allSql).toContain(
      'REFERENCES "public"."players" ("id") ON DELETE CASCADE',
    );
  });

  it('down drops all 5 tables in reverse dependency order', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    // 5 DROP TABLE (career_football_defense_idp VIEW dropped by 20260525_061000 LS-4155)
    expect(executedStatements).toHaveLength(5);

    // Tables dropped in reverse order
    expect(executedStatements[0]).toContain('career_football_defense');
    expect(executedStatements[1]).toContain('career_football_kicking');
    expect(executedStatements[2]).toContain('career_football_receiving');
    expect(executedStatements[3]).toContain('career_football_rushing');
    expect(executedStatements[4]).toContain('career_football_passing');
  });
});

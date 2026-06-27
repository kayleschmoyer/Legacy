import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260627_000000_backfill_legacy_nfl_team_abbrs';

describe('Migration — backfill legacy NFL team abbreviations (LS-6492)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up issues one UPDATE per legacy abbreviation (OAK→LV, SD→LAC, STL→LAR)', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(3);

    const [lvStmt, lacStmt, larStmt] = executedStatements;

    // OAK → LV (Raiders relocation)
    expect(lvStmt).toContain("nfl_team = 'LV'");
    expect(lvStmt).toContain("nfl_team = 'OAK'");
    expect(lvStmt).toContain("sport = 'football'");

    // SD → LAC (Chargers relocation)
    expect(lacStmt).toContain("nfl_team = 'LAC'");
    expect(lacStmt).toContain("nfl_team = 'SD'");
    expect(lacStmt).toContain("sport = 'football'");

    // STL → LAR (Rams relocation)
    expect(larStmt).toContain("nfl_team = 'LAR'");
    expect(larStmt).toContain("nfl_team = 'STL'");
    expect(larStmt).toContain("sport = 'football'");

    for (const stmt of executedStatements) {
      expect(stmt.trim().toUpperCase()).toMatch(/^UPDATE/);
    }
  });

  it('down is a no-op (reverting a data backfill is unsafe)', async () => {
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

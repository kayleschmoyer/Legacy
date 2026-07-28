import type { PgDatabase } from 'drizzle-orm/pg-core';
import {
  up,
  down,
} from '../../../migrations/20260727_000000_drop_injury_columns_from_players';

describe('Migration — drop injury columns from players (LS-8608)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up drops injury_status, injury_designation, and injuries_last_synced_at columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db matches only the execute() surface the migration uses
    await up({ db: mockDb as unknown as PgDatabase<any> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"injury_status"');
    expect(allSql).toContain('"injury_designation"');
    expect(allSql).toContain('"injuries_last_synced_at"');
    expect(allSql).toContain('DROP COLUMN IF EXISTS');
    expect(allSql).not.toContain('"news"');
  });

  it('down restores the three injury columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db matches only the execute() surface the migration uses
    await down({ db: mockDb as unknown as PgDatabase<any> });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('"injury_status"');
    expect(allSql).toContain('"injury_designation"');
    expect(allSql).toContain('"injuries_last_synced_at"');
    expect(allSql).toContain('ADD COLUMN IF NOT EXISTS');
  });
});

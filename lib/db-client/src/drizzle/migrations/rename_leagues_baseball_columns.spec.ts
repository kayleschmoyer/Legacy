import {
  up,
  down,
} from '../../../migrations/20260525_000000_rename_leagues_baseball_columns';

describe('Migration — rename baseball-specific columns in leagues', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up renames sp_starts_per_matchup, era_filter, hof_only', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await up({ db: mockDb as any });
    expect(executedStatements.length).toBe(3);
    expect(executedStatements[0]).toContain('pitcher_starts_per_matchup');
    expect(executedStatements[1]).toContain('baseball_era_filter');
    expect(executedStatements[2]).toContain('baseball_hof_only');
  });

  it('down reverts pitcher_starts_per_matchup, baseball_era_filter, baseball_hof_only', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await down({ db: mockDb as any });
    expect(executedStatements.length).toBe(3);
    expect(executedStatements[0]).toContain('hof_only');
    expect(executedStatements[1]).toContain('era_filter');
    expect(executedStatements[2]).toContain('sp_starts_per_matchup');
  });
});

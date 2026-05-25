import {
  up,
  down,
} from '../../../migrations/20260525_000100_rename_matchups_baseball_columns';

describe('Migration — rename baseball-specific column in matchups', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up renames sp_starts_per_matchup to pitcher_starts_per_matchup', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await up({ db: mockDb as any });
    expect(executedStatements.length).toBe(1);
    expect(executedStatements[0]).toContain('pitcher_starts_per_matchup');
  });

  it('down reverts pitcher_starts_per_matchup to sp_starts_per_matchup', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await down({ db: mockDb as any });
    expect(executedStatements.length).toBe(1);
    expect(executedStatements[0]).toContain('sp_starts_per_matchup');
  });
});

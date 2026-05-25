import {
  up,
  down,
} from '../../../migrations/20260525_000200_rename_matchup_player_games_baseball_columns';

describe('Migration — rename baseball-specific columns in matchup_player_games', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up renames sp_skipped and fielding_game_pos', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await up({ db: mockDb as any });
    expect(executedStatements.length).toBe(2);
    expect(executedStatements[0]).toContain('pitcher_start_skipped');
    expect(executedStatements[1]).toContain('game_position');
  });

  it('down reverts pitcher_start_skipped and game_position', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock db doesn't satisfy the full PgDatabase generic
    await down({ db: mockDb as any });
    expect(executedStatements.length).toBe(2);
    expect(executedStatements[0]).toContain('fielding_game_pos');
    expect(executedStatements[1]).toContain('sp_skipped');
  });
});

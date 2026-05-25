import {
  up,
  down,
} from '../../../migrations/20260524_200000_create_game_football_player_offense_stats_view';

describe('Migration — create game_football_player_offense_stats view', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates game_football_player_offense_stats view with FULL JOINs', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('game_football_player_offense_stats');
    expect(allSql).toContain('FULL JOIN');
    expect(allSql).toContain('game_football_passing');
    expect(allSql).toContain('game_football_rushing');
    expect(allSql).toContain('game_football_receiving');
    expect(allSql).toContain('game_football_kicking');
  });

  it('up includes all passing columns with aliases', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('pass_att');
    expect(allSql).toContain('pass_yds');
    expect(allSql).toContain('pass_td');
    expect(allSql).toContain('sack_yds');
  });

  it('up includes all rushing columns with aliases', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('rush_att');
    expect(allSql).toContain('rush_yds');
    expect(allSql).toContain('rush_td');
    expect(allSql).toContain('rush_fumbles');
  });

  it('up includes all receiving columns with aliases', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('rec_yds');
    expect(allSql).toContain('rec_td');
    expect(allSql).toContain('rec_fumbles');
  });

  it('up includes banded FG kicking columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('fg_0_19m');
    expect(allSql).toContain('fg_50m');
    expect(allSql).toContain('k_lng');
  });

  it('down drops the view', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await down({ db: mockDb as any });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('DROP VIEW IF EXISTS');
    expect(allSql).toContain('game_football_player_offense_stats');
  });
});

import {
  up,
  down,
} from '../../../migrations/20260524_000100_add_football_columns_to_players';

describe('Migration — add football columns to players', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds sport, pfr_id, is_dst, and nfl_team columns', async () => {
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
    expect(allSql).toContain('"sport"');
    expect(allSql).toContain('"pfr_id"');
    expect(allSql).toContain('"is_dst"');
    expect(allSql).toContain('"nfl_team"');
  });

  it('up creates partial unique index on pfr_id where non-null', async () => {
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
    expect(allSql).toContain('players_pfr_id_unique');
    expect(allSql).toContain('WHERE "pfr_id" IS NOT NULL');
  });

  it('up adds foreign key referencing nfl_teams with ON DELETE SET NULL', async () => {
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
    expect(allSql).toContain('players_nfl_team_fk');
    expect(allSql).toContain('"public"."nfl_teams"');
    expect(allSql).toContain('ON DELETE SET NULL');
  });

  it('down removes all added columns and constraints', async () => {
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
    expect(allSql).toContain('players_nfl_team_fk');
    expect(allSql).toContain('players_pfr_id_unique');
    expect(allSql).toContain('DROP COLUMN');
  });
});

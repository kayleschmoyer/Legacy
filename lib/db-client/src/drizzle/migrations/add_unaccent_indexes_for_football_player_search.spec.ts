import {
  up,
  down,
} from '../../../migrations/20260614_060000_add_unaccent_indexes_for_football_player_search';

describe('Migration — add unaccent indexes for football player search (LS-7049)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates the f_unaccent wrapper function and both expression indexes scoped to football players', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb });
    const allSql = executedStatements.join('\n');
    // f_unaccent() wrapper function (IMMUTABLE wrapper around unaccent())
    expect(allSql).toContain('f_unaccent');
    expect(allSql).toContain('IMMUTABLE');
    // Indexes use the wrapper function
    expect(allSql).toContain('idx_players_unaccent_first_name_football');
    expect(allSql).toContain('idx_players_unaccent_last_name_football');
    expect(allSql).toContain('f_unaccent(first_name)');
    expect(allSql).toContain('f_unaccent(last_name)');
    expect(allSql).toContain(`sport = 'football'`);
    expect(allSql).toContain('CONCURRENTLY');
  });

  it('down drops both indexes and the f_unaccent function', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('idx_players_unaccent_first_name_football');
    expect(allSql).toContain('idx_players_unaccent_last_name_football');
    expect(allSql).toContain('DROP INDEX IF EXISTS');
    expect(allSql).toContain('DROP FUNCTION IF EXISTS');
    expect(allSql).toContain('f_unaccent');
  });
});

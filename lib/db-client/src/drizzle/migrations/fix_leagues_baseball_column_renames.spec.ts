import {
  up,
  down,
} from '../../../migrations/20260526_000000_fix_leagues_baseball_column_renames';

type MigrationDb = { execute: (sql: unknown) => Promise<unknown> };

function makeMockDb() {
  const statements: string[] = [];
  const db: MigrationDb = {
    execute: (stmt: unknown) => {
      statements.push(String(stmt));
      return Promise.resolve([]);
    },
  };
  return { db, statements };
}

describe('Migration — fix_leagues_baseball_column_renames', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  describe('up', () => {
    it('creates era_filter enum idempotently', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      expect(statements[0]).toContain('era_filter');
      expect(statements[0]).toContain('EXCEPTION');
      expect(statements[0]).toContain('duplicate_object');
    });

    it('adds football era values to enum with ADD VALUE IF NOT EXISTS', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      expect(statements[1]).toContain('ADD VALUE IF NOT EXISTS');
      expect(statements[1]).toContain('pioneer');
      expect(statements[1]).toContain('spread_offense');
    });

    it('renames or adds baseball_era_filter idempotently', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      const sql = statements[2];
      expect(sql).toContain('baseball_era_filter');
      expect(sql).toContain('era_filter');
      // idempotency: handles both rename and ADD COLUMN cases
      expect(sql).toContain('RENAME COLUMN');
      expect(sql).toContain('ADD COLUMN');
    });

    it('renames or adds baseball_hof_only idempotently', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      const sql = statements[3];
      expect(sql).toContain('baseball_hof_only');
      expect(sql).toContain('hof_only');
      expect(sql).toContain('ADD COLUMN');
    });

    it('adds custom_era columns with ADD COLUMN IF NOT EXISTS', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      const sql = statements[4];
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
      expect(sql).toContain('custom_era_start_year');
      expect(sql).toContain('custom_era_end_year');
    });

    it('adds check constraint idempotently', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      const sql = statements[5];
      expect(sql).toContain('leagues_custom_era_years_check');
      expect(sql).toContain('custom_era_start_year <= custom_era_end_year');
    });

    it('renames or adds pitcher_starts_per_matchup idempotently', async () => {
      const { db, statements } = makeMockDb();
      await up({ db });
      const sql = statements[6];
      expect(sql).toContain('pitcher_starts_per_matchup');
      expect(sql).toContain('sp_starts_per_matchup');
      expect(sql).toContain('ADD COLUMN');
    });
  });

  describe('idempotency', () => {
    it('runs up twice without throwing', async () => {
      const { db } = makeMockDb();
      await expect(up({ db })).resolves.toBeUndefined();
      await expect(up({ db })).resolves.toBeUndefined();
    });
  });

  describe('down', () => {
    it('renames baseball_era_filter back to era_filter if present', async () => {
      const { db, statements } = makeMockDb();
      await down({ db });
      expect(statements[0]).toContain('baseball_era_filter');
      expect(statements[0]).toContain('era_filter');
      expect(statements[0]).toContain('RENAME COLUMN');
    });

    it('renames baseball_hof_only back to hof_only if present', async () => {
      const { db, statements } = makeMockDb();
      await down({ db });
      expect(statements[1]).toContain('baseball_hof_only');
      expect(statements[1]).toContain('hof_only');
    });

    it('renames pitcher_starts_per_matchup back to sp_starts_per_matchup if present', async () => {
      const { db, statements } = makeMockDb();
      await down({ db });
      expect(statements[2]).toContain('pitcher_starts_per_matchup');
      expect(statements[2]).toContain('sp_starts_per_matchup');
    });

    it('drops leagues_custom_era_years_check constraint if present', async () => {
      const { db, statements } = makeMockDb();
      await down({ db });
      expect(statements[3]).toContain('leagues_custom_era_years_check');
      expect(statements[3]).toContain('DROP CONSTRAINT');
    });

    it('drops custom_era columns with DROP COLUMN IF EXISTS', async () => {
      const { db, statements } = makeMockDb();
      await down({ db });
      expect(statements[4]).toContain('DROP COLUMN IF EXISTS');
      expect(statements[4]).toContain('custom_era_start_year');
      expect(statements[4]).toContain('custom_era_end_year');
    });
  });
});

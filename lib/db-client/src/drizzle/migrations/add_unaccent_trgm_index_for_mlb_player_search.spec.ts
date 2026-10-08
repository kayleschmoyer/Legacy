import {
  up,
  down,
} from '../../../migrations/20261008_120000_add_unaccent_trgm_index_for_mlb_player_search';

function recordingDb() {
  const executedStatements: string[] = [];
  return {
    executedStatements,
    db: {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    },
  };
}

describe('Migration — add unaccent trigram index for MLB player search (LS-10728)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up idempotently ensures the extensions and builds the unaccented trigram index', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('CREATE EXTENSION IF NOT EXISTS unaccent');
    expect(allSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(allSql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_unaccent_name_trgm',
    );
    // Must match the expression buildPlayerNameSearch emits, or the planner
    // cannot use the index.
    expect(allSql).toContain(
      `lower(public.f_unaccent(first_name || ' ' || last_name))`,
    );
    expect(allSql).toContain('gin_trgm_ops');
  });

  it('up drops an INVALID leftover index before the IF NOT EXISTS create', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    const guardIdx = executedStatements.findIndex((s) =>
      s.includes('NOT indisvalid'),
    );
    const createIdx = executedStatements.findIndex((s) =>
      s.includes('CREATE INDEX CONCURRENTLY'),
    );
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(createIdx);
  });

  it('down drops only the new index', async () => {
    const { db, executedStatements } = recordingDb();
    await down({ db });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain(
      'DROP INDEX CONCURRENTLY IF EXISTS public.idx_players_unaccent_name_trgm',
    );
    expect(allSql).not.toContain('DROP EXTENSION');
    expect(allSql).not.toContain('idx_players_name_trgm ');
  });
});

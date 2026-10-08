import {
  up,
  down,
} from '../../../migrations/20261008_130000_add_player_name_aliases';

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

describe('Migration — add player name aliases (LS-10669)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds the nullable name_aliases column idempotently', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    expect(executedStatements.join('\n')).toContain(
      'ALTER TABLE public.players ADD COLUMN IF NOT EXISTS name_aliases text',
    );
  });

  it('up backfills legal-name aliases for baseball rows only when they differ', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    const backfill = executedStatements.find((s) =>
      s.includes('SET name_aliases = v.aliases'),
    );
    expect(backfill).toBeDefined();
    expect(backfill).toContain(`('aaronha01', 'Henry Aaron')`);
    expect(backfill).toContain(`('ruthba01', 'George Ruth')`);
    expect(backfill).toContain(
      `('jacksjo01', 'Joseph Jackson|Shoeless Joe Jackson')`,
    );
    expect(backfill).toContain(`p.sport = 'baseball'`);
    expect(backfill).toContain('IS DISTINCT FROM v.aliases');
  });

  it('up renames Henry Aaron to his known name only while the legal name is stored', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    const rename = executedStatements.find((s) =>
      s.includes(`SET first_name = 'Hank'`),
    );
    expect(rename).toBeDefined();
    expect(rename).toContain(`bref_id = 'aaronha01'`);
    expect(rename).toContain(`first_name = 'Henry'`);
  });

  it('up builds the alias trigram index on the exact matcher expression', async () => {
    const { db, executedStatements } = recordingDb();
    await up({ db });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain('CREATE EXTENSION IF NOT EXISTS unaccent');
    expect(allSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(allSql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_name_aliases_trgm',
    );
    // Must match the alias arm buildPlayerNameSearch emits, or the planner
    // cannot use the index.
    expect(allSql).toContain(`lower(public.f_unaccent(name_aliases))`);
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

  it('down drops the index, restores the legal first name, and drops the column', async () => {
    const { db, executedStatements } = recordingDb();
    await down({ db });
    const allSql = executedStatements.join('\n');
    expect(allSql).toContain(
      'DROP INDEX CONCURRENTLY IF EXISTS public.idx_players_name_aliases_trgm',
    );
    expect(allSql).toContain(`SET first_name = 'Henry'`);
    expect(allSql).toContain(
      'ALTER TABLE public.players DROP COLUMN IF EXISTS name_aliases',
    );
    expect(allSql).not.toContain('DROP EXTENSION');
    expect(allSql).not.toContain('idx_players_unaccent_name_trgm');
  });
});

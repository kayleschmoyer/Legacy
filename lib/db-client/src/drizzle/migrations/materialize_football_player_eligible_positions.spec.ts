import {
  up,
  down,
} from '../../../migrations/20261004_120000_materialize_football_player_eligible_positions';

type MigrationDb = Parameters<typeof up>[0]['db'];

function captureStatements() {
  const executed: string[] = [];
  const mockDb = {
    execute: (stmt: unknown) => {
      executed.push(String(stmt));
      return Promise.resolve();
    },
  };
  return { executed, db: mockDb as unknown as MigrationDb };
}

describe('Migration — materialize football_player_eligible_positions (LS-10553)', () => {
  it('up drops only the plain view, then creates the materialized view with a unique index', async () => {
    const { executed, db } = captureStatements();

    await up({ db });

    expect(executed).toHaveLength(4);

    // Guarded drop: DROP VIEW errors against a materialized view.
    expect(executed[0]).toContain("c.relkind = 'v'");
    expect(executed[0]).toContain(
      'DROP VIEW public.football_player_eligible_positions',
    );

    const createSql = executed[1];
    expect(createSql).toContain(
      'CREATE MATERIALIZED VIEW IF NOT EXISTS public.football_player_eligible_positions',
    );
    expect(createSql).toContain('WITH DATA');
    // Same five branches as the LS-250 view.
    expect(createSql).toContain("'DST'::text");
    expect(createSql).toContain("'DL', 'LB', 'DB'");
    expect(createSql).toContain("'QB', 'RB', 'WR', 'TE', 'K'");
    expect(createSql).toContain('cfp.att > 0');
    expect(createSql).toContain('cfk.fga > 0');
    expect(createSql).toContain('NOT EXISTS');

    // Unique index is required for REFRESH ... CONCURRENTLY.
    expect(executed[2]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(executed[2]).toContain('(player_id, position)');

    expect(executed[3]).toContain('ANALYZE');
  });

  it('down drops the materialized view and restores the plain view', async () => {
    const { executed, db } = captureStatements();

    await down({ db });

    expect(executed).toHaveLength(2);
    expect(executed[0]).toContain(
      'DROP MATERIALIZED VIEW IF EXISTS public.football_player_eligible_positions',
    );
    expect(executed[1]).toContain(
      'CREATE OR REPLACE VIEW public.football_player_eligible_positions',
    );
    expect(executed[1]).toContain('career_football_kicking');
  });
});

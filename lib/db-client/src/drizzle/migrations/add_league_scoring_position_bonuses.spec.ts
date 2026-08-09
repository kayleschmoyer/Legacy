import {
  up,
  down,
} from '../../../migrations/20260807_000000_add_league_scoring_position_bonuses';

describe('Migration — add league_scoring_position_bonuses table', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates the table with FKs, unique index, and updated_at trigger', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
    await up({ db: mockDb as any });

    const sql = executedStatements.join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "public"."league_scoring_position_bonuses"',
    );
    expect(sql).toContain('"profile_id" INTEGER NOT NULL');
    expect(sql).toContain('"stat_definition_id" INTEGER NOT NULL');
    expect(sql).toContain('"position" VARCHAR(10) NOT NULL');
    expect(sql).toContain('"bonus_multiplier" NUMERIC(6, 3) NOT NULL');
    expect(sql).toContain('"is_enabled" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain(
      'REFERENCES "public"."league_scoring_profiles" ("id") ON DELETE CASCADE',
    );
    expect(sql).toContain(
      'REFERENCES "public"."scoring_stat_definitions" ("id")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "league_scoring_position_bonuses_unique"',
    );
    expect(sql).toContain('("profile_id", "stat_definition_id", "position")');
    expect(sql).toContain(
      'CREATE TRIGGER league_scoring_position_bonuses_updated_at_trigger',
    );
  });

  it('down drops the trigger and the table', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
    await down({ db: mockDb as any });

    const sql = executedStatements.join('\n');
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS league_scoring_position_bonuses_updated_at_trigger',
    );
    expect(sql).toContain(
      'DROP TABLE IF EXISTS "public"."league_scoring_position_bonuses"',
    );
  });
});

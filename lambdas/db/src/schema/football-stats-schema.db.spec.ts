import { sql } from 'drizzle-orm';
import {
  getTestDatabase,
  integrationTestSchema,
} from '../../integration-test-setup';

/**
 * Regression guard for LS-8553.
 *
 * `footballSeasonDefense.fumRec` was mapped to a `fum_rec` column that no
 * environment has ever had — two migrations create each football stats table
 * with `CREATE TABLE IF NOT EXISTS` and the earlier timestamp wins, so the
 * later migration (whose column names the models were written from) is a
 * silent no-op. The mismatch only surfaced as a 500 from the football player
 * resolver in dev, because every unit test mocks the database.
 *
 * Selecting every mapped column from each model against a real database built
 * from the real migrations is what catches this class of drift: Drizzle emits
 * each column name into the SELECT list, so any name that does not exist fails
 * with `column "..." does not exist`. No rows are required — resolution alone
 * is the assertion.
 */
describe('Football stats models - DB schema conformance', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  const tables = [
    'gameFootballPassing',
    'gameFootballRushing',
    'gameFootballReceiving',
    'gameFootballKicking',
    'gameFootballDefense',
    'gameFootballDefenseIdp',
    'gameFootballPlayerOffenseStats',
    'footballSeasonPassing',
    'footballSeasonRushing',
    'footballSeasonReceiving',
    'footballSeasonKicking',
    'footballSeasonDefense',
    'footballSeasonDefenseIdp',
    'careerFootballPassing',
    'careerFootballRushing',
    'careerFootballReceiving',
    'careerFootballKicking',
    'careerFootballDefense',
    'careerFootballDefenseIdp',
  ] as const;

  it.each(tables)(
    'every column mapped by %s exists in the database',
    async (name) => {
      const table = integrationTestSchema[name];

      await expect(db.select().from(table).limit(1)).resolves.toBeDefined();
    },
  );

  /**
   * Regression guard for LS-8573.
   *
   * Column-name resolution above does not catch type drift: Drizzle does not
   * emit column types in a SELECT list, so a model declaring `smallint`/
   * `numeric` against a physical `integer`/`double precision` column resolves
   * fine and silently returns the wrong runtime type (e.g. `string` instead
   * of `number` for `sacks`). Assert the physical `information_schema.columns`
   * type for every column that LS-8573 corrected, re-derived from the
   * winning (non-no-op) migrations rather than from the model.
   */
  describe('physical column types (LS-8573)', () => {
    async function physicalTypes(
      tableName: string,
    ): Promise<Record<string, string>> {
      const rows = await db.execute<{
        column_name: string;
        data_type: string;
      }>(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `);
      const byColumn: Record<string, string> = {};
      for (const row of rows.rows) {
        byColumn[row.column_name] = row.data_type;
      }
      return byColumn;
    }

    const seasonSharedColumns = {
      season: 'integer',
      team: 'character varying',
      pfr_row_id: 'character varying',
    };

    const seasonExpectedTypes: Record<string, Record<string, string>> = {
      football_season_passing: {
        ...seasonSharedColumns,
        g: 'integer',
        cmp: 'integer',
        att: 'integer',
        td: 'integer',
        rating: 'double precision',
      },
      football_season_rushing: {
        ...seasonSharedColumns,
        g: 'integer',
        att: 'integer',
        fumbles: 'integer',
        yds_per_att: 'double precision',
      },
      football_season_receiving: {
        ...seasonSharedColumns,
        g: 'integer',
        rec: 'integer',
        fumbles: 'integer',
        yds_per_rec: 'double precision',
      },
      football_season_kicking: {
        ...seasonSharedColumns,
        g: 'integer',
        fgm: 'integer',
        fg_pct: 'double precision',
      },
      football_season_defense: {
        ...seasonSharedColumns,
        g: 'integer',
        sacks: 'integer',
        fumbles_rec: 'integer',
        pts_allowed: 'integer',
      },
    };

    const careerExpectedTypes: Record<string, Record<string, string>> = {
      career_football_passing: { g: 'integer', rating: 'double precision' },
      career_football_rushing: { g: 'integer', fumbles: 'integer' },
      career_football_receiving: { g: 'integer', fumbles: 'integer' },
      career_football_kicking: { g: 'integer', fgm: 'integer' },
      career_football_defense: {
        g: 'integer',
        sacks: 'double precision',
        fumbles_rec: 'integer',
        pts_allowed_per_g: 'double precision',
        yds_allowed_per_g: 'double precision',
      },
    };

    it.each(Object.entries(seasonExpectedTypes))(
      '%s columns match information_schema.columns',
      async (tableName, expected) => {
        const actual = await physicalTypes(tableName);
        for (const [column, expectedType] of Object.entries(expected)) {
          expect([tableName, column, actual[column]]).toEqual([
            tableName,
            column,
            expectedType,
          ]);
        }
      },
    );

    it.each(Object.entries(careerExpectedTypes))(
      '%s columns match information_schema.columns',
      async (tableName, expected) => {
        const actual = await physicalTypes(tableName);
        for (const [column, expectedType] of Object.entries(expected)) {
          expect([tableName, column, actual[column]]).toEqual([
            tableName,
            column,
            expectedType,
          ]);
        }
      },
    );

    // football_season_defense_idp and its career_football_defense_idp view are
    // NOT affected by LS-8573 (single-migration table, no no-op collision) —
    // assert the boundary explicitly so a future migration change is caught.
    it('football_season_defense_idp is unaffected — sacks stays numeric', async () => {
      const actual = await physicalTypes('football_season_defense_idp');
      expect(actual['season']).toBe('smallint');
      expect(actual['team']).toBe('character varying');
      expect(actual['sacks']).toBe('numeric');
    });
  });
});

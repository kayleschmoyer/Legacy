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
});

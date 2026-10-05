/**
 * Unit tests for the career_football_* DataLoaders (LS-8567).
 *
 * FootballPlayer.careerStats previously issued 1-4 direct db.select() reads
 * per row (career_football_{passing,rushing,receiving,kicking,defense} plus
 * the career_football_defense_idp view) — up to ~400 point reads on a
 * pageSize-100 grid page. These loaders batch every `.load(playerId)` call
 * within a request tick into a single `inArray` query per category, so N
 * rows cost at most one query per touched category table.
 */

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    PublicSchema: {
      careerFootballPassing: { playerId: 'careerFootballPassing.playerId' },
      careerFootballRushing: { playerId: 'careerFootballRushing.playerId' },
      careerFootballReceiving: { playerId: 'careerFootballReceiving.playerId' },
      careerFootballKicking: { playerId: 'careerFootballKicking.playerId' },
      careerFootballDefense: { playerId: 'careerFootballDefense.playerId' },
      careerFootballDefenseIdp: {
        playerId: 'careerFootballDefenseIdp.playerId',
      },
    },
  }),
);

import {
  createCareerFootballDefenseIdpLoader,
  createCareerFootballDefenseLoader,
  createCareerFootballKickingLoader,
  createCareerFootballPassingLoader,
  createCareerFootballReceivingLoader,
  createCareerFootballRushingLoader,
} from './statistics-loaders';

type Row = { playerId: number | null; [key: string]: unknown };

/** Minimal Drizzle-like mock: db.select().from(table).where(inArray(...)). */
function makeMockDb(rows: Row[]) {
  const calls: Array<{ table: unknown }> = [];
  let table: unknown;

  const chain = {
    from: (t: unknown) => {
      table = t;
      return chain;
    },
    where: () => {
      calls.push({ table });
      return Promise.resolve(rows);
    },
  };

  return {
    db: { select: () => chain } as unknown as Parameters<
      typeof createCareerFootballPassingLoader
    >[0],
    calls,
  };
}

describe.each([
  ['createCareerFootballPassingLoader', createCareerFootballPassingLoader],
  ['createCareerFootballRushingLoader', createCareerFootballRushingLoader],
  ['createCareerFootballReceivingLoader', createCareerFootballReceivingLoader],
  ['createCareerFootballKickingLoader', createCareerFootballKickingLoader],
  ['createCareerFootballDefenseLoader', createCareerFootballDefenseLoader],
])('%s (LS-8567)', (_name, createLoader) => {
  it('batches N playerId loads into a single query', async () => {
    const rows: Row[] = [
      { playerId: 1, g: 16 },
      { playerId: 2, g: 12 },
      { playerId: 3, g: 8 },
    ];
    const { db, calls } = makeMockDb(rows);
    const loader = createLoader(db);

    const results = await Promise.all([
      loader.load(1),
      loader.load(2),
      loader.load(3),
    ]);

    expect(calls).toHaveLength(1);
    expect(results).toEqual([rows[0], rows[1], rows[2]]);
  });

  it('returns null for a playerId with no career row, without an extra query', async () => {
    const { db, calls } = makeMockDb([{ playerId: 1, g: 16 }]);
    const loader = createLoader(db);

    const [found, missing] = await Promise.all([
      loader.load(1),
      loader.load(999),
    ]);

    expect(calls).toHaveLength(1);
    expect(found).toEqual({ playerId: 1, g: 16 });
    expect(missing).toBeNull();
  });

  it('dedupes repeated loads of the same playerId within a batch', async () => {
    const { db, calls } = makeMockDb([{ playerId: 5, g: 10 }]);
    const loader = createLoader(db);

    const [a, b] = await Promise.all([loader.load(5), loader.load(5)]);

    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
  });
});

describe('createCareerFootballDefenseIdpLoader (LS-8567)', () => {
  it('batches N playerId loads against the view into a single query', async () => {
    const rows: Row[] = [
      { playerId: 10, soloTkl: 40 },
      { playerId: 11, soloTkl: 55 },
    ];
    const { db, calls } = makeMockDb(rows);
    const loader = createCareerFootballDefenseIdpLoader(db);

    const results = await Promise.all([loader.load(10), loader.load(11)]);

    expect(calls).toHaveLength(1);
    expect(results).toEqual([rows[0], rows[1]]);
  });

  it('ignores rows with a null player_id from the aggregate view', async () => {
    const { db } = makeMockDb([
      { playerId: null, soloTkl: 0 },
      { playerId: 20, soloTkl: 30 },
    ]);
    const loader = createCareerFootballDefenseIdpLoader(db);

    await expect(loader.load(20)).resolves.toEqual({
      playerId: 20,
      soloTkl: 30,
    });
  });

  it('returns null when the player has no IDP aggregate row', async () => {
    const { db } = makeMockDb([]);
    const loader = createCareerFootballDefenseIdpLoader(db);

    await expect(loader.load(999)).resolves.toBeNull();
  });
});

/**
 * LS-10515: createCareerSeasonsLoader is scoped to the player's sport and
 * resolves null (never 0) when no season rows exist.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => {
  const table = (name: string) => ({
    __name: name,
    playerId: `${name}.playerId`,
    season: `${name}.season`,
  });
  return mockDbClientModule({
    PublicSchema: {
      players: { id: 'players.id', sport: 'players.sport' },
      seasonBatting: table('seasonBatting'),
      seasonPitching: table('seasonPitching'),
      footballSeasonPassing: table('footballSeasonPassing'),
      footballSeasonRushing: table('footballSeasonRushing'),
      footballSeasonReceiving: table('footballSeasonReceiving'),
      footballSeasonKicking: table('footballSeasonKicking'),
      footballSeasonDefense: table('footballSeasonDefense'),
      footballSeasonDefenseIdp: table('footballSeasonDefenseIdp'),
    },
  });
});

import { createCareerSeasonsLoader } from './statistics-loaders';

type Row = Record<string, unknown>;

function fakeDb(
  players: Row[],
  seasonRows: Record<string, { playerId: number; season: number }[]>,
) {
  return {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(players) }),
    }),
    selectDistinct: () => ({
      from: (table: { __name: string }) => ({
        where: () => Promise.resolve(seasonRows[table.__name] ?? []),
      }),
    }),
  };
}

describe('createCareerSeasonsLoader', () => {
  it('counts the union of batting and pitching seasons for baseball players', async () => {
    const db = fakeDb([{ id: 1, sport: 'baseball' }], {
      seasonBatting: [{ playerId: 1, season: 2020 }],
      seasonPitching: [
        { playerId: 1, season: 2020 },
        { playerId: 1, season: 2021 },
      ],
    });
    const loader = createCareerSeasonsLoader(db as never);
    await expect(loader.load(1)).resolves.toBe(2);
  });

  it('counts football_season_* seasons for football players', async () => {
    const db = fakeDb([{ id: 2, sport: 'football' }], {
      footballSeasonPassing: [
        { playerId: 2, season: 2019 },
        { playerId: 2, season: 2020 },
      ],
      footballSeasonRushing: [{ playerId: 2, season: 2021 }],
    });
    const loader = createCareerSeasonsLoader(db as never);
    await expect(loader.load(2)).resolves.toBe(3);
  });

  it('resolves null, not 0, when no rows exist or the player is unknown', async () => {
    const db = fakeDb([{ id: 3, sport: 'football' }], {});
    const loader = createCareerSeasonsLoader(db as never);
    await expect(loader.load(3)).resolves.toBeNull();
    await expect(loader.load(99)).resolves.toBeNull();
  });
});

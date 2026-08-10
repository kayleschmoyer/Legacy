/**
 * Tests for game-state-manager.ts — specifically that a season with no
 * scraped per-game box scores is flagged as `noGameDataFound`, not
 * `pitcherStartSkipped` (LS-9122). Conflating the two caused hitters with
 * a data-availability gap to be mislabeled as having real off days,
 * inflating the "off days" count shown on the matchup page.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const gameBatting = {
  gameIdentifier: 'gb.id',
  playerId: 'gb.playerId',
  season: 'gb.season',
};
const gamePitching = {
  gameIdentifier: 'gp.id',
  playerId: 'gp.playerId',
  season: 'gp.season',
};
const gameFootballDefense = {
  gameIdentifier: 'gfd.id',
  playerId: 'gfd.playerId',
  season: 'gfd.season',
};
const gameFootballDefenseIdp = {
  gameIdentifier: 'gfdi.id',
  playerId: 'gfdi.playerId',
  season: 'gfdi.season',
};
const gameFootballPassing = {
  gameIdentifier: 'gfp.id',
  playerId: 'gfp.playerId',
  season: 'gfp.season',
};
const gameFootballRushing = {
  gameIdentifier: 'gfr.id',
  playerId: 'gfr.playerId',
  season: 'gfr.season',
};
const gameFootballReceiving = {
  gameIdentifier: 'gfrec.id',
  playerId: 'gfrec.playerId',
  season: 'gfrec.season',
};
const gameFootballKicking = {
  gameIdentifier: 'gfk.id',
  playerId: 'gfk.playerId',
  season: 'gfk.season',
};
const matchupPlayerGames = {
  id: 'mpg.id',
  matchupPlayerId: 'mpg.matchupPlayerId',
  gameIdentifier: 'mpg.gameIdentifier',
  pitcherStartSkipped: 'mpg.pitcherStartSkipped',
  noGameDataFound: 'mpg.noGameDataFound',
};

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    gameBatting,
    gamePitching,
    gameFootballDefense,
    gameFootballDefenseIdp,
    gameFootballPassing,
    gameFootballRushing,
    gameFootballReceiving,
    gameFootballKicking,
    matchupPlayerGames,
  },
}));

import {
  selectAndAssignFootballGameIdentifiers,
  selectAndAssignGameIdentifiers,
} from './game-state-manager';

type TableResults = Map<unknown, Array<{ gameIdentifier: string | null }>>;

function createMockDb(resultsByTable: TableResults) {
  const updateSetCalls: Array<Record<string, unknown>> = [];

  const db = {
    selectDistinct: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => Promise.resolve(resultsByTable.get(table) ?? [])),
      })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve([])),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn((values: Record<string, unknown>) => {
        updateSetCalls.push(values);
        return { where: jest.fn(() => Promise.resolve(undefined)) };
      }),
    })),
  };

  return { db, updateSetCalls };
}

describe('selectAndAssignGameIdentifiers', () => {
  it('marks unassigned slots as noGameDataFound, not pitcherStartSkipped, when no per-game rows exist for the season', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([
        [gameBatting, []],
        [gamePitching, []],
      ]),
    );

    await selectAndAssignGameIdentifiers(db as never, 42, 2836, 1890);

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toEqual({
      noGameDataFound: true,
      statsLoadingStatus: 'completed',
    });
    expect(updateSetCalls[0]).not.toHaveProperty('pitcherStartSkipped');
  });
});

describe('selectAndAssignFootballGameIdentifiers', () => {
  it('marks unassigned slots as noGameDataFound, not pitcherStartSkipped, when no per-game rows exist for the season', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([
        [gameFootballPassing, []],
        [gameFootballRushing, []],
        [gameFootballReceiving, []],
        [gameFootballKicking, []],
      ]),
    );

    await selectAndAssignFootballGameIdentifiers(
      db as never,
      42,
      991,
      2025,
      false,
      'WR',
    );

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toEqual({
      noGameDataFound: true,
      statsLoadingStatus: 'completed',
    });
    expect(updateSetCalls[0]).not.toHaveProperty('pitcherStartSkipped');
  });
});

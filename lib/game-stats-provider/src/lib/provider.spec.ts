import {
  getAllGameBattingStats as scrapeAllGameBattingStats,
  getAllGameFieldingStats as scrapeAllGameFieldingStats,
  getAllGamePitchingStats as scrapeAllGamePitchingStats,
} from '@legacy-sports/bref-client';
import type {
  GameBatting,
  GameFielding,
  GamePitching,
  Player,
} from '@legacy-sports/db-client';

import {
  getAllGameBattingStats,
  getAllGameFieldingStats,
  getAllGamePitchingStats,
} from './provider';
import { getSeasonPayload } from './s3-store';
import type {
  RetrosheetSeasonPayload,
  StoredBatting,
  StoredFielding,
} from './types';

jest.mock('@legacy-sports/bref-client', () => ({
  getAllGameBattingStats: jest.fn(),
  getAllGameFieldingStats: jest.fn(),
  getAllGamePitchingStats: jest.fn(),
}));

jest.mock('./s3-store', () => ({
  getSeasonPayload: jest.fn(),
}));

const mockGetSeasonPayload = jest.mocked(getSeasonPayload);
const mockScrapeBatting = jest.mocked(scrapeAllGameBattingStats);
const mockScrapePitching = jest.mocked(scrapeAllGamePitchingStats);
const mockScrapeFielding = jest.mocked(scrapeAllGameFieldingStats);

const player = { id: 42, brefId: 'freemfr01' } as Player;

const battingRow = {
  season: 2024,
  gameNum: 1,
  gameIdentifier: 'LAN202403280',
  pa: 4,
} as StoredBatting;

const fieldingRow = {
  season: 2024,
  gameNum: 1,
  gameIdentifier: 'LAN202403280',
  po: 9,
} as StoredFielding;

function payload(
  overrides: Partial<RetrosheetSeasonPayload>,
): RetrosheetSeasonPayload {
  return {
    v: 2,
    brefId: 'freemfr01',
    retroId: 'freef001',
    season: 2024,
    batting: [],
    pitching: [],
    fielding: [],
    ...overrides,
  };
}

describe('game-stats provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockScrapeBatting.mockResolvedValue([]);
    mockScrapePitching.mockResolvedValue([]);
    mockScrapeFielding.mockResolvedValue([]);
  });

  describe('when the payload has no batting and no pitching', () => {
    beforeEach(() => {
      // Fielding alone is not enough: with no batting or pitching the loader
      // would otherwise record the player-season as having no games.
      mockGetSeasonPayload.mockResolvedValue(
        payload({ fielding: [fieldingRow] }),
      );
    });

    it('falls back to the scraper for batting', async () => {
      await getAllGameBattingStats(player, 2024);
      expect(mockScrapeBatting).toHaveBeenCalledWith(player, 2024);
    });

    it('falls back to the scraper for pitching', async () => {
      await getAllGamePitchingStats(player, 2024);
      expect(mockScrapePitching).toHaveBeenCalledWith(player, 2024);
    });

    it('falls back to the scraper for fielding', async () => {
      await getAllGameFieldingStats(player, 2024, '1B');
      expect(mockScrapeFielding).toHaveBeenCalledWith(player, 2024, '1B');
    });
  });

  describe('negative control: a payload with batting rows', () => {
    beforeEach(() => {
      mockGetSeasonPayload.mockResolvedValue(
        payload({ batting: [battingRow], fielding: [fieldingRow] }),
      );
    });

    it('serves batting from the payload without scraping', async () => {
      const rows = await getAllGameBattingStats(player, 2024);
      expect(rows).toEqual([{ ...battingRow, playerId: 42 }]);
      expect(mockScrapeBatting).not.toHaveBeenCalled();
    });

    it('serves an empty pitching list without scraping', async () => {
      // A position player legitimately has no pitching lines; that is a hit.
      expect(await getAllGamePitchingStats(player, 2024)).toEqual([]);
      expect(mockScrapePitching).not.toHaveBeenCalled();
    });

    it('serves fielding from the payload without scraping', async () => {
      const rows = await getAllGameFieldingStats(player, 2024, '1B');
      expect(rows).toEqual([{ ...fieldingRow, playerId: 42 }]);
      expect(mockScrapeFielding).not.toHaveBeenCalled();
    });
  });

  it('falls back to the scraper when the object is missing', async () => {
    mockGetSeasonPayload.mockResolvedValue(null);
    await getAllGameBattingStats(player, 2024);
    expect(mockScrapeBatting).toHaveBeenCalledWith(player, 2024);
  });

  // LS-10395: BBRef serves another year's game log when the requested year
  // has none, and the scraper stamps those rows with the requested season.
  describe('rows whose game_identifier year is not the requested season', () => {
    const dalyGame = {
      season: 1890,
      gameNum: 1,
      gameIdentifier: 'BLN189809290',
    };

    beforeEach(() => {
      mockGetSeasonPayload.mockResolvedValue(null);
    });

    it('drops scraped batting rows from another year', async () => {
      mockScrapeBatting.mockResolvedValue([dalyGame as GameBatting]);
      expect(await getAllGameBattingStats(player, 1890)).toEqual([]);
    });

    it('drops scraped pitching rows from another year', async () => {
      mockScrapePitching.mockResolvedValue([dalyGame as GamePitching]);
      expect(await getAllGamePitchingStats(player, 1890)).toEqual([]);
    });

    it('drops scraped fielding rows from another year', async () => {
      mockScrapeFielding.mockResolvedValue([dalyGame as GameFielding]);
      expect(await getAllGameFieldingStats(player, 1890, 'C')).toEqual([]);
    });

    it('drops payload rows from another year', async () => {
      mockGetSeasonPayload.mockResolvedValue(
        payload({
          batting: [{ ...battingRow, gameIdentifier: 'LAN202503270' }],
        }),
      );
      expect(await getAllGameBattingStats(player, 2024)).toEqual([]);
    });

    it('keeps the in-season rows of a mixed page', async () => {
      const inSeason = { ...dalyGame, gameIdentifier: 'BLN189004190' };
      mockScrapeBatting.mockResolvedValue([
        dalyGame,
        inSeason,
      ] as GameBatting[]);
      expect(await getAllGameBattingStats(player, 1890)).toEqual([inSeason]);
    });

    it('drops rows whose game_identifier cannot be parsed', async () => {
      mockScrapeBatting.mockResolvedValue([
        { ...dalyGame, gameIdentifier: '' },
      ] as GameBatting[]);
      expect(await getAllGameBattingStats(player, 1890)).toEqual([]);
    });
  });
});

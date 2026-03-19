import type { PublicDb } from '@legacy-sports/db-client';
import {
  getSeasonBattingStatsForPlayer,
  getSeasonBattingStatsForPlayerSeason,
  getSeasonFieldingStatsForPlayerSeason,
  getSeasonPitchingStatsForPlayerSeason,
} from '@legacy-sports/db-client';
import {
  getEligibleSeasonsForPlayer,
  validatePlayerSeasonEligibility,
} from './season-validator';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  getSeasonBattingStatsForPlayer: jest.fn(),
  getSeasonBattingStatsForPlayerSeason: jest.fn(),
  getSeasonPitchingStatsForPlayerSeason: jest.fn(),
  getSeasonFieldingStatsForPlayerSeason: jest.fn(),
}));

// Cast to jest.Mock to allow partial mock data without full type matching
const mockedGetSeasonBattingStatsForPlayer =
  getSeasonBattingStatsForPlayer as unknown as jest.Mock;
const mockedGetSeasonBattingStatsForPlayerSeason =
  getSeasonBattingStatsForPlayerSeason as unknown as jest.Mock;
const mockedGetSeasonPitchingStatsForPlayerSeason =
  getSeasonPitchingStatsForPlayerSeason as unknown as jest.Mock;
const mockedGetSeasonFieldingStatsForPlayerSeason =
  getSeasonFieldingStatsForPlayerSeason as unknown as jest.Mock;

const db = {} as PublicDb;

describe('season-validator', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validatePlayerSeasonEligibility', () => {
    it('should return eligible for player with sufficient games', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 90, pos: 'SS' },
      ]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023, 50);

      expect(result.isEligible).toBe(true);
      expect(result.battingGames).toBe(100);
      expect(result.fieldingGames).toBe(90);
      expect(result.reason).toBeUndefined();
    });

    it('should return not eligible for player with insufficient games', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 5 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 3, pos: 'OF' },
      ]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023, 50);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('only 5 games');
      expect(result.reason).toContain('minimum required is 50');
    });

    it('should return not eligible for player with no fielding stats', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('no fielding stats');
    });

    it('should use max across batting, pitching, and fielding for total games', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 10 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 30 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 25, pos: 'P' },
      ]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023, 20);

      expect(result.isEligible).toBe(true);
      expect(result.pitchingGames).toBe(30);
    });

    it('should handle null game counts as zero', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue(null);
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue(null);
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023, 1);

      expect(result.isEligible).toBe(false);
      expect(result.battingGames).toBe(0);
      expect(result.pitchingGames).toBe(0);
    });

    it('should use the max fielding games across positions', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 50 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 30, pos: 'SS' },
        { g: 45, pos: '2B' },
        { g: 10, pos: 'OF' },
      ]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023);

      expect(result.fieldingGames).toBe(45);
      expect(result.isEligible).toBe(true);
    });

    it('should default minGamesRequired to 1', async () => {
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 1 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 1, pos: 'OF' },
      ]);

      const result = await validatePlayerSeasonEligibility(db, 1, 2023);

      expect(result.isEligible).toBe(true);
    });
  });

  describe('getEligibleSeasonsForPlayer', () => {
    it('should return list of eligible seasons for a player', async () => {
      mockedGetSeasonBattingStatsForPlayer.mockResolvedValue([
        { season: 2021 },
        { season: 2022 },
        { season: 2023 },
      ]);

      // All seasons are eligible
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 80, pos: 'SS' },
      ]);

      const result = await getEligibleSeasonsForPlayer(db, 1);

      expect(result).toEqual([2021, 2022, 2023]);
    });

    it('should filter out seasons with insufficient games', async () => {
      mockedGetSeasonBattingStatsForPlayer.mockResolvedValue([
        { season: 2021 },
        { season: 2022 },
        { season: 2023 },
      ]);

      // Make 2022 ineligible by returning no fielding stats for it
      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockImplementation(
        (_db: unknown, _playerId: unknown, season: number) => {
          if (season === 2022) return Promise.resolve([]);
          return Promise.resolve([{ g: 80, pos: 'OF' }]);
        },
      );

      const result = await getEligibleSeasonsForPlayer(db, 1);

      expect(result).toEqual([2021, 2023]);
      expect(result).not.toContain(2022);
    });

    it('should return empty array when player has no seasons', async () => {
      mockedGetSeasonBattingStatsForPlayer.mockResolvedValue([]);

      const result = await getEligibleSeasonsForPlayer(db, 999);

      expect(result).toEqual([]);
    });

    it('should return seasons sorted ascending', async () => {
      mockedGetSeasonBattingStatsForPlayer.mockResolvedValue([
        { season: 2023 },
        { season: 2020 },
        { season: 2021 },
      ]);

      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 80, pos: 'SS' },
      ]);

      const result = await getEligibleSeasonsForPlayer(db, 1);

      expect(result).toEqual([2020, 2021, 2023]);
    });

    it('should deduplicate seasons from batting stats', async () => {
      mockedGetSeasonBattingStatsForPlayer.mockResolvedValue([
        { season: 2023 },
        { season: 2023 },
        { season: 2022 },
      ]);

      mockedGetSeasonBattingStatsForPlayerSeason.mockResolvedValue({ g: 100 });
      mockedGetSeasonPitchingStatsForPlayerSeason.mockResolvedValue({ g: 0 });
      mockedGetSeasonFieldingStatsForPlayerSeason.mockResolvedValue([
        { g: 80, pos: 'OF' },
      ]);

      const result = await getEligibleSeasonsForPlayer(db, 1);

      expect(result).toEqual([2022, 2023]);
    });
  });
});

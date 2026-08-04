/**
 * Unit tests for matchup projections engine
 */

import {
  calculateMatchupProjection,
  type SeasonStats,
} from './matchup-projections';
import type { ScoringSettings } from './matchup-scoring';

describe('Matchup Projections Engine', () => {
  const mockScoringSettings: ScoringSettings = {
    batting: {
      h: 1,
      hr: 3,
      r: 1,
      rbi: 1,
      sb: 1,
      cs: -1,
    },
    pitching: {
      w: 2,
      l: -2,
      sv: 3,
      so: 1,
      outsRecorded: 1,
    },
    fielding: {
      eDef: -1,
    },
  };

  describe('calculateMatchupProjection', () => {
    it('should calculate season batting projection per game', () => {
      const seasonStats: SeasonStats = {
        playerId: 1,
        season: 2023,
        battingStats: {
          g: 50,
          h: 60,
          hr: 15,
          r: 30,
          rbi: 40,
        },
      };

      const result = calculateMatchupProjection(
        seasonStats,
        mockScoringSettings,
      );

      // Per 50 games: h: 60*1 = 60, hr: 15*3 = 45, r: 30*1 = 30, rbi: 40*1 = 40
      // Total: 60 + 45 + 30 + 40 = 175
      // Per game: 175 / 50 = 3.5
      expect(result.totalPerGame).toBe(3.5);
      expect(result.gamesPlayed).toBe(50);
    });

    it('should calculate season pitching projection per game', () => {
      const seasonStats: SeasonStats = {
        playerId: 2,
        season: 2023,
        pitchingStats: {
          g: 30,
          w: 10,
          l: 5,
          so: 150,
        },
      };

      const result = calculateMatchupProjection(
        seasonStats,
        mockScoringSettings,
      );

      // Per 30 games: w: 10*2 = 20, l: 5*-2 = -10, so: 150*1 = 150
      // Total: 20 - 10 + 150 = 160
      // Per game: 160 / 30 = 5.333...
      expect(result.totalPerGame).toBeCloseTo(5.333, 3);
      expect(result.gamesPlayed).toBe(30);
    });

    it('should return 0 for season with no games', () => {
      const seasonStats: SeasonStats = {
        playerId: 3,
        season: 2023,
        battingStats: {
          g: 0,
          h: 0,
        },
      };

      const result = calculateMatchupProjection(
        seasonStats,
        mockScoringSettings,
      );

      expect(result.totalPerGame).toBe(0);
      expect(result.gamesPlayed).toBe(0);
    });
  });
});

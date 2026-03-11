/**
 * Unit tests for matchup projections engine
 */

import {
  calculateCareerProjection,
  calculateMatchupProjection,
  calculatePlayerProjections,
  type CareerStats,
  compareProjections,
  projectRemainingScore,
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

  describe('calculateCareerProjection', () => {
    it('should calculate career batting projection per game', () => {
      const careerStats: CareerStats = {
        playerId: 1,
        battingStats: {
          g: 100,
          h: 100,
          hr: 20,
          r: 50,
          rbi: 60,
          sb: 10,
          cs: 5,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Per 100 games: h: 100*1 = 100, hr: 20*3 = 60, r: 50*1 = 50, rbi: 60*1 = 60, sb: 10*1 = 10, cs: 5*-1 = -5
      // Total: 100 + 60 + 50 + 60 + 10 - 5 = 275
      // Per game: 275 / 100 = 2.75
      expect(result.totalPerGame).toBe(2.75);
      expect(result.battingPerGame).toBe(2.75);
      expect(result.pitchingPerGame).toBe(0);
      expect(result.fieldingPerGame).toBe(0);
      expect(result.gamesPlayed).toBe(100);
    });

    it('should calculate career pitching projection per game', () => {
      const careerStats: CareerStats = {
        playerId: 2,
        pitchingStats: {
          g: 50,
          w: 15,
          l: 10,
          sv: 5,
          so: 200,
          outsRecorded: 450,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Per 50 games: w: 15*2 = 30, l: 10*-2 = -20, sv: 5*3 = 15, so: 200*1 = 200, outsRecorded: 450*1 = 450
      // Total: 30 - 20 + 15 + 200 + 450 = 675
      // Per game: 675 / 50 = 13.5
      expect(result.totalPerGame).toBe(13.5);
      expect(result.battingPerGame).toBe(0);
      expect(result.pitchingPerGame).toBe(13.5);
      expect(result.fieldingPerGame).toBe(0);
      expect(result.gamesPlayed).toBe(50);
    });

    it('should calculate career fielding projection per game', () => {
      const careerStats: CareerStats = {
        playerId: 3,
        fieldingStats: {
          g: 150,
          eDef: 10,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Per 150 games: eDef: 10*-1 = -10
      // Per game: -10 / 150 = -0.0666...
      expect(result.totalPerGame).toBeCloseTo(-0.0667, 4);
      expect(result.battingPerGame).toBe(0);
      expect(result.pitchingPerGame).toBe(0);
      expect(result.fieldingPerGame).toBeCloseTo(-0.0667, 4);
      expect(result.gamesPlayed).toBe(150);
    });

    it('should handle combined batting and fielding stats', () => {
      const careerStats: CareerStats = {
        playerId: 4,
        battingStats: {
          g: 100,
          h: 100,
        },
        fieldingStats: {
          g: 100,
          eDef: 5,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Batting: 100*1 / 100 = 1.0
      // Fielding: 5*-1 / 100 = -0.05
      // Total: 1.0 - 0.05 = 0.95
      expect(result.totalPerGame).toBeCloseTo(0.95, 4);
      expect(result.gamesPlayed).toBe(100);
    });

    it('should return 0 for player with no games', () => {
      const careerStats: CareerStats = {
        playerId: 5,
        battingStats: {
          g: 0,
          h: 0,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      expect(result.totalPerGame).toBe(0);
      expect(result.gamesPlayed).toBe(0);
    });

    it('should handle null stats gracefully', () => {
      const careerStats: CareerStats = {
        playerId: 6,
        battingStats: {
          g: 100,
          h: null,
          hr: 20,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Only hr counts: 20*3 / 100 = 0.6
      expect(result.totalPerGame).toBe(0.6);
    });

    it('should use maximum games from different stat categories', () => {
      const careerStats: CareerStats = {
        playerId: 7,
        battingStats: {
          g: 100,
          h: 100,
        },
        pitchingStats: {
          g: 50,
          w: 10,
        },
        fieldingStats: {
          g: 120,
          eDef: 5,
        },
      };

      const result = calculateCareerProjection(
        careerStats,
        mockScoringSettings,
      );

      // Should use maximum games (120 from fielding)
      expect(result.gamesPlayed).toBe(120);
    });
  });

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

  describe('calculatePlayerProjections', () => {
    it('should calculate both career and matchup projections', () => {
      const careerStats: CareerStats = {
        playerId: 1,
        battingStats: {
          g: 100,
          h: 100,
          hr: 20,
        },
      };

      const seasonStats: SeasonStats = {
        playerId: 1,
        season: 2023,
        battingStats: {
          g: 50,
          h: 60,
          hr: 15,
        },
      };

      const result = calculatePlayerProjections(
        careerStats,
        seasonStats,
        mockScoringSettings,
      );

      expect(result.playerId).toBe(1);
      expect(result.careerProjection).toBeDefined();
      expect(result.matchupProjection).not.toBeNull();
      expect(result.selectedSeason).toBe(2023);

      // Career: (100*1 + 20*3) / 100 = 1.6
      expect(result.careerProjection.totalPerGame).toBe(1.6);

      // Season: (60*1 + 15*3) / 50 = 2.1
      expect(result.matchupProjection?.totalPerGame).toBe(2.1);
    });

    it('should handle null season stats', () => {
      const careerStats: CareerStats = {
        playerId: 1,
        battingStats: {
          g: 100,
          h: 100,
        },
      };

      const result = calculatePlayerProjections(careerStats, null);

      expect(result.careerProjection).toBeDefined();
      expect(result.matchupProjection).toBeNull();
      expect(result.selectedSeason).toBeNull();
    });

    it('should use default scoring settings when not provided', () => {
      const careerStats: CareerStats = {
        playerId: 1,
        battingStats: {
          g: 100,
          h: 100,
        },
      };

      const result = calculatePlayerProjections(careerStats, null);

      expect(result.careerProjection.totalPerGame).toBeGreaterThan(0);
    });
  });

  describe('projectRemainingScore', () => {
    it('should project score for remaining games', () => {
      const projection = {
        totalPerGame: 2.5,
        battingPerGame: 2.0,
        pitchingPerGame: 0.5,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = projectRemainingScore(projection, 10);

      expect(result).toBe(25); // 2.5 * 10
    });

    it('should return 0 for 0 remaining games', () => {
      const projection = {
        totalPerGame: 2.5,
        battingPerGame: 2.0,
        pitchingPerGame: 0.5,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = projectRemainingScore(projection, 0);

      expect(result).toBe(0);
    });

    it('should handle negative projections', () => {
      const projection = {
        totalPerGame: -0.5,
        battingPerGame: 0,
        pitchingPerGame: 0,
        fieldingPerGame: -0.5,
        gamesPlayed: 50,
      };

      const result = projectRemainingScore(projection, 10);

      expect(result).toBe(-5); // -0.5 * 10
    });
  });

  describe('compareProjections', () => {
    it('should calculate positive percentage when performing above career average', () => {
      const careerProjection = {
        totalPerGame: 2.0,
        battingPerGame: 2.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 100,
      };

      const matchupProjection = {
        totalPerGame: 3.0,
        battingPerGame: 3.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = compareProjections(careerProjection, matchupProjection);

      expect(result).toBe(50); // (3.0 - 2.0) / 2.0 * 100 = 50%
    });

    it('should calculate negative percentage when performing below career average', () => {
      const careerProjection = {
        totalPerGame: 2.0,
        battingPerGame: 2.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 100,
      };

      const matchupProjection = {
        totalPerGame: 1.5,
        battingPerGame: 1.5,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = compareProjections(careerProjection, matchupProjection);

      expect(result).toBe(-25); // (1.5 - 2.0) / 2.0 * 100 = -25%
    });

    it('should return 0 when career average is 0', () => {
      const careerProjection = {
        totalPerGame: 0,
        battingPerGame: 0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 0,
      };

      const matchupProjection = {
        totalPerGame: 2.0,
        battingPerGame: 2.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = compareProjections(careerProjection, matchupProjection);

      expect(result).toBe(0);
    });

    it('should handle identical projections', () => {
      const projection = {
        totalPerGame: 2.5,
        battingPerGame: 2.5,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 50,
      };

      const result = compareProjections(projection, projection);

      expect(result).toBe(0);
    });

    it('should identify hot streak (>20% above career)', () => {
      const careerProjection = {
        totalPerGame: 2.0,
        battingPerGame: 2.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 100,
      };

      const matchupProjection = {
        totalPerGame: 2.5,
        battingPerGame: 2.5,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 30,
      };

      const result = compareProjections(careerProjection, matchupProjection);

      expect(result).toBe(25); // Hot streak indicator
      expect(result).toBeGreaterThan(20);
    });

    it('should identify cold streak (<-20% below career)', () => {
      const careerProjection = {
        totalPerGame: 2.0,
        battingPerGame: 2.0,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 100,
      };

      const matchupProjection = {
        totalPerGame: 1.5,
        battingPerGame: 1.5,
        pitchingPerGame: 0,
        fieldingPerGame: 0,
        gamesPlayed: 30,
      };

      const result = compareProjections(careerProjection, matchupProjection);

      expect(result).toBe(-25); // Cold streak indicator
      expect(result).toBeLessThan(-20);
    });
  });
});

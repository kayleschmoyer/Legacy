/**
 * Unit tests for matchup scoring engine
 */

import {
  type AggregatedPlayerStats,
  aggregatePlayerStats,
  calculateMatchupScore,
  calculatePlayerScore,
  calculateTeamScore,
  getDefaultScoringSettings,
  type PlayerGameStats,
  type ScoringSettings,
} from './matchup-scoring';

describe('Matchup Scoring Engine', () => {
  const mockScoringSettings: ScoringSettings = {
    batting: {
      h: 1,
      hr: 3,
      r: 1,
      rbi: 1,
      sb: 1,
      cs: -1,
      so: -0.5,
      doubles: 1,
      triples: 2,
      hbp: 1,
    },
    pitching: {
      w: 2,
      l: -2,
      sv: 3,
      so: 1,
      outsRecorded: 1,
      h: -1,
      er: -2,
      bb: -1,
    },
    fielding: {
      eDef: -1,
    },
  };

  describe('aggregatePlayerStats', () => {
    it('should aggregate batting stats across multiple games', () => {
      const gameStats: PlayerGameStats[] = [
        {
          playerId: 1,
          season: 2023,
          gameNum: 1,
          batting: { h: 2, hr: 1, r: 2, rbi: 3, ab: 4, pa: 5 },
        },
        {
          playerId: 1,
          season: 2023,
          gameNum: 2,
          batting: { h: 1, hr: 0, r: 1, rbi: 1, ab: 4, pa: 4 },
        },
        {
          playerId: 1,
          season: 2023,
          gameNum: 3,
          batting: { h: 3, hr: 2, r: 3, rbi: 4, ab: 5, pa: 5 },
        },
      ];

      const result = aggregatePlayerStats(gameStats);

      expect(result.playerId).toBe(1);
      expect(result.totalGames).toBe(3);
      expect(result.battingStats.h).toBe(6);
      expect(result.battingStats.hr).toBe(3);
      expect(result.battingStats.r).toBe(6);
      expect(result.battingStats.rbi).toBe(8);
      expect(result.battingStats.ab).toBe(13);
      expect(result.battingStats.pa).toBe(14);
    });

    it('should aggregate pitching stats across multiple games', () => {
      const gameStats: PlayerGameStats[] = [
        {
          playerId: 2,
          season: 2023,
          gameNum: 1,
          pitching: { w: 1, l: 0, so: 8, outsRecorded: 21, h: 5, er: 2 },
        },
        {
          playerId: 2,
          season: 2023,
          gameNum: 2,
          pitching: { w: 0, l: 1, so: 6, outsRecorded: 18, h: 7, er: 4 },
        },
      ];

      const result = aggregatePlayerStats(gameStats);

      expect(result.playerId).toBe(2);
      expect(result.totalGames).toBe(2);
      expect(result.pitchingStats.w).toBe(1);
      expect(result.pitchingStats.l).toBe(1);
      expect(result.pitchingStats.so).toBe(14);
      expect(result.pitchingStats.outsRecorded).toBe(39);
      expect(result.pitchingStats.h).toBe(12);
      expect(result.pitchingStats.er).toBe(6);
    });

    it('should aggregate fielding stats across multiple games', () => {
      const gameStats: PlayerGameStats[] = [
        {
          playerId: 3,
          season: 2023,
          gameNum: 1,
          fielding: { po: 10, a: 2, eDef: 0, innDef: 9.0 },
        },
        {
          playerId: 3,
          season: 2023,
          gameNum: 2,
          fielding: { po: 8, a: 3, eDef: 1, innDef: 9.0 },
        },
      ];

      const result = aggregatePlayerStats(gameStats);

      expect(result.playerId).toBe(3);
      expect(result.totalGames).toBe(2);
      expect(result.fieldingStats.po).toBe(18);
      expect(result.fieldingStats.a).toBe(5);
      expect(result.fieldingStats.eDef).toBe(1);
      expect(result.fieldingStats.innDef).toBe(18.0);
    });

    it('should handle games with no stats', () => {
      const gameStats: PlayerGameStats[] = [
        {
          playerId: 4,
          season: 2023,
          gameNum: 1,
        },
        {
          playerId: 4,
          season: 2023,
          gameNum: 2,
        },
      ];

      const result = aggregatePlayerStats(gameStats);

      expect(result.playerId).toBe(4);
      expect(result.totalGames).toBe(2);
      expect(Object.keys(result.battingStats).length).toBe(0);
      expect(Object.keys(result.pitchingStats).length).toBe(0);
      expect(Object.keys(result.fieldingStats).length).toBe(0);
    });

    it('should handle null values in stats', () => {
      const gameStats: PlayerGameStats[] = [
        {
          playerId: 5,
          season: 2023,
          gameNum: 1,
          batting: { h: 2, hr: null, r: 1, rbi: null },
        },
      ];

      const result = aggregatePlayerStats(gameStats);

      expect(result.battingStats.h).toBe(2);
      expect(result.battingStats.r).toBe(1);
      expect(result.battingStats.hr).toBeUndefined();
      expect(result.battingStats.rbi).toBeUndefined();
    });

    it('should throw error for empty game stats array', () => {
      expect(() => aggregatePlayerStats([])).toThrow(
        'No game stats provided for aggregation',
      );
    });
  });

  describe('calculatePlayerScore', () => {
    it('should calculate batting score correctly', () => {
      const aggregated: AggregatedPlayerStats = {
        playerId: 1,
        totalGames: 3,
        battingStats: { h: 6, hr: 3, r: 6, rbi: 8, sb: 2, cs: 1 },
        pitchingStats: {},
        fieldingStats: {},
      };

      const result = calculatePlayerScore(aggregated, mockScoringSettings);

      // h: 6*1 = 6, hr: 3*3 = 9, r: 6*1 = 6, rbi: 8*1 = 8, sb: 2*1 = 2, cs: 1*-1 = -1
      // Total: 6 + 9 + 6 + 8 + 2 - 1 = 30
      expect(result.totalScore).toBe(30);
      expect(result.battingScore).toBe(30);
      expect(result.pitchingScore).toBe(0);
      expect(result.fieldingScore).toBe(0);
      expect(result.gamesPlayed).toBe(3);
    });

    it('should calculate pitching score correctly', () => {
      const aggregated: AggregatedPlayerStats = {
        playerId: 2,
        totalGames: 2,
        battingStats: {},
        pitchingStats: { w: 1, l: 1, so: 14, outsRecorded: 39, h: 12, er: 6 },
        fieldingStats: {},
      };

      const result = calculatePlayerScore(aggregated, mockScoringSettings);

      // w: 1*2 = 2, l: 1*-2 = -2, so: 14*1 = 14, outsRecorded: 39*1 = 39, h: 12*-1 = -12, er: 6*-2 = -12
      // Total: 2 - 2 + 14 + 39 - 12 - 12 = 29
      expect(result.totalScore).toBe(29);
      expect(result.battingScore).toBe(0);
      expect(result.pitchingScore).toBe(29);
      expect(result.fieldingScore).toBe(0);
    });

    it('should calculate fielding score correctly', () => {
      const aggregated: AggregatedPlayerStats = {
        playerId: 3,
        totalGames: 2,
        battingStats: {},
        pitchingStats: {},
        fieldingStats: { eDef: 2 },
      };

      const result = calculatePlayerScore(aggregated, mockScoringSettings);

      // eDef: 2*-1 = -2
      expect(result.totalScore).toBe(-2);
      expect(result.battingScore).toBe(0);
      expect(result.pitchingScore).toBe(0);
      expect(result.fieldingScore).toBe(-2);
    });

    it('should calculate combined score for multi-category player', () => {
      const aggregated: AggregatedPlayerStats = {
        playerId: 4,
        totalGames: 5,
        battingStats: { h: 10, hr: 2 },
        pitchingStats: {},
        fieldingStats: { eDef: 1 },
      };

      const result = calculatePlayerScore(aggregated, mockScoringSettings);

      // Batting: h: 10*1 = 10, hr: 2*3 = 6 = 16
      // Fielding: eDef: 1*-1 = -1
      // Total: 16 - 1 = 15
      expect(result.totalScore).toBe(15);
      expect(result.battingScore).toBe(16);
      expect(result.pitchingScore).toBe(0);
      expect(result.fieldingScore).toBe(-1);
    });
  });

  describe('calculateTeamScore', () => {
    it('should calculate total team score from multiple players', () => {
      const playerGameStats = new Map<number, PlayerGameStats[]>([
        [
          1,
          [{ playerId: 1, season: 2023, gameNum: 1, batting: { h: 3, hr: 1 } }],
        ],
        [
          2,
          [
            {
              playerId: 2,
              season: 2023,
              gameNum: 1,
              pitching: { w: 1, so: 10 },
            },
          ],
        ],
        [3, [{ playerId: 3, season: 2023, gameNum: 1, fielding: { eDef: 1 } }]],
      ]);

      const result = calculateTeamScore(
        100,
        playerGameStats,
        5,
        mockScoringSettings,
      );

      expect(result.teamId).toBe(100);
      expect(result.playerScores).toHaveLength(3);
      expect(result.gamesSelected).toBe(3);
      expect(result.gamesRemaining).toBe(2);
      // Player 1: h: 3*1 + hr: 1*3 = 6
      // Player 2: w: 1*2 + so: 10*1 = 12
      // Player 3: eDef: 1*-1 = -1
      // Total: 6 + 12 - 1 = 17
      expect(result.totalScore).toBe(17);
    });

    it('should handle team with no player stats', () => {
      const playerGameStats = new Map<number, PlayerGameStats[]>();

      const result = calculateTeamScore(
        100,
        playerGameStats,
        5,
        mockScoringSettings,
      );

      expect(result.teamId).toBe(100);
      expect(result.playerScores).toHaveLength(0);
      expect(result.totalScore).toBe(0);
      expect(result.gamesSelected).toBe(0);
      expect(result.gamesRemaining).toBe(5);
    });

    it('should correctly track games remaining', () => {
      const playerGameStats = new Map<number, PlayerGameStats[]>([
        [
          1,
          [
            { playerId: 1, season: 2023, gameNum: 1, batting: { h: 2 } },
            { playerId: 1, season: 2023, gameNum: 2, batting: { h: 1 } },
            { playerId: 1, season: 2023, gameNum: 3, batting: { h: 3 } },
          ],
        ],
        [2, [{ playerId: 2, season: 2023, gameNum: 1, batting: { h: 1 } }]],
      ]);

      const result = calculateTeamScore(
        100,
        playerGameStats,
        10,
        mockScoringSettings,
      );

      expect(result.gamesSelected).toBe(4); // 3 + 1
      expect(result.gamesRemaining).toBe(6); // 10 - 4
    });

    it('should handle large rosters efficiently', () => {
      const playerGameStats = new Map<number, PlayerGameStats[]>();

      // Create 25 players with 5 games each
      for (let i = 1; i <= 25; i++) {
        const games: PlayerGameStats[] = [];
        for (let g = 1; g <= 5; g++) {
          games.push({
            playerId: i,
            season: 2023,
            gameNum: g,
            batting: { h: 1, hr: 0 },
          });
        }
        playerGameStats.set(i, games);
      }

      const startTime = Date.now();
      const result = calculateTeamScore(
        100,
        playerGameStats,
        125,
        mockScoringSettings,
      );
      const endTime = Date.now();

      expect(result.playerScores).toHaveLength(25);
      expect(result.gamesSelected).toBe(125);
      expect(result.gamesRemaining).toBe(0);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
    });
  });

  describe('calculateMatchupScore', () => {
    it('should calculate scores for both teams', () => {
      const team1Stats = new Map<number, PlayerGameStats[]>([
        [
          1,
          [{ playerId: 1, season: 2023, gameNum: 1, batting: { h: 3, hr: 1 } }],
        ],
      ]);

      const team2Stats = new Map<number, PlayerGameStats[]>([
        [
          2,
          [{ playerId: 2, season: 2023, gameNum: 1, batting: { h: 2, hr: 2 } }],
        ],
      ]);

      const result = calculateMatchupScore(
        999,
        100,
        200,
        team1Stats,
        team2Stats,
        5,
        mockScoringSettings,
      );

      expect(result.matchupId).toBe(999);
      expect(result.team1Score).not.toBeNull();
      expect(result.team2Score).not.toBeNull();
      const team1Score = result.team1Score;
      const team2Score = result.team2Score;
      if (!team1Score || !team2Score) return;
      expect(team1Score.teamId).toBe(100);
      expect(team2Score.teamId).toBe(200);
      expect(result.gamesPerMatchup).toBe(5);
    });

    it('should handle null team IDs', () => {
      const emptyStats = new Map<number, PlayerGameStats[]>();

      const result = calculateMatchupScore(
        999,
        null,
        null,
        emptyStats,
        emptyStats,
        5,
        mockScoringSettings,
      );

      expect(result.team1Score).toBeNull();
      expect(result.team2Score).toBeNull();
    });

    it('should use default scoring settings when not provided', () => {
      const team1Stats = new Map<number, PlayerGameStats[]>([
        [1, [{ playerId: 1, season: 2023, gameNum: 1, batting: { h: 1 } }]],
      ]);

      const result = calculateMatchupScore(
        999,
        100,
        200,
        team1Stats,
        new Map(),
        5,
      );

      expect(result.team1Score).not.toBeNull();
      const score = result.team1Score;
      if (!score) return;
      expect(score.totalScore).toBeGreaterThan(0);
    });
  });

  describe('getDefaultScoringSettings', () => {
    it('should return valid default scoring settings', () => {
      const settings = getDefaultScoringSettings();

      expect(settings.batting).toBeDefined();
      expect(settings.pitching).toBeDefined();
      expect(settings.fielding).toBeDefined();
      expect(typeof settings.batting.h).toBe('number');
      expect(typeof settings.pitching.w).toBe('number');
      expect(typeof settings.fielding.eDef).toBe('number');
    });

    it('should return a new object each time (not mutate original)', () => {
      const settings1 = getDefaultScoringSettings();
      const settings2 = getDefaultScoringSettings();

      settings1.batting.h = 999;

      expect(settings2.batting.h).not.toBe(999);
    });
  });
});

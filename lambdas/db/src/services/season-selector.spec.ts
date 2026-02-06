import { PlayerSeasonStats, selectSeasonsForPlayers } from './season-selector';

describe('season-selector', () => {
  describe('selectSeasonsForPlayers', () => {
    it('should select seasons for players with only batting stats', () => {
      const playerIds = [1, 2];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 50 },
        { playerId: 1, season: 2021, g: 60 },
        { playerId: 2, season: 2020, g: 55 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(2);
      expect(result.skippedPlayers).toHaveLength(0);
      expect(result.selections.every((s) => s.leagueId === 1)).toBe(true);
      expect(result.selections.every((s) => s.weekNumber === 1)).toBe(true);
    });

    it('should select seasons for players with only pitching stats', () => {
      const playerIds = [1, 2];
      const battingStats: PlayerSeasonStats[] = [];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 30 },
        { playerId: 1, season: 2021, g: 25 },
        { playerId: 2, season: 2020, g: 28 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(2);
      expect(result.skippedPlayers).toHaveLength(0);
      // Verify pitcher-only players get seasons
      const player1Selection = result.selections.find((s) => s.playerId === 1);
      const player2Selection = result.selections.find((s) => s.playerId === 2);
      expect(player1Selection).toBeDefined();
      expect(player2Selection).toBeDefined();
    });

    it('should select seasons for players with both batting and pitching stats', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 50 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 30 },
        { playerId: 1, season: 2021, g: 25 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(1);
      expect(result.skippedPlayers).toHaveLength(0);
      // Should have 2020 and 2021 as options (2020 from both, 2021 from pitching only)
      const selection = result.selections[0];
      expect([2020, 2021]).toContain(selection.season);
    });

    it('should use the max games between batting and pitching for the same season', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 5 }, // Below threshold
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 20 }, // Above threshold
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].season).toBe(2020);
      expect(result.skippedPlayers).toHaveLength(0);
    });

    it('should skip players with no stats', () => {
      const playerIds = [1, 2];
      const battingStats: PlayerSeasonStats[] = [];
      const pitchingStats: PlayerSeasonStats[] = [];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(0);
      expect(result.skippedPlayers).toHaveLength(2);
      expect(result.skippedPlayers[0].playerId).toBe(1);
      expect(result.skippedPlayers[1].playerId).toBe(2);
    });

    it('should skip players with stats below minimum games threshold', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 5 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2021, g: 8 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(0);
      expect(result.skippedPlayers).toHaveLength(1);
      expect(result.skippedPlayers[0].reason).toContain(
        'No seasons with at least 10 games',
      );
    });

    it('should handle null game counts as zero', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: null },
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2021, g: 20 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].season).toBe(2021);
    });

    it('should filter seasons to only those meeting minimum games', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2019, g: 5 },
        { playerId: 1, season: 2020, g: 50 },
        { playerId: 1, season: 2021, g: 8 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(1);
      // Should only select from 2020 (the only season with >= 10 games)
      expect(result.selections[0].season).toBe(2020);
    });

    it('should handle real-world fielding-only scenario (Sam Bowen)', () => {
      // Sam Bowen: player_id 2098, 12 fielding games in 1980, 7 batting games
      // Fielding games: 6g OF, 4g CF, 1g LF, 1g RF = 12 total
      const playerIds = [2098];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 2098, season: 1980, g: 7 }, // Below threshold
      ];
      const pitchingStats: PlayerSeasonStats[] = [];
      const fieldingStats: PlayerSeasonStats[] = [
        { playerId: 2098, season: 1980, g: 6 }, // OF
        { playerId: 2098, season: 1980, g: 4 }, // CF
        { playerId: 2098, season: 1980, g: 1 }, // LF
        { playerId: 2098, season: 1980, g: 1 }, // RF
      ];
      const minGames = 10; // League requires minimum 10 games

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      // Sam should get 1980 season selected based on fielding (12 total games)
      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].playerId).toBe(2098);
      expect(result.selections[0].season).toBe(1980);
      expect(result.skippedPlayers).toHaveLength(0);
    });

    it('should handle real-world pitcher-only scenario (Noah Cameron)', () => {
      // Noah Cameron: player_id 3082, 24 pitching games in 2025, 0 batting games
      const playerIds = [3082];
      const battingStats: PlayerSeasonStats[] = [];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 3082, season: 2025, g: 24 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10; // League requires minimum 10 games

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        4,
        1,
      );

      // Noah should get a season selected
      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].playerId).toBe(3082);
      expect(result.selections[0].season).toBe(2025);
      expect(result.selections[0].leagueId).toBe(4);
      expect(result.selections[0].weekNumber).toBe(1);
      expect(result.skippedPlayers).toHaveLength(0);
    });

    it('should handle mixed player types in one batch', () => {
      const playerIds = [1, 2, 3, 4];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 50 }, // Batter only
        { playerId: 3, season: 2020, g: 40 }, // Two-way player
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 2, season: 2020, g: 30 }, // Pitcher only
        { playerId: 3, season: 2020, g: 25 }, // Two-way player
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      // Players 1, 2, 3 should get seasons; player 4 should be skipped
      expect(result.selections).toHaveLength(3);
      expect(result.skippedPlayers).toHaveLength(1);
      expect(result.skippedPlayers[0].playerId).toBe(4);
    });

    it('should provide detailed skip reasons with batting and pitching season info', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2019, g: 5 },
        { playerId: 1, season: 2020, g: 8 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2021, g: 3 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.skippedPlayers).toHaveLength(1);
      const skipped = result.skippedPlayers[0];
      expect(skipped.battingSeasons).toEqual(['2019(5g)', '2020(8g)']);
      expect(skipped.pitchingSeasons).toEqual(['2021(3g)']);
      expect(skipped.reason).toContain('No seasons with at least 10 games');
    });

    it('should not duplicate seasons when player has same season in batting and pitching', () => {
      const playerIds = [1];
      const battingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 50 },
        { playerId: 1, season: 2021, g: 60 },
      ];
      const pitchingStats: PlayerSeasonStats[] = [
        { playerId: 1, season: 2020, g: 30 },
        { playerId: 1, season: 2021, g: 25 },
      ];
      const fieldingStats: PlayerSeasonStats[] = [];
      const minGames = 10;

      const result = selectSeasonsForPlayers(
        playerIds,
        battingStats,
        pitchingStats,
        fieldingStats,
        minGames,
        1,
        1,
      );

      expect(result.selections).toHaveLength(1);
      // Should have exactly 2 available seasons (2020, 2021), not 4
      const selection = result.selections[0];
      expect([2020, 2021]).toContain(selection.season);
    });
  });
});

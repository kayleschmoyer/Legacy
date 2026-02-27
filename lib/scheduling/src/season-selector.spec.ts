/**
 * Tests for season selection logic
 */

import {
  determineEligibleSeasons,
  type SeasonEligibilityParams,
  type SeasonSelectionParams,
  selectRandomSeason,
  validateSeasonForMatchup,
} from './season-selector';
import type { PlayerGameCount, SeasonInfo, TeamRoster } from './types';

describe('determineEligibleSeasons', () => {
  it('should return eligible seasons when all players meet threshold', () => {
    const teamRosters: TeamRoster[] = [
      { teamId: 1, playerIds: [101, 102] },
      { teamId: 2, playerIds: [201, 202] },
    ];

    const playerGameCounts: PlayerGameCount[] = [
      { playerId: 101, season: 2023, gamesPlayed: 150 },
      { playerId: 102, season: 2023, gamesPlayed: 140 },
      { playerId: 201, season: 2023, gamesPlayed: 160 },
      { playerId: 202, season: 2023, gamesPlayed: 130 },
      { playerId: 101, season: 2022, gamesPlayed: 120 },
      { playerId: 102, season: 2022, gamesPlayed: 110 },
      { playerId: 201, season: 2022, gamesPlayed: 100 },
      { playerId: 202, season: 2022, gamesPlayed: 105 },
    ];

    const params: SeasonEligibilityParams = {
      teamRosters,
      playerGameCounts,
      minGamesPerSeason: 100,
    };

    const result = determineEligibleSeasons(params);

    expect(result).toHaveLength(2);
    expect(result[0].season).toBe(2023); // Most recent first
    expect(result[0].eligibleTeamIds).toEqual([1, 2]);
    expect(result[1].season).toBe(2022);
    expect(result[1].eligibleTeamIds).toEqual([1, 2]);
  });

  it('should exclude seasons where not all players meet threshold', () => {
    const teamRosters: TeamRoster[] = [
      { teamId: 1, playerIds: [101, 102] },
      { teamId: 2, playerIds: [201, 202] },
    ];

    const playerGameCounts: PlayerGameCount[] = [
      { playerId: 101, season: 2023, gamesPlayed: 150 },
      { playerId: 102, season: 2023, gamesPlayed: 140 },
      { playerId: 201, season: 2023, gamesPlayed: 160 },
      { playerId: 202, season: 2023, gamesPlayed: 130 },
      { playerId: 101, season: 2022, gamesPlayed: 120 },
      { playerId: 102, season: 2022, gamesPlayed: 30 }, // Below threshold
      { playerId: 201, season: 2022, gamesPlayed: 100 },
      { playerId: 202, season: 2022, gamesPlayed: 90 },
    ];

    const params: SeasonEligibilityParams = {
      teamRosters,
      playerGameCounts,
      minGamesPerSeason: 100,
    };

    const result = determineEligibleSeasons(params);

    expect(result).toHaveLength(1);
    expect(result[0].season).toBe(2023);
  });

  it('should return empty array when no seasons meet criteria', () => {
    const teamRosters: TeamRoster[] = [{ teamId: 1, playerIds: [101, 102] }];

    const playerGameCounts: PlayerGameCount[] = [
      { playerId: 101, season: 2023, gamesPlayed: 50 },
      { playerId: 102, season: 2023, gamesPlayed: 40 },
    ];

    const params: SeasonEligibilityParams = {
      teamRosters,
      playerGameCounts,
      minGamesPerSeason: 100,
    };

    const result = determineEligibleSeasons(params);

    expect(result).toHaveLength(0);
  });

  it('should handle players with no game data', () => {
    const teamRosters: TeamRoster[] = [{ teamId: 1, playerIds: [101, 102] }];

    const playerGameCounts: PlayerGameCount[] = [
      { playerId: 101, season: 2023, gamesPlayed: 150 },
      // Player 102 has no data
    ];

    const params: SeasonEligibilityParams = {
      teamRosters,
      playerGameCounts,
      minGamesPerSeason: 100,
    };

    const result = determineEligibleSeasons(params);

    expect(result).toHaveLength(0); // Season ineligible because player 102 lacks data
  });
});

describe('selectRandomSeason', () => {
  const eligibleSeasons: SeasonInfo[] = [
    { season: 2023, eligibleTeamIds: [1, 2, 3], totalGames: 1000 },
    { season: 2022, eligibleTeamIds: [1, 2, 3], totalGames: 950 },
    { season: 2021, eligibleTeamIds: [1, 2], totalGames: 900 },
  ];

  it('should return a valid season', () => {
    const params: SeasonSelectionParams = {
      eligibleSeasons,
      teamIds: [1, 2],
    };

    const result = selectRandomSeason(params);

    expect(result).not.toBeNull();
    expect([2023, 2022, 2021]).toContain(result);
  });

  it('should return null when no eligible seasons', () => {
    const params: SeasonSelectionParams = {
      eligibleSeasons: [],
      teamIds: [1, 2],
    };

    const result = selectRandomSeason(params);

    expect(result).toBeNull();
  });

  it('should filter by team eligibility', () => {
    const params: SeasonSelectionParams = {
      eligibleSeasons,
      teamIds: [1, 3],
    };

    const result = selectRandomSeason(params);

    // Only 2023 and 2022 have both teams 1 and 3
    expect(result).not.toBeNull();
    expect([2023, 2022]).toContain(result);
  });

  it('should prefer less-used seasons when usage counts provided', () => {
    const usedSeasonCounts = new Map<number, number>();
    usedSeasonCounts.set(2023, 5);
    usedSeasonCounts.set(2022, 1);
    usedSeasonCounts.set(2021, 1);

    const params: SeasonSelectionParams = {
      eligibleSeasons,
      teamIds: [1, 2],
      usedSeasonCounts,
    };

    // Run multiple times to check it generally prefers 2022 or 2021 over 2023
    const results: (number | null)[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(selectRandomSeason(params));
    }

    const count2023 = results.filter((r) => r === 2023).length;
    const countOthers = results.filter((r) => r !== 2023 && r !== null).length;

    // With min usage, 2022 and 2021 should be picked more often
    expect(countOthers).toBeGreaterThan(count2023);
  });
});

describe('validateSeasonForMatchup', () => {
  const eligibleSeasons: SeasonInfo[] = [
    { season: 2023, eligibleTeamIds: [1, 2, 3], totalGames: 1000 },
    { season: 2022, eligibleTeamIds: [1, 2], totalGames: 950 },
  ];

  it('should return true when season is eligible for all teams', () => {
    expect(validateSeasonForMatchup(2023, [1, 2], eligibleSeasons)).toBe(true);
    expect(validateSeasonForMatchup(2022, [1, 2], eligibleSeasons)).toBe(true);
  });

  it('should return false when season is not eligible for a team', () => {
    expect(validateSeasonForMatchup(2022, [1, 3], eligibleSeasons)).toBe(false);
  });

  it('should return false when season does not exist', () => {
    expect(validateSeasonForMatchup(2021, [1, 2], eligibleSeasons)).toBe(false);
  });
});

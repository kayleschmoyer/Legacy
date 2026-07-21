/**
 * League analytics GraphQL mock data factories.
 *
 * Backs the hermetic `GetLeagueAnalytics` coverage for the premium analytics
 * page (`/leagues/:leagueId/analytics`). Shapes mirror the generated
 * `GetLeagueAnalyticsQuery` type in `@legacy-sports/graphql` — every value is
 * seeded and deterministic (no `Date`/random) so the spec stays at 0/0.
 */

export interface MockTeamStatistics {
  __typename: 'TeamStatistics';
  teamId: number;
  teamName: string;
  averagePoints: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  currentStreak: string;
  currentStreakCount: number;
}

export interface MockPowerRanking {
  __typename: 'PowerRanking';
  rank: number;
  teamId: number;
  teamName: string;
  powerScore: number;
  recentFormScore: number;
  pointDifferential: number;
}

export interface MockPlayoffProjection {
  __typename: 'PlayoffProjection';
  teamId: number;
  teamName: string;
  currentRecord: string;
  playoffProbability: number;
  projectedWins: number;
  projectedLosses: number;
  magicNumber: number | null;
  eliminationNumber: number | null;
}

export interface MockLeagueAnalytics {
  __typename: 'LeagueAnalytics';
  leagueId: number;
  leagueName: string;
  currentWeek: number;
  totalTeams: number;
  averagePointsPerMatchup: number;
  teamStats: MockTeamStatistics[];
  powerRankings: MockPowerRanking[];
  playoffProjections: MockPlayoffProjection[];
}

function defaultTeamStats(): MockTeamStatistics[] {
  return [
    {
      __typename: 'TeamStatistics',
      teamId: 1,
      teamName: 'Sluggers',
      averagePoints: 112.4,
      wins: 8,
      losses: 2,
      ties: 0,
      winPercentage: 0.8,
      currentStreak: 'W',
      currentStreakCount: 3,
    },
    {
      __typename: 'TeamStatistics',
      teamId: 2,
      teamName: 'Curveballs',
      averagePoints: 98.1,
      wins: 5,
      losses: 5,
      ties: 0,
      winPercentage: 0.5,
      currentStreak: 'L',
      currentStreakCount: 1,
    },
  ];
}

function defaultPowerRankings(): MockPowerRanking[] {
  return [
    {
      __typename: 'PowerRanking',
      rank: 1,
      teamId: 1,
      teamName: 'Sluggers',
      powerScore: 0.91,
      recentFormScore: 8.5,
      pointDifferential: 42.3,
    },
    {
      __typename: 'PowerRanking',
      rank: 2,
      teamId: 2,
      teamName: 'Curveballs',
      powerScore: 0.62,
      recentFormScore: 5.1,
      pointDifferential: -3.7,
    },
  ];
}

function defaultPlayoffProjections(): MockPlayoffProjection[] {
  return [
    {
      __typename: 'PlayoffProjection',
      teamId: 1,
      teamName: 'Sluggers',
      currentRecord: '8-2',
      playoffProbability: 0.94,
      projectedWins: 14.2,
      projectedLosses: 5.8,
      magicNumber: 3,
      eliminationNumber: null,
    },
    {
      __typename: 'PlayoffProjection',
      teamId: 2,
      teamName: 'Curveballs',
      currentRecord: '5-5',
      playoffProbability: 0.41,
      projectedWins: 10.5,
      projectedLosses: 9.5,
      magicNumber: null,
      eliminationNumber: 6,
    },
  ];
}

export function mockLeagueAnalytics(
  overrides: Partial<MockLeagueAnalytics> = {},
): MockLeagueAnalytics {
  return {
    __typename: 'LeagueAnalytics',
    leagueId: 1,
    leagueName: 'Test League',
    currentWeek: 10,
    totalTeams: 2,
    averagePointsPerMatchup: 105.25,
    teamStats: defaultTeamStats(),
    powerRankings: defaultPowerRankings(),
    playoffProjections: defaultPlayoffProjections(),
    ...overrides,
  };
}

/** Mock response for the `GetLeagueAnalytics` query. */
export function leagueAnalyticsResponse(
  analytics?: Partial<MockLeagueAnalytics>,
) {
  return { data: { getLeagueAnalytics: mockLeagueAnalytics(analytics) } };
}

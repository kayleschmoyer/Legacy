/**
 * Standings & playoff bracket GraphQL mock data factories.
 *
 * Covers: getLeagueStandings, getPlayoffBracket.
 */

// ── Standings ─────────────────────────────────────────────────────

export interface MockTeamStanding {
  __typename: 'TeamStanding';
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  pointsFor: number;
  pointsAgainst: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
  rank: number;
  divisionId: number | null;
  avatarUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  totalMatchups: number;
}

const TEAM_NAMES = [
  'Diamond Dogs',
  'The Sluggers',
  'Ace Hunters',
  'Grand Slammers',
  'Strikeout Kings',
  'Rally Caps',
  'Bench Mob',
  'Walk-Off Heroes',
  'Curveball Crew',
  'The Closers',
];

export function mockTeamStanding(
  overrides: Partial<MockTeamStanding> = {},
): MockTeamStanding {
  return {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Diamond Dogs',
    wins: 12,
    losses: 6,
    ties: 0,
    winPercentage: 0.667,
    pointsFor: 1520.5,
    pointsAgainst: 1380.0,
    averagePointsFor: 84.47,
    averagePointsAgainst: 76.67,
    rank: 1,
    divisionId: null,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    totalMatchups: 18,
    ...overrides,
  };
}

/**
 * Generate standings for a given number of teams.
 *
 * Produces plausible win/loss records that sum correctly and are
 * ordered by rank (best record first).
 */
export function mockStandings(teamCount: number): MockTeamStanding[] {
  return Array.from({ length: teamCount }, (_, i) => {
    const totalMatchups = 18;
    // Distribute wins so top teams have more — simple linear decay
    const wins = Math.max(0, totalMatchups - i * 2);
    const losses = totalMatchups - wins;
    const winPct = totalMatchups > 0 ? wins / totalMatchups : 0;
    const pointsFor = 1600 - i * 40 + (i % 2 === 0 ? 10 : -10);
    const pointsAgainst = 1300 + i * 30;

    return mockTeamStanding({
      teamId: i + 1,
      teamName: TEAM_NAMES[i % TEAM_NAMES.length],
      wins,
      losses,
      ties: 0,
      winPercentage: Math.round(winPct * 1000) / 1000,
      pointsFor,
      pointsAgainst,
      averagePointsFor: Math.round((pointsFor / totalMatchups) * 100) / 100,
      averagePointsAgainst:
        Math.round((pointsAgainst / totalMatchups) * 100) / 100,
      rank: i + 1,
      totalMatchups,
    });
  });
}

// ── Playoff bracket ───────────────────────────────────────────────

export type MockPlayoffRound = 'wildcard' | 'semifinals' | 'finals';
export type MockPlayoffMatchupStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed';

export interface MockPlayoffMatchup {
  __typename: 'PlayoffMatchup';
  id: number;
  bracketId: number;
  round: MockPlayoffRound;
  matchupNumber: number;
  highSeedTeamId: number;
  lowSeedTeamId: number;
  highSeedScore: number | null;
  lowSeedScore: number | null;
  winnerTeamId: number | null;
  weekNumber: number;
  status: MockPlayoffMatchupStatus;
  isMultiWeek: boolean;
}

export function mockPlayoffMatchup(
  overrides: Partial<MockPlayoffMatchup> = {},
): MockPlayoffMatchup {
  return {
    __typename: 'PlayoffMatchup',
    id: 1,
    bracketId: 1,
    round: 'semifinals',
    matchupNumber: 1,
    highSeedTeamId: 1,
    lowSeedTeamId: 4,
    highSeedScore: null,
    lowSeedScore: null,
    winnerTeamId: null,
    weekNumber: 23,
    status: 'scheduled',
    isMultiWeek: false,
    ...overrides,
  };
}

export interface MockPlayoffBracket {
  __typename: 'PlayoffBracket';
  id: number;
  leagueId: number;
  season: number;
  startWeek: number;
  endWeek: number | null;
  format: string;
  status: MockPlayoffMatchupStatus;
  championTeamId: number | null;
  matchups: MockPlayoffMatchup[];
}

/**
 * Playoff bracket state at a given round.
 *
 * - `wildcard` — 4 matchups, all scheduled
 * - `semifinals` — 2 matchups scheduled, prior rounds completed
 * - `finals` — 1 matchup scheduled, prior rounds completed
 */
export function mockPlayoffBracket(
  round: MockPlayoffRound,
  overrides: Partial<MockPlayoffBracket> = {},
): MockPlayoffBracket {
  const roundConfigs: Record<
    MockPlayoffRound,
    { matchups: MockPlayoffMatchup[]; status: MockPlayoffMatchupStatus }
  > = {
    wildcard: {
      status: 'scheduled',
      matchups: [
        mockPlayoffMatchup({
          id: 1,
          round: 'wildcard',
          matchupNumber: 1,
          highSeedTeamId: 1,
          lowSeedTeamId: 8,
          weekNumber: 23,
          status: 'scheduled',
        }),
        mockPlayoffMatchup({
          id: 2,
          round: 'wildcard',
          matchupNumber: 2,
          highSeedTeamId: 2,
          lowSeedTeamId: 7,
          weekNumber: 23,
          status: 'scheduled',
        }),
        mockPlayoffMatchup({
          id: 3,
          round: 'wildcard',
          matchupNumber: 3,
          highSeedTeamId: 3,
          lowSeedTeamId: 6,
          weekNumber: 23,
          status: 'scheduled',
        }),
        mockPlayoffMatchup({
          id: 4,
          round: 'wildcard',
          matchupNumber: 4,
          highSeedTeamId: 4,
          lowSeedTeamId: 5,
          weekNumber: 23,
          status: 'scheduled',
        }),
      ],
    },
    semifinals: {
      status: 'in_progress',
      matchups: [
        // Completed wildcard round
        mockPlayoffMatchup({
          id: 1,
          round: 'wildcard',
          matchupNumber: 1,
          highSeedTeamId: 1,
          lowSeedTeamId: 8,
          highSeedScore: 92.5,
          lowSeedScore: 68.0,
          winnerTeamId: 1,
          weekNumber: 23,
          status: 'completed',
        }),
        mockPlayoffMatchup({
          id: 2,
          round: 'wildcard',
          matchupNumber: 2,
          highSeedTeamId: 2,
          lowSeedTeamId: 7,
          highSeedScore: 78.0,
          lowSeedScore: 81.5,
          winnerTeamId: 7,
          weekNumber: 23,
          status: 'completed',
        }),
        mockPlayoffMatchup({
          id: 3,
          round: 'wildcard',
          matchupNumber: 3,
          highSeedTeamId: 3,
          lowSeedTeamId: 6,
          highSeedScore: 85.0,
          lowSeedScore: 74.5,
          winnerTeamId: 3,
          weekNumber: 23,
          status: 'completed',
        }),
        mockPlayoffMatchup({
          id: 4,
          round: 'wildcard',
          matchupNumber: 4,
          highSeedTeamId: 4,
          lowSeedTeamId: 5,
          highSeedScore: 90.0,
          lowSeedScore: 88.5,
          winnerTeamId: 4,
          weekNumber: 23,
          status: 'completed',
        }),
        // Active semifinals
        mockPlayoffMatchup({
          id: 5,
          round: 'semifinals',
          matchupNumber: 1,
          highSeedTeamId: 1,
          lowSeedTeamId: 4,
          weekNumber: 24,
          status: 'scheduled',
        }),
        mockPlayoffMatchup({
          id: 6,
          round: 'semifinals',
          matchupNumber: 2,
          highSeedTeamId: 3,
          lowSeedTeamId: 7,
          weekNumber: 24,
          status: 'scheduled',
        }),
      ],
    },
    finals: {
      status: 'in_progress',
      matchups: [
        // Completed semifinals (condensed — only show semis + finals)
        mockPlayoffMatchup({
          id: 5,
          round: 'semifinals',
          matchupNumber: 1,
          highSeedTeamId: 1,
          lowSeedTeamId: 4,
          highSeedScore: 95.0,
          lowSeedScore: 82.5,
          winnerTeamId: 1,
          weekNumber: 24,
          status: 'completed',
        }),
        mockPlayoffMatchup({
          id: 6,
          round: 'semifinals',
          matchupNumber: 2,
          highSeedTeamId: 3,
          lowSeedTeamId: 7,
          highSeedScore: 88.0,
          lowSeedScore: 91.0,
          winnerTeamId: 7,
          weekNumber: 24,
          status: 'completed',
        }),
        // Active finals
        mockPlayoffMatchup({
          id: 7,
          round: 'finals',
          matchupNumber: 1,
          highSeedTeamId: 1,
          lowSeedTeamId: 7,
          weekNumber: 25,
          status: 'scheduled',
        }),
      ],
    },
  };

  const config = roundConfigs[round];

  return {
    __typename: 'PlayoffBracket',
    id: 1,
    leagueId: 1,
    season: 2025,
    startWeek: 23,
    endWeek: null,
    format: 'single_elimination',
    status: config.status,
    championTeamId: null,
    matchups: config.matchups,
    ...overrides,
  };
}

// ── Response factories ──────────────────────────────────────────────

export function standingsResponse(teamCount = 10) {
  return {
    data: { getLeagueStandings: mockStandings(teamCount) },
  };
}

export function standingsWithOverridesResponse(
  standings: Partial<MockTeamStanding>[],
) {
  return {
    data: {
      getLeagueStandings: standings.map((s) => mockTeamStanding(s)),
    },
  };
}

export function playoffBracketResponse(
  round: MockPlayoffRound,
  overrides?: Partial<MockPlayoffBracket>,
) {
  return {
    data: { getPlayoffBracket: mockPlayoffBracket(round, overrides) },
  };
}

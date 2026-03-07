/**
 * Matchup GraphQL mock data factories.
 *
 * Covers: getMatchupById, getMatchupsForLeague, getMatchupsByWeek,
 *         getMatchupPlayers, getMatchupRoster, currentMatchupForLeague,
 *         getMatchupHistory, createMatchup, updateMatchupStatus.
 */

export interface MockMatchup {
  __typename: 'Matchup';
  id: number;
  leagueId: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'in-progress' | 'completed';
}

export function mockMatchup(overrides: Partial<MockMatchup> = {}): MockMatchup {
  return {
    __typename: 'Matchup',
    id: 1,
    leagueId: 1,
    week: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    ...overrides,
  };
}

// ── Response factories ──────────────────────────────────────────────

export function matchupByIdResponse(matchup?: Partial<MockMatchup> | null) {
  return {
    data: { matchup: matchup === null ? null : mockMatchup(matchup) },
  };
}

export function matchupsForLeagueResponse(matchups?: Partial<MockMatchup>[]) {
  return {
    data: {
      matchupsForLeague: (matchups ?? []).map((m) => mockMatchup(m)),
    },
  };
}

export function currentMatchupForLeagueResponse(
  matchup: Partial<MockMatchup> | null = null,
) {
  return {
    data: {
      currentMatchupForLeague: matchup ? mockMatchup(matchup) : null,
    },
  };
}

export function matchupHistoryResponse(matchups?: Partial<MockMatchup>[]) {
  return {
    data: {
      getMatchupHistory: (matchups ?? []).map((m) => mockMatchup(m)),
    },
  };
}

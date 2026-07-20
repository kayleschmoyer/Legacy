/**
 * Regression coverage for LS-5904 (BMD-034): the bench toggle badge showed
 * only the combined bench count for both teams, giving no signal about
 * which team actually has bench depth when rosters are asymmetric (e.g.
 * Team A has 5 bench players, Team B has 0). The badge now renders each
 * team's count separately ("5 vs 0") instead of the summed total.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '@legacy-sports/graphql';
import { MatchupRosterComparison } from './MatchupRosterComparison';
import { useLeagueScoringSettings } from '../../lib/scoring';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/graphql', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );
  return {
    ...actual,
    useGetMatchupPlayersQuery: jest.fn(),
    useGetPositionsForLeagueQuery: jest.fn(),
    useGetLeagueTeamsQuery: jest.fn(),
  };
});

jest.mock('../../lib/scoring', () => ({
  useLeagueScoringSettings: jest.fn(),
}));

jest.mock('./PlayerSeasonStatsModal', () => ({
  PlayerSeasonStatsModal: () => null,
}));

jest.mock('./PlayerMatchupStatsModal', () => ({
  PlayerMatchupStatsModal: () => null,
}));

function makeMatchup(
  overrides: Partial<MatchupFragment> = {},
): MatchupFragment {
  return {
    __typename: 'Matchup',
    id: '1234',
    weekNumber: 5,
    leagueId: 849,
    team1Id: 10,
    team2Id: 20,
    team1Score: 0,
    team2Score: 0,
    gamesPerMatchup: 3,
    pitcherStartsPerMatchup: 1,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: 10, name: 'Team A' },
    team2: { __typename: 'Team', id: 20, name: 'Team B' },
    ...overrides,
  };
}

function makeBenchPlayer(
  id: string,
  teamId: number,
  playerId: number,
): MatchupPlayerFragment {
  return {
    __typename: 'MatchupPlayer',
    id,
    matchupId: 1234,
    playerId,
    teamId,
    positionId: null, // null positionId => bench player
    season: 2026,
    numberOfGames: 3,
    player: {
      __typename: 'Player',
      firstName: `First${id}`,
      lastName: `Last${id}`,
      eligiblePositions: ['OF'],
    },
    seasonBatting: null,
    seasonPitching: null,
    seasonFielding: null,
    games: [],
  } as unknown as MatchupPlayerFragment;
}

// Starter has a non-null positionId, so it's excluded from bench counts but
// still contributes to the header's "total roster size" badge — used to
// keep that badge's count distinct from the bench-toggle badge under test.
function makeStarterPlayer(
  id: string,
  teamId: number,
  playerId: number,
): MatchupPlayerFragment {
  return {
    __typename: 'MatchupPlayer',
    id,
    matchupId: 1234,
    playerId,
    teamId,
    positionId: 1,
    season: 2026,
    numberOfGames: 3,
    player: {
      __typename: 'Player',
      firstName: `Starter${id}`,
      lastName: `Last${id}`,
      eligiblePositions: ['OF'],
    },
    seasonBatting: null,
    seasonPitching: null,
    seasonFielding: null,
    games: [],
  } as unknown as MatchupPlayerFragment;
}

describe('MatchupRosterComparison — bench toggle (LS-5904 / BMD-034)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue({
      data: { leaguePositions: [] },
      loading: false,
    });
    (useGetLeagueTeamsQuery as jest.Mock).mockReturnValue({
      data: {
        leagueTeams: [
          { id: 10, name: 'Team A' },
          { id: 20, name: 'Team B' },
        ],
      },
    });
    (useLeagueScoringSettings as jest.Mock).mockReturnValue({
      settings: { batting: {}, pitching: {}, fielding: {} },
      loading: false,
    });
  });

  it("shows each team's bench count separately when rosters are asymmetric", () => {
    // Team A: 2 starters + 5 bench. Team B: 2 starters + 0 bench. Starters
    // give the header's total-roster badge ("7 vs 2") a distinct value from
    // the bench-toggle badge ("5 vs 0"), so the two badges can't be conflated.
    const players: MatchupPlayerFragment[] = [
      makeStarterPlayer('s1', 10, 901),
      makeStarterPlayer('s2', 10, 902),
      makeStarterPlayer('s3', 20, 903),
      makeStarterPlayer('s4', 20, 904),
      makeBenchPlayer('1', 10, 101),
      makeBenchPlayer('2', 10, 102),
      makeBenchPlayer('3', 10, 103),
      makeBenchPlayer('4', 10, 104),
      makeBenchPlayer('5', 10, 105),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(<MatchupRosterComparison matchup={makeMatchup()} />);

    // The bench-toggle badge must show the per-team split ("5 vs 0"), not
    // the combined bench total (5) that hid which team had the depth.
    expect(screen.getByText('Show Bench')).toBeInTheDocument();
    expect(screen.getByText('5 vs 0')).toBeInTheDocument();
    // The header's total-roster badge ("7 vs 2") is a separate, unrelated
    // count and must not be confused with the bench-only split above.
    expect(screen.getByText('7 vs 2')).toBeInTheDocument();
  });

  it('does not render a bench section (or toggle) when neither team has bench players', () => {
    const players: MatchupPlayerFragment[] = [
      makeStarterPlayer('s1', 10, 901),
      makeStarterPlayer('s2', 20, 902),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(<MatchupRosterComparison matchup={makeMatchup()} />);

    // With no bench players on either side, the bench toggle section isn't
    // rendered at all — no "Show Bench" text and no per-team split badge.
    expect(screen.queryByText(/Bench/)).not.toBeInTheDocument();
  });
});

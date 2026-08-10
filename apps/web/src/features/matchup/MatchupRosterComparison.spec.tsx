/**
 * Regression coverage for LS-5904 (BMD-034): the bench toggle badge showed
 * only the combined bench count for both teams, giving no signal about
 * which team actually has bench depth when rosters are asymmetric (e.g.
 * Team A has 5 bench players, Team B has 0). The badge now renders each
 * team's count separately ("5 vs 0") instead of the summed total.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  Sport,
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

const mockOpenFootballPlayerDetailModal = jest.fn();
jest.mock('../../components/FootballPlayerDetailModal', () => ({
  FootballPlayerDetailModal: (props: {
    open: boolean;
    playerId: number | null;
  }) => {
    mockOpenFootballPlayerDetailModal(props);
    return props.open ? <div data-testid="football-player-modal" /> : null;
  },
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

/**
 * Regression coverage for LS-9122: a season with no scraped per-game box
 * scores was flagged as `pitcherStartSkipped`, the same flag used for a
 * real SP rotation skip. That made a hitter with a data gap read as having
 * "N off days" — a misleading, inflated count. `noGameDataFound` now
 * carries the data-gap case, and the UI must show "Stats unavailable"
 * for it instead of counting it as an off day.
 */
describe('MatchupRosterComparison — off-day vs no-data labeling (LS-9122)', () => {
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

  function makeGame(
    id: number,
    overrides: Partial<{
      pitcherStartSkipped: boolean;
      noGameDataFound: boolean;
    }> = {},
  ) {
    return {
      __typename: 'MatchupPlayerGame',
      id,
      matchupPlayerId: id,
      gameNum: 1,
      gameIdentifier: null,
      gamePosition: null,
      statsLoadingStatus: 'completed',
      pitcherStartSkipped: false,
      noGameDataFound: false,
      ...overrides,
    };
  }

  function makeFielderBenchPlayer(
    id: string,
    teamId: number,
    playerId: number,
    games: ReturnType<typeof makeGame>[],
  ): MatchupPlayerFragment {
    return {
      __typename: 'MatchupPlayer',
      id,
      matchupId: 1234,
      playerId,
      teamId,
      positionId: null,
      season: 2026,
      numberOfGames: games.length,
      player: {
        __typename: 'Player',
        firstName: `First${id}`,
        lastName: `Last${id}`,
        eligiblePositions: ['OF'],
      },
      seasonBatting: null,
      seasonPitching: null,
      seasonFielding: null,
      games,
    } as unknown as MatchupPlayerFragment;
  }

  it('shows "Stats unavailable" (not "off day") for a hitter with a data-availability gap', () => {
    const players: MatchupPlayerFragment[] = [
      makeFielderBenchPlayer('1', 10, 101, [
        makeGame(1, { noGameDataFound: true }),
        makeGame(2, { noGameDataFound: true }),
      ]),
      makeFielderBenchPlayer('2', 20, 102, [
        makeGame(3, { noGameDataFound: true }),
        makeGame(4, { noGameDataFound: true }),
      ]),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(<MatchupRosterComparison matchup={makeMatchup()} />);
    fireEvent.click(screen.getByText('Show Bench'));

    expect(screen.getAllByText(/Stats unavailable/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/off day/)).not.toBeInTheDocument();
    // Games with no data should not count toward "games played" either —
    // both benched players show 0/2, never games "played".
    expect(screen.getAllByText(/0\/2 games/).length).toBeGreaterThan(0);
  });

  it('still shows "N off days" for a real SP rotation skip', () => {
    const players: MatchupPlayerFragment[] = [
      makeFielderBenchPlayer('1', 10, 101, [
        makeGame(1, { pitcherStartSkipped: true }),
        makeGame(2, { pitcherStartSkipped: true }),
      ]),
      makeFielderBenchPlayer('2', 20, 102, [
        makeGame(3, { pitcherStartSkipped: true }),
        makeGame(4, { pitcherStartSkipped: true }),
      ]),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(<MatchupRosterComparison matchup={makeMatchup()} />);
    fireEvent.click(screen.getByText('Show Bench'));

    expect(screen.getAllByText(/2 off days/).length).toBeGreaterThan(0);
  });
});

describe('MatchupRosterComparison — football (LS-5418)', () => {
  function makeFootballStarter(
    id: string,
    teamId: number,
    playerId: number,
    positionId: number,
    firstName: string,
  ): MatchupPlayerFragment {
    return {
      __typename: 'MatchupPlayer',
      id,
      matchupId: 1234,
      playerId,
      teamId,
      positionId,
      season: 2026,
      numberOfGames: 1,
      player: {
        __typename: 'Player',
        firstName,
        lastName: 'Player',
        eligiblePositions: ['QB'],
      },
      seasonBatting: null,
      seasonPitching: null,
      seasonFielding: null,
      games: [],
    } as unknown as MatchupPlayerFragment;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue({
      data: {
        leaguePositions: [
          { id: 1, positionType: 'QB' },
          { id: 2, positionType: 'RB' },
        ],
      },
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

  it('renders football position slot labels (QB, RB) instead of baseball ones', () => {
    const players: MatchupPlayerFragment[] = [
      makeFootballStarter('s1', 10, 901, 1, 'Pat'),
      makeFootballStarter('s2', 20, 902, 1, 'Chris'),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(
      <MatchupRosterComparison
        matchup={makeMatchup()}
        sport={Sport.Football}
      />,
    );

    expect(screen.getByText('QB')).toBeInTheDocument();
    expect(screen.getByText('Starting Lineup')).toBeInTheDocument();
    expect(
      screen.queryByText('Starting Lineup — Batters'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Starting Lineup — Pitchers'),
    ).not.toBeInTheDocument();
  });

  it('opens the football player detail modal (not the baseball season modal) when a player name is clicked', () => {
    const players: MatchupPlayerFragment[] = [
      makeFootballStarter('s1', 10, 901, 1, 'Pat'),
      makeFootballStarter('s2', 20, 902, 1, 'Chris'),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });

    render(
      <MatchupRosterComparison
        matchup={makeMatchup()}
        sport={Sport.Football}
      />,
    );

    fireEvent.click(screen.getByText('Pat Player'));

    expect(screen.getByTestId('football-player-modal')).toBeInTheDocument();
    expect(mockOpenFootballPlayerDetailModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, playerId: 901 }),
    );
  });
});

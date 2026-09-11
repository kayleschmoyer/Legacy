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
  useMatchupScoresQuery,
} from '@legacy-sports/graphql';
import { MatchupRosterComparison } from './MatchupRosterComparison';
import { useLeagueScoringSettings } from '../../lib/scoring';
import { useHasEntitlement } from '../../hooks/useIsPremium';

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
    useMatchupScoresQuery: jest.fn(),
  };
});

jest.mock('../../lib/scoring', () => ({
  useLeagueScoringSettings: jest.fn(),
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: jest.fn(),
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
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({ data: undefined });
    (useHasEntitlement as jest.Mock).mockReturnValue(false);
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
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({ data: undefined });
    (useHasEntitlement as jest.Mock).mockReturnValue(false);
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
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({ data: undefined });
    (useHasEntitlement as jest.Mock).mockReturnValue(false);
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

/**
 * Coverage for FMD-028 / LS-6385: the premium "Matchup Edge" grade chip,
 * computed from the player's own real season-average fantasy points per game
 * (MatchupPlayer.footballSeasonFppg, server-gated per LS-6385) — not an
 * opponent-specific comparison.
 */
describe('MatchupRosterComparison — Matchup Edge grade chip (FMD-028 / LS-6385)', () => {
  function makeFootballStarterWithFppg(
    id: string,
    teamId: number,
    playerId: number,
    positionId: number,
    firstName: string,
    footballSeasonFppg: number | null,
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
      footballSeasonFppg,
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
      data: { leaguePositions: [{ id: 1, positionType: 'QB' }] },
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
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({ data: undefined });
  });

  it('shows the grade chip for a premium user with a season FPPG', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(true);
    const players: MatchupPlayerFragment[] = [
      // 25 FPPG at QB clears the A+ band (min 24).
      makeFootballStarterWithFppg('s1', 10, 901, 1, 'Pat', 25),
      makeFootballStarterWithFppg('s2', 20, 902, 1, 'Chris', null),
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

    expect(screen.getByText('A+')).toBeInTheDocument();
  });

  it('hides the grade chip for a non-premium user even with a season FPPG', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(false);
    const players: MatchupPlayerFragment[] = [
      makeFootballStarterWithFppg('s1', 10, 901, 1, 'Pat', 25),
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

    expect(screen.queryByText('A+')).not.toBeInTheDocument();
  });

  it('hides the grade chip when footballSeasonFppg is null (no season data yet)', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(true);
    const players: MatchupPlayerFragment[] = [
      makeFootballStarterWithFppg('s1', 10, 901, 1, 'Pat', null),
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

    expect(
      screen.queryByTitle(
        "Matchup Edge — grades this player's season scoring pace so far, not opponent strength",
      ),
    ).not.toBeInTheDocument();
  });
});

/**
 * Coverage for LS-9612: football had no scoring path wired into this
 * component — every football player row showed "—"/0 and team totals never
 * summed to the real team score, despite real per-game football data
 * already existing and being used successfully elsewhere on the page via
 * `matchupScores` / `FootballMatchupPlayer.totalPoints`. This exercises that
 * same data source now feeding the roster comparison directly.
 */
describe('MatchupRosterComparison — football scoring (LS-9612)', () => {
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
      // A single "played" game slot — hasPlayed/games-count display derive
      // from this generic per-game tracker regardless of sport, separately
      // from the battingGame/pitchingGame/fieldingGame stat blocks used only
      // for baseball scoring.
      games: [
        {
          __typename: 'MatchupPlayerGame',
          id: playerId,
          matchupPlayerId: playerId,
          gameNum: 1,
          gameIdentifier: null,
          gamePosition: null,
          statsLoadingStatus: 'completed',
          pitcherStartSkipped: false,
          noGameDataFound: false,
        },
      ],
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
    (useHasEntitlement as jest.Mock).mockReturnValue(false);
  });

  it("renders each football player's real point total and sums the team total from matchupScores, not baseball fields", () => {
    const players: MatchupPlayerFragment[] = [
      makeFootballStarter('s1', 10, 901, 1, 'Pat'), // QB
      makeFootballStarter('s2', 10, 903, 2, 'Riley'), // RB
      makeFootballStarter('s3', 20, 902, 1, 'Chris'), // QB
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({
      data: {
        matchupScores: [
          {
            __typename: 'FootballMatchupStats',
            teamId: 10,
            teamName: 'Team A',
            totalPoints: 34.5,
            projectedPoints: 30,
            players: [
              {
                __typename: 'FootballMatchupPlayer',
                playerId: 901,
                playerName: 'Pat Player',
                position: 'QB',
                totalPoints: 24.5,
                projectedPoints: 20,
                games: [],
              },
              {
                __typename: 'FootballMatchupPlayer',
                playerId: 903,
                playerName: 'Riley Player',
                position: 'RB',
                totalPoints: 10,
                projectedPoints: 10,
                games: [],
              },
            ],
          },
          {
            __typename: 'FootballMatchupStats',
            teamId: 20,
            teamName: 'Team B',
            totalPoints: 12.25,
            projectedPoints: 15,
            players: [
              {
                __typename: 'FootballMatchupPlayer',
                playerId: 902,
                playerName: 'Chris Player',
                position: 'QB',
                totalPoints: 12.25,
                projectedPoints: 15,
                games: [],
              },
            ],
          },
        ],
      },
    });

    render(
      <MatchupRosterComparison
        matchup={makeMatchup()}
        sport={Sport.Football}
      />,
    );

    // Per-player actual points come from FootballMatchupPlayer.totalPoints,
    // not the baseball battingGame/pitchingGame/fieldingGame path (which
    // would render "—" for every football player before this fix).
    expect(screen.getByText('24.5')).toBeInTheDocument();
    // 12.25 rounds to 1 decimal; Team B has only one player so its player
    // row and team-total row happen to show the same value.
    expect(screen.getAllByText('12.3').length).toBeGreaterThan(0);

    // Team A's real total (34.5 = 24.5 + 10) appears as the "Team Total"
    // row's actual score — sourced from FootballMatchupStats.totalPoints,
    // so it matches the server's real team score exactly rather than being
    // recomputed (and silently diverging) from summed player rows.
    expect(screen.getAllByText('34.5').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('shows 0 (not "—") for a football player with no matchupScores entry yet', () => {
    const players: MatchupPlayerFragment[] = [
      makeFootballStarter('s1', 10, 901, 1, 'Pat'),
      makeFootballStarter('s2', 20, 902, 1, 'Chris'),
    ];
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue({
      data: { getMatchupPlayers: players },
      loading: false,
      error: undefined,
    });
    (useMatchupScoresQuery as jest.Mock).mockReturnValue({ data: undefined });

    render(
      <MatchupRosterComparison
        matchup={makeMatchup()}
        sport={Sport.Football}
      />,
    );

    expect(screen.getAllByText('0.0').length).toBeGreaterThan(0);
  });
});

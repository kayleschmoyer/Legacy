/**
 * Unit tests for `computeMatchupScores` — the pure helper that backs the
 * MatchupScoreboard widget.
 *
 * Regression coverage for LS-2937: the live matchup scoreboard rendered
 * "0.00 vs 0.00 Tied" whenever the `getMatchupPlayers` GraphQL query
 * returned an error (even a partial one, because Apollo is configured with
 * `errorPolicy: 'all'`), because the client-side score computation walked
 * over null `games` arrays and silently produced zero totals.
 *
 * The fix is to honour the query's error state and fall back to the
 * matchup's server-stored `team1Score`/`team2Score` fields.
 *
 * Regression coverage for LS-5879 (BMD-009): once a matchup is `Completed`,
 * the server-stored score must be used verbatim instead of being recomputed
 * from raw per-player stats — recomputing is both a heavy hot path and a
 * second source of truth that can diverge from the server.
 */
import React from 'react';
import { render } from '@testing-library/react';
import type {
  MatchupFragment,
  MatchupPlayerFragment,
} from '@legacy-sports/graphql';
import {
  FootballStatsDataQuality,
  MatchupStatus,
  StatsLoadingStatus,
} from '@legacy-sports/graphql';
import {
  computeFootballMatchupPlayerStats,
  computeMatchupScores,
  MatchupScoreboard,
} from './MatchupScoreboard';
import type { ScoringSettings } from '../../lib/scoring';

import { getEnvironmentConfig } from '../../config/environment';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../config/environment', () => ({
  getEnvironmentConfig: jest.fn(() => ({ isDev: false })),
}));

// --- websocket wiring (LS-5425: live score updates + reconnect refetch) ----
// Only exercised by the dedicated describe block below — every other test in
// this file uses the real (mocked-elsewhere) GraphQL/scoring hooks are not
// touched, and MatchupStatus/StatsLoadingStatus stay the real enum values via
// jest.requireActual, so computeMatchupScores' equality checks are unaffected.
const mockUseGetMatchupPlayersQuery = jest.fn();
const mockUseGetLeagueTeamsQuery = jest.fn();
const mockUseGetLeagueStandingsQuery = jest.fn(() => ({ data: undefined }));
jest.mock('@legacy-sports/graphql', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );
  return {
    ...actual,
    useGetMatchupPlayersQuery: (opts: unknown): unknown =>
      mockUseGetMatchupPlayersQuery(opts),
    useGetLeagueTeamsQuery: (opts: unknown): unknown =>
      mockUseGetLeagueTeamsQuery(opts),
    useGetLeagueStandingsQuery: (opts: unknown): unknown =>
      mockUseGetLeagueStandingsQuery(opts),
  };
});

const mockUseLeagueScoringSettings = jest.fn(() => ({
  settings: { batting: {}, pitching: {}, fielding: {} },
}));
// The wrapper resolves premium status to gate the score "+N" flourish
// (LS-6392); these specs render it in isolation, without an AuthProvider or
// Apollo, so the hook is stubbed to the free-tier default.
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => false,
}));

jest.mock('../../lib/scoring', () => ({
  useLeagueScoringSettings: (id: unknown): unknown =>
    mockUseLeagueScoringSettings(id),
}));

const mockScoreboardView = jest.fn();
const mockRefetchFootballScores = jest.fn();
const mockUseFootballMatchupScores = jest.fn((_args: unknown) => ({
  playerScores: new Map(),
  teamScores: new Map([[101, { actual: 1, projected: 2 }]]),
  loading: false,
  hasError: false,
  refetch: mockRefetchFootballScores,
}));
const mockComputeFootballMatchupTotals = jest.fn(
  (_matchup: unknown, _teamScores: unknown) => ({
    team1Score: 105.2,
    team2Score: 98.4,
    team1Projected: 107.2,
    team2Projected: 101.9,
    scoresUnavailable: false,
  }),
);
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupScoreboardView: (props: unknown) => {
    mockScoreboardView(props);
    return <div data-testid="scoreboard-view" />;
  },
  useFootballMatchupScores: (args: unknown) =>
    mockUseFootballMatchupScores(args),
  computeFootballMatchupTotals: (matchup: unknown, teamScores: unknown) =>
    mockComputeFootballMatchupTotals(matchup, teamScores),
}));

// Typing warn as jest.Mock (not the original method) sidesteps
// @typescript-eslint/unbound-method; requireMock returns the live mock instance.
const { LOGGER } = jest.requireMock<{ LOGGER: { warn: jest.Mock } }>(
  '@legacy-sports/logging',
);

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
    team1Score: 87.5,
    team2Score: 138.0,
    status: MatchupStatus.InProgress,
    statsLoadingStatus: StatsLoadingStatus.Completed,
    gamesPerMatchup: 10,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 5,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: 10, name: 'Team A' },
    team2: { __typename: 'Team', id: 20, name: 'Team B' },
    ...overrides,
  };
}

const emptyScoringSettings: ScoringSettings = {
  batting: {},
  fielding: {},
  pitching: {},
};

const emptySeasonStatsMap: ReadonlyMap<number, never> = new Map();

describe('computeMatchupScores', () => {
  describe('fallback to server-stored scores (LS-2937 regression)', () => {
    it('uses matchup.team1Score/team2Score when the players query errored', () => {
      const matchup = makeMatchup({ team1Score: 87.5, team2Score: 138.0 });

      const result = computeMatchupScores({
        matchup,
        // With errorPolicy: 'all', Apollo may still surface data alongside
        // errors — `hasPlayersError` is the authoritative signal.
        players: [],
        hasPlayersError: true,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(87.5);
      expect(result.team2Score).toBe(138.0);
      expect(result.team1Projected).toBeNull();
      expect(result.team2Projected).toBeNull();
    });

    it('uses server-stored scores even when partial player data is available', () => {
      // Simulates the actual LS-2937 repro: getMatchupPlayers returns
      // player rows but nested `games` resolvers errored (games=null),
      // so client-side computation would yield 0-0.
      const players: MatchupPlayerFragment[] = [
        {
          __typename: 'MatchupPlayer',
          id: '1',
          matchupId: 1234,
          playerId: 100,
          teamId: 10,
          positionId: 1,
          season: 2023,
          numberOfGames: 10,
          player: null,
          seasonBatting: null,
          seasonPitching: null,
          seasonFielding: null,
          games: null, // nested resolver errored
        },
      ];

      const result = computeMatchupScores({
        matchup: makeMatchup({ team1Score: 87.5, team2Score: 138.0 }),
        players,
        hasPlayersError: true,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(87.5);
      expect(result.team2Score).toBe(138.0);
    });

    it('falls back when players data is missing (query still loading)', () => {
      const result = computeMatchupScores({
        matchup: makeMatchup({ team1Score: 42.0, team2Score: 13.5 }),
        players: null,
        hasPlayersError: false,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(42.0);
      expect(result.team2Score).toBe(13.5);
    });

    it('falls back when scoring settings are missing', () => {
      const result = computeMatchupScores({
        matchup: makeMatchup({ team1Score: 42.0, team2Score: 13.5 }),
        players: [],
        hasPlayersError: false,
        scoringSettings: null,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(42.0);
      expect(result.team2Score).toBe(13.5);
    });

    it('returns 0 (not NaN) when matchup has no stored scores and query errored', () => {
      const matchup = makeMatchup({ team1Score: null, team2Score: null });

      const result = computeMatchupScores({
        matchup,
        players: null,
        hasPlayersError: true,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(0);
      expect(result.team2Score).toBe(0);
    });

    it('returns 0-0 with null projections when matchup is null', () => {
      const result = computeMatchupScores({
        matchup: null,
        players: null,
        hasPlayersError: false,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(0);
      expect(result.team2Score).toBe(0);
      expect(result.team1Projected).toBeNull();
      expect(result.team2Projected).toBeNull();
    });
  });

  describe('happy path — computes from player games', () => {
    it('sums per-player, per-game scores onto the correct team', () => {
      // Use trivial scoring settings where 1 HR = 1 point so we can
      // hand-verify the totals.
      const scoring: ScoringSettings = {
        batting: { hr: 1 },
        fielding: {},
        pitching: {},
      };

      const makePlayer = (
        id: string,
        teamId: number,
        playerId: number,
        homeRuns: number,
      ): MatchupPlayerFragment => ({
        __typename: 'MatchupPlayer',
        id,
        matchupId: 1234,
        playerId,
        teamId,
        positionId: 1,
        season: 2023,
        numberOfGames: 1,
        player: null,
        seasonBatting: null,
        seasonPitching: null,
        seasonFielding: null,
        games: [
          {
            __typename: 'MatchupPlayerGame',
            id: Number(id),
            matchupPlayerId: Number(id),
            gameNum: 1,
            gameIdentifier: 'GAME1',
            gamePosition: null,
            statsLoadingStatus: null,
            pitcherStartSkipped: false,
            noGameDataFound: false,
            battingGame: {
              __typename: 'GameBatting',
              playerId,
              season: 2023,
              gameNum: 1,
              gameIdentifier: 'GAME1',
              plateAppearances: 4,
              atBats: 4,
              runs: 0,
              hits: 1,
              doubles: 0,
              triples: 0,
              homeRuns,
              rbi: 0,
              stolenBases: 0,
              caughtStealing: 0,
              baseOnBalls: 0,
              strikeouts: 0,
              groundedIntoDoublePlays: 0,
              hitByPitch: 0,
              sacrificeHits: 0,
              sacrificeFlies: '0',
              intentionalBaseOnBalls: 0,
              battingAverage: 0.25,
            },
            pitchingGame: null,
            fieldingGame: null,
          },
        ],
      });

      const players: MatchupPlayerFragment[] = [
        makePlayer('1', 10, 100, 3), // team1 +3
        makePlayer('2', 10, 101, 1), // team1 +1
        makePlayer('3', 20, 200, 2), // team2 +2
      ];

      const result = computeMatchupScores({
        matchup: makeMatchup({ team1Score: 0, team2Score: 0 }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(4);
      expect(result.team2Score).toBe(2);
    });

    it('skips players with null positionId', () => {
      const scoring: ScoringSettings = {
        batting: { hr: 1 },
        fielding: {},
        pitching: {},
      };

      const basePlayer = (
        id: string,
        positionId: number | null,
      ): MatchupPlayerFragment => ({
        __typename: 'MatchupPlayer',
        id,
        matchupId: 1234,
        playerId: Number(id),
        teamId: 10,
        positionId,
        season: 2023,
        numberOfGames: 1,
        player: null,
        seasonBatting: null,
        seasonPitching: null,
        seasonFielding: null,
        games: [
          {
            __typename: 'MatchupPlayerGame',
            id: Number(id),
            matchupPlayerId: Number(id),
            gameNum: 1,
            gameIdentifier: 'GAME1',
            gamePosition: null,
            statsLoadingStatus: null,
            pitcherStartSkipped: false,
            noGameDataFound: false,
            battingGame: {
              __typename: 'GameBatting',
              playerId: Number(id),
              season: 2023,
              gameNum: 1,
              gameIdentifier: 'GAME1',
              plateAppearances: 4,
              atBats: 4,
              runs: 0,
              hits: 1,
              doubles: 0,
              triples: 0,
              homeRuns: 5,
              rbi: 0,
              stolenBases: 0,
              caughtStealing: 0,
              baseOnBalls: 0,
              strikeouts: 0,
              groundedIntoDoublePlays: 0,
              hitByPitch: 0,
              sacrificeHits: 0,
              sacrificeFlies: '0',
              intentionalBaseOnBalls: 0,
              battingAverage: 0.25,
            },
            pitchingGame: null,
            fieldingGame: null,
          },
        ],
      });

      const players: MatchupPlayerFragment[] = [
        basePlayer('1', 1), // counted
        basePlayer('2', null), // skipped — no position assigned
      ];

      const result = computeMatchupScores({
        matchup: makeMatchup({ team1Score: 0, team2Score: 0 }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(5);
    });
  });

  describe('completed matchups defer to the server score (BMD-009)', () => {
    const scoring: ScoringSettings = {
      batting: { hr: 1 },
      fielding: {},
      pitching: {},
    };

    const makePlayer = (
      id: string,
      teamId: number,
      playerId: number,
      homeRuns: number,
    ): MatchupPlayerFragment => ({
      __typename: 'MatchupPlayer',
      id,
      matchupId: 1234,
      playerId,
      teamId,
      positionId: 1,
      season: 2023,
      numberOfGames: 1,
      player: null,
      seasonBatting: null,
      seasonPitching: null,
      seasonFielding: null,
      games: [
        {
          __typename: 'MatchupPlayerGame',
          id: Number(id),
          matchupPlayerId: Number(id),
          gameNum: 1,
          gameIdentifier: 'GAME1',
          gamePosition: null,
          statsLoadingStatus: null,
          pitcherStartSkipped: false,
          noGameDataFound: false,
          battingGame: {
            __typename: 'GameBatting',
            playerId,
            season: 2023,
            gameNum: 1,
            gameIdentifier: 'GAME1',
            plateAppearances: 4,
            atBats: 4,
            runs: 0,
            hits: 1,
            doubles: 0,
            triples: 0,
            homeRuns,
            rbi: 0,
            stolenBases: 0,
            caughtStealing: 0,
            baseOnBalls: 0,
            strikeouts: 0,
            groundedIntoDoublePlays: 0,
            hitByPitch: 0,
            sacrificeHits: 0,
            sacrificeFlies: '0',
            intentionalBaseOnBalls: 0,
            battingAverage: 0.25,
          },
          pitchingGame: null,
          fieldingGame: null,
        },
      ],
    });

    beforeEach(() => {
      jest.clearAllMocks();
      jest.mocked(getEnvironmentConfig).mockReturnValue({
        isDev: false,
      } as ReturnType<typeof getEnvironmentConfig>);
    });

    it('uses the server-stored score verbatim instead of recomputing from player games', () => {
      // 3 HRs would compute to 3 client-side, but the completed matchup's
      // server-stored score (87.5) must win.
      const players: MatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      const result = computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.Completed,
          team1Score: 87.5,
          team2Score: 138.0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(87.5);
      expect(result.team2Score).toBe(138.0);
    });

    it('returns null projections for completed matchups (not shown by the view)', () => {
      const players: MatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      const result = computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.Completed,
          team1Score: 3,
          team2Score: 0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Projected).toBeNull();
      expect(result.team2Projected).toBeNull();
    });

    it('does not warn in dev when the server score matches the client computation', () => {
      jest.mocked(getEnvironmentConfig).mockReturnValue({
        isDev: true,
      } as ReturnType<typeof getEnvironmentConfig>);
      const players: MatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.Completed,
          team1Score: 3, // matches the 3 HRs computed client-side
          team2Score: 0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    it('warns in dev when the server score diverges from the client computation', () => {
      jest.mocked(getEnvironmentConfig).mockReturnValue({
        isDev: true,
      } as ReturnType<typeof getEnvironmentConfig>);
      const players: MatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.Completed,
          team1Score: 145.91, // diverges from the 3 HRs computed client-side
          team2Score: 0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(LOGGER.warn).toHaveBeenCalledWith(
        'Matchup score parity drift: client-computed score diverges from server-stored score',
        expect.objectContaining({
          serverTeam1Score: 145.91,
          clientTeam1Score: 3,
        }),
      );
    });

    it('does not warn outside of dev even when scores diverge', () => {
      const players: MatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.Completed,
          team1Score: 145.91,
          team2Score: 0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(LOGGER.warn).not.toHaveBeenCalled();
    });
  });
});

describe('MatchupScoreboard — live score updates via liveUpdateSignal (LS-5425)', () => {
  // MatchupDetailPage owns the real WebSocket connection and per-matchup
  // filtering for this route (see its own doc comment — this component has
  // no LeagueWebSocketContext.Provider ancestor to subscribe through) and
  // bumps `liveUpdateSignal` on every MATCHUP_STATS_COMPLETE/reconnect event
  // for the displayed matchup. This component's own responsibility is just:
  // refetch players when that signal changes, and not on initial mount.
  let refetchPlayers: jest.Mock;

  beforeEach(() => {
    refetchPlayers = jest.fn();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
      error: undefined,
      refetch: refetchPlayers,
    });
    mockUseGetLeagueTeamsQuery.mockReturnValue({
      data: { leagueTeams: [] },
    });
    mockUseGetLeagueStandingsQuery.mockReturnValue({ data: undefined });
    mockUseLeagueScoringSettings.mockReturnValue({
      settings: { batting: {}, pitching: {}, fielding: {} },
    });
  });

  const matchup = {
    __typename: 'Matchup',
    id: '1',
    weekNumber: 3,
    leagueId: 10,
    team1Id: 101,
    team2Id: 102,
    team1Score: 0,
    team2Score: 0,
    status: MatchupStatus.InProgress,
    statsLoadingStatus: StatsLoadingStatus.Completed,
    gamesPerMatchup: 5,
    pitcherStartsPerMatchup: 1,
    selectedGamesCount: 2,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: 101, name: 'Aces' },
    team2: { __typename: 'Team', id: 102, name: 'Bolts' },
  } as unknown as MatchupFragment;

  it('does not refetch players on initial mount', () => {
    render(<MatchupScoreboard matchup={matchup} liveUpdateSignal={0} />);

    expect(refetchPlayers).not.toHaveBeenCalled();
  });

  it('refetches players when liveUpdateSignal changes', () => {
    const { rerender } = render(
      <MatchupScoreboard matchup={matchup} liveUpdateSignal={0} />,
    );

    rerender(<MatchupScoreboard matchup={matchup} liveUpdateSignal={1} />);

    expect(refetchPlayers).toHaveBeenCalledTimes(1);
  });

  it('refetches again on each subsequent liveUpdateSignal bump', () => {
    const { rerender } = render(
      <MatchupScoreboard matchup={matchup} liveUpdateSignal={1} />,
    );

    rerender(<MatchupScoreboard matchup={matchup} liveUpdateSignal={2} />);

    expect(refetchPlayers).toHaveBeenCalledTimes(1);
  });
});

describe('computeFootballMatchupPlayerStats (LS-10829)', () => {
  const players = [
    { playerId: 17, teamId: 10, positionId: 1, season: 2020 },
    { playerId: 41, teamId: 10, positionId: 2, season: 2019 },
    // Bench (no slot): matchupScores never scores bench players.
    { playerId: 87, teamId: 10, positionId: null, season: 2011 },
    // Starter matchupScores has not returned (yet).
    { playerId: 99, teamId: 20, positionId: 3, season: 2015 },
  ] as unknown as MatchupPlayerFragment[];
  const playerScores = new Map([
    [
      17,
      {
        actual: 21.7,
        projected: 21.7,
        gamesPlayed: 1,
        dataQuality: FootballStatsDataQuality.Ok,
      },
    ],
    [
      41,
      {
        actual: 0,
        projected: 17.5,
        gamesPlayed: 0,
        dataQuality: FootballStatsDataQuality.Ok,
      },
    ],
    [
      87,
      {
        actual: 9,
        projected: 9,
        gamesPlayed: 1,
        dataQuality: FootballStatsDataQuality.Ok,
      },
    ],
  ]);

  it('reads per-starter actual/projected points from matchupScores', () => {
    expect(computeFootballMatchupPlayerStats(players, playerScores)).toEqual([
      {
        playerId: 17,
        actual: 21.7,
        projected: 21.7,
        gamesPlayed: 1,
        totalGames: 1,
        season: 2020,
        teamId: 10,
        positionId: 1,
      },
      {
        playerId: 41,
        actual: 0,
        projected: 17.5,
        gamesPlayed: 0,
        totalGames: 1,
        season: 2019,
        teamId: 10,
        positionId: 2,
      },
    ]);
  });

  it('sums to the matchupScores team projection, not 0.0', () => {
    const rows = computeFootballMatchupPlayerStats(players, playerScores);
    const teamProjected = rows.reduce((sum, r) => sum + r.projected, 0);
    expect(teamProjected).toBeCloseTo(39.2);
  });
});

describe('MatchupScoreboard — football league (LS-10829)', () => {
  const matchup = makeMatchup({ leagueId: 10, weekNumber: 3 });
  const lastViewProps = () =>
    mockScoreboardView.mock.calls.at(-1)?.[0] as {
      team1Score: number | null;
      team2Score: number | null;
      team1Projected: number | null;
      team2Projected: number | null;
    };

  beforeEach(() => {
    mockScoreboardView.mockClear();
    mockUseFootballMatchupScores.mockClear();
    mockComputeFootballMatchupTotals.mockClear();
    mockRefetchFootballScores.mockClear();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: undefined,
      error: undefined,
      refetch: jest.fn(),
    });
    mockUseGetLeagueTeamsQuery.mockReturnValue({ data: { leagueTeams: [] } });
  });

  it('renders the matchupScores team totals instead of the baseball recompute', () => {
    render(<MatchupScoreboard matchup={matchup} isFootball />);

    expect(mockUseFootballMatchupScores).toHaveBeenCalledWith({
      leagueId: 10,
      weekNum: 3,
      skip: false,
    });
    expect(mockUseGetMatchupPlayersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(lastViewProps()).toMatchObject({
      team1Score: 105.2,
      team2Score: 98.4,
      team1Projected: 107.2,
      team2Projected: 101.9,
    });
  });

  it('refetches matchupScores on a live update signal', () => {
    const { rerender } = render(
      <MatchupScoreboard matchup={matchup} isFootball liveUpdateSignal={0} />,
    );
    rerender(
      <MatchupScoreboard matchup={matchup} isFootball liveUpdateSignal={1} />,
    );

    expect(mockRefetchFootballScores).toHaveBeenCalledTimes(1);
  });

  it('skips matchupScores for a baseball league', () => {
    render(<MatchupScoreboard matchup={matchup} />);

    expect(mockUseFootballMatchupScores).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(mockComputeFootballMatchupTotals).not.toHaveBeenCalled();
  });
});

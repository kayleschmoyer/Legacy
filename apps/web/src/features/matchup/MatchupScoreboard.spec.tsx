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
import { MatchupStatus, StatsLoadingStatus } from '@legacy-sports/graphql';
import { computeMatchupScores, MatchupScoreboard } from './MatchupScoreboard';
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
  };
});

const mockUseLeagueScoringSettings = jest.fn(() => ({
  settings: { batting: {}, pitching: {}, fielding: {} },
}));
jest.mock('../../lib/scoring', () => ({
  useLeagueScoringSettings: (id: unknown): unknown =>
    mockUseLeagueScoringSettings(id),
}));

jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupScoreboardView: () => <div data-testid="scoreboard-view" />,
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

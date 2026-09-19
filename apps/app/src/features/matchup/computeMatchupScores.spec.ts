/**
 * Unit tests for `computeMatchupScores` — the native mirror of web's
 * `MatchupScoreboard.tsx#computeMatchupScores`.
 *
 * Regression coverage for LS-2937: falls back to the matchup's server-stored
 * `team1Score`/`team2Score` when the `getMatchupPlayers` query errors (or
 * required inputs are missing) instead of collapsing to 0-0.
 *
 * Regression coverage for LS-6390 (porting BMD-009/LS-5879 to mobile): once a
 * matchup is `Completed`, the server-stored score must be used verbatim
 * instead of being recomputed from raw per-player stats — recomputing past
 * `Completed` is what caused mobile's score to diverge from web's, since web
 * already stopped recomputing at that point.
 */
import type {
  AppMatchupFragment,
  AppMatchupPlayerFragment,
} from '@legacy-sports/graphql';
import { MatchupStatus } from '@legacy-sports/graphql';
import { computeMatchupScores } from './computeMatchupScores';
import type { ScoringSettings } from '../../common/scoring';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Typing warn as jest.Mock (not the original method) sidesteps
// @typescript-eslint/unbound-method; requireMock returns the live mock instance.
const { LOGGER } = jest.requireMock<{ LOGGER: { warn: jest.Mock } }>(
  '@legacy-sports/logging',
);

function makeMatchup(
  overrides: Partial<AppMatchupFragment> = {},
): AppMatchupFragment {
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
    cancellationReason: null,
    statsLoadingStatus: null,
    gamesPerMatchup: 10,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 5,
    startTime: null,
    endTime: null,
    scoringIsStale: false,
    scoringChangeLog: [],
    ...overrides,
  };
}

const emptyScoringSettings: ScoringSettings = {
  batting: {},
  fielding: {},
  pitching: {},
};

const emptySeasonStatsMap: ReadonlyMap<number, never> = new Map<
  number,
  never
>();

describe('computeMatchupScores', () => {
  describe('fallback to server-stored scores (LS-2937 regression)', () => {
    it('uses matchup.team1Score/team2Score when the players query errored', () => {
      const matchup = makeMatchup({ team1Score: 87.5, team2Score: 138.0 });

      const result = computeMatchupScores({
        matchup,
        players: [],
        hasPlayersError: true,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result).toEqual({
        team1Score: 87.5,
        team2Score: 138.0,
        team1Projected: null,
        team2Projected: null,
      });
    });

    it('uses matchup.team1Score/team2Score when players is null', () => {
      const matchup = makeMatchup({ team1Score: 12, team2Score: 34 });

      const result = computeMatchupScores({
        matchup,
        players: null,
        hasPlayersError: false,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(12);
      expect(result.team2Score).toBe(34);
    });

    it('falls back to 0 when matchup itself is missing', () => {
      const result = computeMatchupScores({
        matchup: null,
        players: [],
        hasPlayersError: true,
        scoringSettings: emptyScoringSettings,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result).toEqual({
        team1Score: 0,
        team2Score: 0,
        team1Projected: null,
        team2Projected: null,
      });
    });
  });

  describe('completed matchups defer to the server score (LS-6390 / BMD-009)', () => {
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
    ): AppMatchupPlayerFragment => ({
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
          },
          pitchingGame: null,
          fieldingGame: null,
        },
      ],
    });

    beforeEach(() => {
      jest.clearAllMocks();
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    });

    it('uses the server-stored score verbatim instead of recomputing from player games', () => {
      // 3 HRs would compute to 3 client-side, but the completed matchup's
      // server-stored score (87.5) must win.
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

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

    it('returns null projections for completed matchups', () => {
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

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
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

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
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

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
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

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

    it('still recomputes client-side for in-progress matchups', () => {
      const players: AppMatchupPlayerFragment[] = [makePlayer('1', 10, 100, 3)];

      const result = computeMatchupScores({
        matchup: makeMatchup({
          status: MatchupStatus.InProgress,
          team1Score: 999, // stale server value — must be ignored while live
          team2Score: 0,
        }),
        players,
        hasPlayersError: false,
        scoringSettings: scoring,
        seasonStatsMap: emptySeasonStatsMap,
      });

      expect(result.team1Score).toBe(3);
    });
  });
});

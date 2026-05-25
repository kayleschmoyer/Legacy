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
 */
import { computeMatchupScores } from './MatchupScoreboard';
import type {
  MatchupFragment,
  MatchupPlayerFragment,
} from '../../api/db/graphql.generated';
import {
  MatchupStatus,
  StatsLoadingStatus,
} from '../../api/db/graphql.generated';
import type { ScoringSettings } from '../../lib/scoring';

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
});

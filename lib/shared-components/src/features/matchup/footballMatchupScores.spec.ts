/**
 * Tests for football matchup scoring on the client (LS-10829, LS-10794).
 *
 * Covers:
 *   - mapFootballMatchupScores indexes matchupScores by player and team id
 *   - computeFootballMatchupTotals: live totals from matchupScores, stored
 *     scores once Completed, the pre-lock fallback, bye matchups, and the
 *     unavailable state that replaces a fabricated 0–0 "tie"
 */
import {
  FootballStatsDataQuality,
  type MatchupScoresQuery,
  MatchupStatus,
} from '@legacy-sports/graphql';
import {
  computeFootballMatchupTotals,
  type FootballScore,
  mapFootballMatchupScores,
} from './footballMatchupScores';

type TeamStats = Extract<
  MatchupScoresQuery['matchupScores'][number],
  { __typename?: 'FootballMatchupStats' }
>;
type PlayerStats = TeamStats['players'][number];

function player(overrides: Partial<PlayerStats>): PlayerStats {
  return {
    __typename: 'FootballMatchupPlayer',
    playerId: 1,
    playerName: 'Player',
    position: 'QB',
    totalPoints: 0,
    projectedPoints: 0,
    dataQuality: FootballStatsDataQuality.Ok,
    games: [],
    ...overrides,
  };
}

function team(overrides: Partial<TeamStats>): TeamStats {
  return {
    __typename: 'FootballMatchupStats',
    teamId: 10,
    teamName: 'Team',
    totalPoints: 0,
    projectedPoints: 0,
    players: [],
    ...overrides,
  };
}

const game = { gameNum: 1, opponent: 'MIA', fantasyPoints: 21.7 };

describe('mapFootballMatchupScores', () => {
  it('indexes starters by player id and teams by team id', () => {
    const { playerScores, teamScores } = mapFootballMatchupScores({
      matchupScores: [
        team({
          teamId: 10,
          totalPoints: 42.1,
          projectedPoints: 107.2,
          players: [
            player({
              playerId: 17,
              totalPoints: 21.7,
              projectedPoints: 21.7,
              games: [game],
            }),
            player({
              playerId: 41,
              totalPoints: 0,
              projectedPoints: 17.5,
              dataQuality: FootballStatsDataQuality.StatsPending,
            }),
          ],
        }),
        team({ teamId: 20, totalPoints: 30, projectedPoints: 95 }),
      ],
    });

    expect(teamScores.get(10)).toEqual({ actual: 42.1, projected: 107.2 });
    expect(teamScores.get(20)).toEqual({ actual: 30, projected: 95 });
    expect(playerScores.get(17)).toEqual({
      actual: 21.7,
      projected: 21.7,
      gamesPlayed: 1,
      dataQuality: FootballStatsDataQuality.Ok,
    });
    expect(playerScores.get(41)).toMatchObject({
      projected: 17.5,
      gamesPlayed: 0,
      dataQuality: FootballStatsDataQuality.StatsPending,
    });
  });

  it('returns empty maps before the query has data', () => {
    const { playerScores, teamScores } = mapFootballMatchupScores(undefined);
    expect(playerScores.size).toBe(0);
    expect(teamScores.size).toBe(0);
  });
});

describe('computeFootballMatchupTotals', () => {
  const live = {
    status: MatchupStatus.InProgress,
    team1Id: 10,
    team2Id: 20,
    team1Score: 0,
    team2Score: 0,
  };
  const teamScores = new Map<number, FootballScore>([
    [10, { actual: 105.2, projected: 107.2 }],
    [20, { actual: 98.4, projected: 101.9 }],
  ]);

  it('uses the matchupScores team totals for a live matchup', () => {
    expect(computeFootballMatchupTotals(live, teamScores)).toEqual({
      team1Score: 105.2,
      team2Score: 98.4,
      team1Projected: 107.2,
      team2Projected: 101.9,
      scoresUnavailable: false,
    });
  });

  it('shows projections for a scheduled matchup once totals load', () => {
    expect(
      computeFootballMatchupTotals(
        { ...live, status: MatchupStatus.Scheduled },
        teamScores,
      ),
    ).toMatchObject({ team1Projected: 107.2, team2Projected: 101.9 });
  });

  it('keeps the stored scores as the authority once Completed', () => {
    expect(
      computeFootballMatchupTotals(
        {
          ...live,
          status: MatchupStatus.Completed,
          team1Score: 235.58,
          team2Score: 254.78,
        },
        teamScores,
      ),
    ).toEqual({
      team1Score: 235.58,
      team2Score: 254.78,
      team1Projected: null,
      team2Projected: null,
      scoresUnavailable: false,
    });
  });

  it('reports a live matchup with no totals as unavailable rather than 0–0', () => {
    expect(computeFootballMatchupTotals(live, new Map())).toEqual({
      team1Score: null,
      team2Score: null,
      team1Projected: null,
      team2Projected: null,
      scoresUnavailable: true,
    });
  });

  it('falls back to a non-zero stored score while live totals are missing (LS-2937)', () => {
    expect(
      computeFootballMatchupTotals(
        { ...live, team1Score: 102.4, team2Score: 96.8 },
        new Map(),
      ),
    ).toEqual({
      team1Score: 102.4,
      team2Score: 96.8,
      team1Projected: null,
      team2Projected: null,
      scoresUnavailable: false,
    });
  });

  it('is unavailable when only one side has loaded', () => {
    expect(
      computeFootballMatchupTotals(
        live,
        new Map([[10, { actual: 1, projected: 2 }]]),
      ).scoresUnavailable,
    ).toBe(true);
  });

  it('falls back to the stored score before kickoff when totals are missing', () => {
    expect(
      computeFootballMatchupTotals(
        { ...live, status: MatchupStatus.Scheduled },
        new Map(),
      ),
    ).toMatchObject({ team1Score: 0, team2Score: 0, scoresUnavailable: false });
  });

  it('resolves a bye matchup from the one team that plays', () => {
    expect(
      computeFootballMatchupTotals(
        { ...live, team2Id: null },
        new Map([[10, { actual: 12, projected: 80 }]]),
      ),
    ).toMatchObject({
      team1Score: 12,
      team1Projected: 80,
      team2Projected: null,
      scoresUnavailable: false,
    });
  });
});

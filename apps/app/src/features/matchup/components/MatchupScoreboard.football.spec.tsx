/**
 * MatchupScoreboard (native) — football scoring wiring (LS-10829, LS-10794).
 *
 * The baseball-only client recompute summed in-progress NFL matchups to 0–0
 * and the hero announced a tie. For football the scoreboard must read the
 * server-computed `matchupScores` team totals and pass `scoresUnavailable`
 * through while they load. The totals logic itself is covered by
 * shared-components' footballMatchupScores.spec.ts.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  type AppMatchupFragment,
  MatchupStatus,
  StatsLoadingStatus,
} from '@legacy-sports/graphql';
import { MatchupScoreboard } from './MatchupScoreboard';

// Layout primitives only; the hero (the real UI) is stubbed below.
jest.mock('tamagui', () => ({
  YStack: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Spinner: () => null,
}));
jest.mock('../../subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: false }),
}));
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  AUTHORIZED_CONTEXT: jest
    .requireActual<typeof import('react')>('react')
    .createContext(null),
}));
jest.mock('../../../common/scoring', () => ({
  useLeagueScoringSettings: () => ({ settings: null }),
}));
jest.mock('../../../common/scoring/mapGraphQLToScoringFormat', () => ({
  mapMatchupPlayerToSeasonStats: () => null,
}));

const mockUseGetMatchupPlayersQuery = jest.fn((_opts: unknown) => ({
  data: undefined,
  error: undefined,
}));
jest.mock('@legacy-sports/graphql', () => ({
  ...jest.requireActual<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  ),
  useGetMatchupPlayersQuery: (opts: unknown) =>
    mockUseGetMatchupPlayersQuery(opts),
  useGetLeagueTeamsQuery: () => ({ data: undefined }),
  useGetUserPreferencesQuery: () => ({ data: undefined }),
}));

const mockHero = jest.fn((_props: unknown) => null);
const mockUseFootballMatchupScores = jest.fn((_args: unknown) => ({
  playerScores: new Map(),
  teamScores: new Map(),
  loading: false,
  hasError: false,
  refetch: jest.fn(),
}));
const mockComputeFootballMatchupTotals = jest.fn(
  (_matchup: unknown, _teamScores: unknown) => ({
    team1Score: null as number | null,
    team2Score: null as number | null,
    team1Projected: null as number | null,
    team2Projected: null as number | null,
    scoresUnavailable: true,
  }),
);
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  formatMatchupTimeInfo: () => null,
  MatchupScoreboardHero: (props: unknown) => mockHero(props),
  useFootballMatchupScores: (args: unknown) =>
    mockUseFootballMatchupScores(args),
  computeFootballMatchupTotals: (matchup: unknown, teamScores: unknown) =>
    mockComputeFootballMatchupTotals(matchup, teamScores),
}));

const matchup = {
  __typename: 'Matchup',
  id: '7',
  weekNumber: 1,
  leagueId: 14261,
  team1Id: 10,
  team2Id: 20,
  team1Score: 0,
  team2Score: 0,
  status: MatchupStatus.InProgress,
  statsLoadingStatus: StatsLoadingStatus.Completed,
  gamesPerMatchup: 1,
} as unknown as AppMatchupFragment;

type HeroProps = {
  team1: { score?: number | null; projectedScore?: number | null };
  team2: { score?: number | null; projectedScore?: number | null };
  scoresUnavailable?: boolean;
};
const lastHeroProps = () => mockHero.mock.calls.at(-1)?.[0] as HeroProps;

beforeEach(() => {
  mockHero.mockClear();
  mockUseFootballMatchupScores.mockClear();
  mockComputeFootballMatchupTotals.mockClear();
  mockUseGetMatchupPlayersQuery.mockClear();
});

describe('MatchupScoreboard (native) — football', () => {
  it('scores from matchupScores team totals and skips the baseball players query', () => {
    mockComputeFootballMatchupTotals.mockReturnValueOnce({
      team1Score: 235.58,
      team2Score: 254.78,
      team1Projected: 240,
      team2Projected: 260,
      scoresUnavailable: false,
    });
    render(<MatchupScoreboard matchup={matchup} leagueId={14261} isFootball />);

    expect(mockUseFootballMatchupScores).toHaveBeenCalledWith({
      leagueId: 14261,
      weekNum: 1,
      skip: false,
    });
    expect(mockUseGetMatchupPlayersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(lastHeroProps().team1).toMatchObject({
      score: 235.58,
      projectedScore: 240,
    });
    expect(lastHeroProps().team2).toMatchObject({
      score: 254.78,
      projectedScore: 260,
    });
    expect(lastHeroProps().scoresUnavailable).toBe(false);
  });

  it('passes scoresUnavailable while matchupScores has not loaded', () => {
    render(<MatchupScoreboard matchup={matchup} leagueId={14261} isFootball />);

    expect(lastHeroProps().scoresUnavailable).toBe(true);
    expect(lastHeroProps().team1.score).toBeNull();
  });

  it('leaves baseball on the client recompute', () => {
    render(<MatchupScoreboard matchup={matchup} leagueId={14261} />);

    expect(mockUseFootballMatchupScores).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(mockComputeFootballMatchupTotals).not.toHaveBeenCalled();
    expect(lastHeroProps().scoresUnavailable).toBe(false);
  });
});

/**
 * Unit tests for MatchupWinProbabilityPanel (LS-5358, updated LS-5907).
 *
 * Mirrors the mobile coverage in
 * apps/app/src/features/matchup/components/MatchupWinProbabilityPanel.spec.tsx
 * for the panel's own render logic (category breakdown wiring, visibility
 * rules). Win probability itself is server-computed and gated by
 * ENTITLEMENTS.matchup_projections (LS-5907) — the panel only renders what
 * `useGetMatchupWinProbabilityQuery` returns, never computing it client-side.
 * Premium-gate composition is intentionally left to the hermetic E2E suite
 * (apps/web-e2e/src/tests/matchup-week-navigation.spec.ts), which already
 * exercises the full `PremiumGate` + panel flow end to end.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
} from '@legacy-sports/graphql';
import { MatchupWinProbabilityPanel } from './MatchupWinProbabilityPanel';

// ── Mocks ────────────────────────────────────────────────────────────────────

type Children = { children?: React.ReactNode; [key: string]: unknown };

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: PassThrough,
    YStack: PassThrough,
    XStack: PassThrough,
    Text: ({ children }: Children) => <span>{children}</span>,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Target: () => null,
  TrendingUp: () => null,
}));

const mockComputeScoring = jest.fn();
const mockCalculateMatchupProjection = jest.fn();
jest.mock('@legacy-sports/scoring', () => ({
  computeScoring: (...args: unknown[]): number =>
    mockComputeScoring(...args) as number,
  calculateMatchupProjection: (...args: unknown[]): unknown =>
    mockCalculateMatchupProjection(...args),
}));

const mockUseGetMatchupPlayersQuery = jest.fn();
const mockUseGetLeagueTeamsQuery = jest.fn();
const mockUseGetMatchupWinProbabilityQuery = jest.fn();
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
    useGetMatchupWinProbabilityQuery: (opts: unknown): unknown =>
      mockUseGetMatchupWinProbabilityQuery(opts),
  };
});

const mockUseLeagueScoringSettings = jest.fn();
jest.mock('../../lib/scoring', () => ({
  useLeagueScoringSettings: (id: unknown): unknown =>
    mockUseLeagueScoringSettings(id),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeMatchup(
  overrides: Partial<MatchupFragment> = {},
): MatchupFragment {
  return {
    __typename: 'Matchup',
    id: '1',
    weekNumber: 3,
    leagueId: 10,
    team1Id: 101,
    team2Id: 102,
    team1Score: 0,
    team2Score: 0,
    status: MatchupStatus.Scheduled,
    statsLoadingStatus: null,
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 1,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: 101, name: 'Aces' },
    team2: { __typename: 'Team', id: 102, name: 'Bolts' },
    ...overrides,
  };
}

// One starter per team, no games played yet -> projection drives the totals.
const PLAYERS: MatchupPlayerFragment[] = [
  {
    __typename: 'MatchupPlayer',
    id: '1',
    matchupId: 1,
    positionId: 1,
    teamId: 101,
    playerId: 1,
    season: 2025,
    numberOfGames: 1,
    player: null,
    games: [],
    seasonBatting: { __typename: 'SeasonBattingStats', games: 1 } as never,
    seasonPitching: null,
    seasonFielding: null,
  } as unknown as MatchupPlayerFragment,
  {
    __typename: 'MatchupPlayer',
    id: '2',
    matchupId: 1,
    positionId: 1,
    teamId: 102,
    playerId: 2,
    season: 2025,
    numberOfGames: 1,
    player: null,
    games: [],
    seasonBatting: { __typename: 'SeasonBattingStats', games: 1 } as never,
    seasonPitching: null,
    seasonFielding: null,
  } as unknown as MatchupPlayerFragment,
];

const WIN_PROBABILITY = {
  __typename: 'MatchupWinProbability',
  team1WinProbability: 0.62,
  team2WinProbability: 0.38,
  tiesProbability: 0,
  team1ProjectedScore: 100.5,
  team2ProjectedScore: 88.25,
  simulationCount: 5000,
};

function primeProjectionMocks() {
  mockUseGetMatchupPlayersQuery.mockReturnValue({
    data: { getMatchupPlayers: PLAYERS },
  });
  mockUseGetLeagueTeamsQuery.mockReturnValue({
    data: {
      leagueTeams: [
        { id: 101, name: 'Aces' },
        { id: 102, name: 'Bolts' },
      ],
    },
  });
  mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
    data: {
      getMatchupById: {
        __typename: 'Matchup',
        winProbability: WIN_PROBABILITY,
      },
    },
  });
  mockUseLeagueScoringSettings.mockReturnValue({
    settings: { batting: {}, pitching: {}, fielding: {} },
  });
  mockComputeScoring.mockReturnValue(0);
  mockCalculateMatchupProjection.mockReturnValue({
    totalPerGame: 100,
    battingPerGame: 50,
    pitchingPerGame: 30,
    fieldingPerGame: 20,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MatchupWinProbabilityPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders win probability, projected scores, and team names from the server-computed field', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.getByText('Win Probability')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('100.50')).toBeInTheDocument();
    expect(screen.getByText('88.25')).toBeInTheDocument();
    expect(screen.getAllByText('Aces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bolts').length).toBeGreaterThan(0);
    expect(mockUseGetMatchupWinProbabilityQuery).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: 1 } }),
    );
  });

  it('renders a tie-probability hint when the tie share rounds to at least one point', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: {
        getMatchupById: {
          __typename: 'Matchup',
          winProbability: {
            __typename: 'MatchupWinProbability',
            team1WinProbability: 0.49,
            team2WinProbability: 0.49,
            tiesProbability: 0.02,
            team1ProjectedScore: 100.5,
            team2ProjectedScore: 100.4,
            simulationCount: 5000,
          },
        },
      },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.getAllByText('49%')).toHaveLength(2);
    expect(screen.getByText('2% tie')).toBeInTheDocument();
  });

  it('does not render a tie-probability hint when the tie probability is negligible', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.queryByText(/% tie/)).not.toBeInTheDocument();
  });

  it('renders whole percentages that add up to 100 when independent rounding would not (LS-9838)', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: {
        getMatchupById: {
          __typename: 'Matchup',
          winProbability: {
            __typename: 'MatchupWinProbability',
            // Rounding each value on its own gives 50 / 50 / 1 = 101.
            team1WinProbability: 0.495,
            team2WinProbability: 0.495,
            tiesProbability: 0.01,
            team1ProjectedScore: 100.5,
            team2ProjectedScore: 100.4,
            simulationCount: 5000,
          },
        },
      },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('49%')).toBeInTheDocument();
    // A tie share worth a whole point is always shown, so the numbers on screen
    // add up to 100 instead of reading 50 / 49 with a point unaccounted for.
    expect(screen.getByText('1% tie')).toBeInTheDocument();
  });

  it('renders the category breakdown and simulation footnote', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.getByText('BATTING')).toBeInTheDocument();
    expect(screen.getByText('PITCHING')).toBeInTheDocument();
    expect(screen.getByText('FIELDING')).toBeInTheDocument();
    expect(screen.getByText(/based on 5,000 simulations/i)).toBeInTheDocument();
  });

  it('renders nothing for completed matchups', () => {
    primeProjectionMocks();

    render(
      <MatchupWinProbabilityPanel
        matchup={makeMatchup({ status: MatchupStatus.Completed })}
      />,
    );

    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
  });

  it('renders nothing when the server returns no win probability (non-entitled or unauthenticated caller)', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { __typename: 'Matchup', winProbability: null } },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // LS-5907: visibility is gated entirely by the server response — a free
    // user gets `null` back from the entitlement-gated field. With the
    // default (non-empty) players, category totals are non-zero, so this
    // isn't the pre-season case either — the panel renders nothing.
    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
  });

  it('renders the pre-season fallback for a scheduled matchup with no projection-eligible players', () => {
    primeProjectionMocks();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { __typename: 'Matchup', winProbability: null } },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // LS-5909: no rostered players means the category totals stay at zero,
    // so the panel shows an explicit pre-season placeholder instead of
    // rendering nothing. Win probability itself is still never computed
    // client-side (LS-5907) — the server's null is what gates this branch.
    expect(screen.getByText('Win Probability')).toBeInTheDocument();
    expect(
      screen.getByText('Win probability will appear once games are scheduled.'),
    ).toBeInTheDocument();
  });

  it('renders nothing for a null matchup', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={null} />);

    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
  });

  it('does not re-run the category-breakdown projection when playersData identity changes but content is unchanged (LS-5911)', () => {
    let queryCallCount = 0;
    mockUseGetMatchupPlayersQuery.mockImplementation(() => {
      queryCallCount += 1;
      // New array + object references each call (as Apollo returns on an
      // unrelated cache update), but identical content to the previous call.
      return {
        data: { getMatchupPlayers: PLAYERS.map((p) => ({ ...p })) },
      };
    });
    mockUseGetLeagueTeamsQuery.mockReturnValue({
      data: {
        leagueTeams: [
          { id: 101, name: 'Aces' },
          { id: 102, name: 'Bolts' },
        ],
      },
    });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: {
        getMatchupById: {
          __typename: 'Matchup',
          winProbability: WIN_PROBABILITY,
        },
      },
    });
    mockUseLeagueScoringSettings.mockReturnValue({
      settings: { batting: {}, pitching: {}, fielding: {} },
    });
    mockComputeScoring.mockReturnValue(0);
    mockCalculateMatchupProjection.mockReturnValue({
      totalPerGame: 100,
      battingPerGame: 50,
      pitchingPerGame: 30,
      fieldingPerGame: 20,
    });

    const matchup = makeMatchup();
    const { rerender } = render(
      <MatchupWinProbabilityPanel matchup={matchup} />,
    );
    const callsAfterFirstRender =
      mockCalculateMatchupProjection.mock.calls.length;
    expect(callsAfterFirstRender).toBeGreaterThan(0);

    rerender(<MatchupWinProbabilityPanel matchup={matchup} />);

    // Confirm the query hook really did return a new object identity on the
    // second render (otherwise this test would pass trivially).
    expect(queryCallCount).toBeGreaterThan(1);
    // The category-breakdown computation must not re-run since the
    // underlying content did not change.
    expect(mockCalculateMatchupProjection.mock.calls.length).toBe(
      callsAfterFirstRender,
    );
  });

  it('renders nothing when totals are 0 for a non-scheduled, non-completed matchup', () => {
    primeProjectionMocks();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { __typename: 'Matchup', winProbability: null } },
    });

    render(
      <MatchupWinProbabilityPanel
        matchup={makeMatchup({ status: MatchupStatus.InProgress })}
      />,
    );

    // Zero category totals only trigger the pre-season placeholder for
    // Scheduled matchups; an in-progress matchup with no server win
    // probability renders nothing.
    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
  });

  it('still renders the server win probability (no throw) when the category-breakdown projection throws', () => {
    primeProjectionMocks();
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // A thrown category-breakdown projection must not crash the panel or
    // hide the (independently server-sourced) win probability — the render
    // itself must not throw or unhandled-reject.
    expect(screen.getByText('Win Probability')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('falls back to the pre-season card (no throw) when the category projection throws and the server has no win probability', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { __typename: 'Matchup', winProbability: null } },
    });
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // No played games and a thrown projection means both teams stay at 0 —
    // combined with no server win probability, the pre-season fallback
    // renders instead of nothing; the render itself must not throw.
    expect(
      screen.getByText('Win probability will appear once games are scheduled.'),
    ).toBeInTheDocument();
  });
});

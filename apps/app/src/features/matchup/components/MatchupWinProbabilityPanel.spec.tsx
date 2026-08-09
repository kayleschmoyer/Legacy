import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { MatchupWinProbabilityPanel } from './MatchupWinProbabilityPanel';
import { PremiumGate } from '../../subscription/PremiumGate';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock tamagui to plain React Native primitives so the components render
// without a TamaguiProvider/theme (mirrors PremiumGate.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const passthrough =
    (Host: React.ComponentType<{ children?: React.ReactNode }>) =>
    ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      ReactActual.createElement(Host, null, children);
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: passthrough(View),
    YStack: passthrough(View),
    XStack: passthrough(View),
    Text: passthrough(Text),
    Button: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => ReactActual.createElement(Pressable, { onPress }, children),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Target: () => null,
  TrendingUp: () => null,
}));

// PremiumGate dependencies (used by the gate composition test).
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureBlocked: jest.fn(),
  trackPremiumFeatureClick: jest.fn(),
}));
jest.mock('../../subscription/useStripePrices', () => ({
  useStripePrices: () => ({ annualMonthlyEquivalent: '$6.67' }),
}));

// Scoring — deterministic so we control the rendered category-breakdown
// numbers. Win probability itself is no longer computed client-side
// (LS-5907) — it comes from useGetMatchupWinProbabilityQuery below.
const mockComputeScoring = jest.fn();
const mockCalculateMatchupProjection = jest.fn();
jest.mock('@legacy-sports/scoring', () => ({
  computeScoring: (...args: unknown[]): number =>
    mockComputeScoring(...args) as number,
  calculateMatchupProjection: (...args: unknown[]): unknown =>
    mockCalculateMatchupProjection(...args),
}));

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// GraphQL hooks + enum.
const mockUseGetMatchupPlayersQuery = jest.fn();
const mockUseGetLeagueTeamsQuery = jest.fn();
const mockUseGetMatchupWinProbabilityQuery = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    Scheduled: 'SCHEDULED',
    InProgress: 'IN_PROGRESS',
    Completed: 'COMPLETED',
  },
  useGetMatchupPlayersQuery: (opts: unknown): unknown =>
    mockUseGetMatchupPlayersQuery(opts),
  useGetLeagueTeamsQuery: (opts: unknown): unknown =>
    mockUseGetLeagueTeamsQuery(opts),
  useGetMatchupWinProbabilityQuery: (opts: unknown): unknown =>
    mockUseGetMatchupWinProbabilityQuery(opts),
}));

const mockUseLeagueScoringSettings = jest.fn();
jest.mock('../../../common/scoring', () => ({
  useLeagueScoringSettings: (id: unknown): unknown =>
    mockUseLeagueScoringSettings(id),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SCHEDULED = 'SCHEDULED';
const COMPLETED = 'COMPLETED';
const IN_PROGRESS = 'IN_PROGRESS';

interface TestMatchup {
  id: string;
  leagueId: number;
  team1Id: number;
  team2Id: number;
  gamesPerMatchup: number;
  status: string;
}

function makeMatchup(overrides: Partial<TestMatchup> = {}): TestMatchup {
  return {
    id: '1',
    leagueId: 10,
    team1Id: 101,
    team2Id: 102,
    gamesPerMatchup: 1,
    status: SCHEDULED,
    ...overrides,
  };
}

// One starter per team, no games played yet → projection drives the totals.
const PLAYERS = [
  {
    positionId: 1,
    teamId: 101,
    playerId: 1,
    season: 2025,
    numberOfGames: 1,
    games: [],
    seasonBatting: { games: 1 },
    seasonPitching: null,
    seasonFielding: null,
  },
  {
    positionId: 1,
    teamId: 102,
    playerId: 2,
    season: 2025,
    numberOfGames: 1,
    games: [],
    seasonBatting: { games: 1 },
    seasonPitching: null,
    seasonFielding: null,
  },
];

const WIN_PROBABILITY = {
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
    data: { getMatchupById: { winProbability: WIN_PROBABILITY } },
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

    expect(screen.getByText('Win Probability')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('38%')).toBeTruthy();
    expect(screen.getByText('100.50')).toBeTruthy();
    expect(screen.getByText('88.25')).toBeTruthy();
    // Each team name appears in both the probability bar and the score row.
    expect(screen.getAllByText('Aces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bolts').length).toBeGreaterThan(0);
    expect(mockUseGetMatchupWinProbabilityQuery).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: 1 } }),
    );
  });

  it('renders a tie-probability hint when the tie probability exceeds 1%', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: {
        getMatchupById: {
          winProbability: {
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
    expect(screen.getByText('2% tie')).toBeTruthy();
  });

  it('does not render a tie-probability hint when the tie probability is negligible', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.queryByText(/% tie/)).toBeNull();
  });

  it('renders nothing for completed matchups', () => {
    primeProjectionMocks();

    render(
      <MatchupWinProbabilityPanel
        matchup={makeMatchup({ status: COMPLETED })}
      />,
    );

    expect(screen.queryByText('Win Probability')).toBeNull();
  });

  it('renders nothing when the server returns no win probability (non-entitled or unauthenticated caller)', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { winProbability: null } },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // LS-5907: visibility is gated entirely by the server response — a free
    // user gets `null` back from the entitlement-gated field. With the
    // default (non-empty) players, category totals are non-zero, so this
    // isn't the pre-season case either — the panel renders nothing.
    expect(screen.queryByText('Win Probability')).toBeNull();
  });

  // AC1 — a Scheduled matchup with 0 computed category totals AND no server
  // win probability shows the pre-season fallback card instead of nothing
  // (LS-8471).
  it('renders the pre-season fallback for a scheduled matchup with no projection-eligible players', () => {
    primeProjectionMocks();
    // No projections → both team totals are zero → no simulation runs.
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { winProbability: null } },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.getByText('Win Probability')).toBeTruthy();
    expect(
      screen.getByText('Win probability will appear once games are scheduled.'),
    ).toBeTruthy();
  });

  // AC2 — other null-winProb cases (data still loading) are unaffected and
  // continue to render nothing, even for a Scheduled matchup.
  it('renders nothing for a scheduled matchup while player data is still loading', () => {
    primeProjectionMocks();
    mockUseGetMatchupPlayersQuery.mockReturnValue({ data: undefined });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { winProbability: null } },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.queryByText('Win Probability')).toBeNull();
    expect(
      screen.queryByText(
        'Win probability will appear once games are scheduled.',
      ),
    ).toBeNull();
  });

  // AC2 — the pre-season fallback is scoped to Scheduled matchups only; a
  // zero-total in-progress matchup still renders nothing.
  it('renders nothing when totals are 0 for a non-scheduled, non-completed matchup', () => {
    primeProjectionMocks();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { winProbability: null } },
    });

    render(
      <MatchupWinProbabilityPanel
        matchup={makeMatchup({ status: IN_PROGRESS })}
      />,
    );

    expect(screen.queryByText('Win Probability')).toBeNull();
    expect(
      screen.queryByText(
        'Win probability will appear once games are scheduled.',
      ),
    ).toBeNull();
  });

  it('renders nothing for a null matchup', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={null} />);

    expect(screen.queryByText('Win Probability')).toBeNull();
  });

  it('logs but still renders the server win probability when the category-breakdown projection throws', () => {
    primeProjectionMocks();
    // Projection throws for every player → category breakdown falls back to
    // actual-only scores, but the win probability itself is independently
    // server-sourced and must still render — the error must be surfaced
    // rather than silently swallowed.
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(mockLoggerError).toHaveBeenCalled();
    expect(screen.getByText('Win Probability')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
  });

  it('falls back to the pre-season card (no throw) when the category projection throws and the server has no win probability', () => {
    primeProjectionMocks();
    mockUseGetMatchupWinProbabilityQuery.mockReturnValue({
      data: { getMatchupById: { winProbability: null } },
    });
    // Projection throws for every player → perGame stays null. With no played
    // games the actual totals are zero, so no simulation runs and the
    // pre-season fallback renders instead of the full panel — but the error
    // must still be surfaced rather than silently swallowed.
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(mockLoggerError).toHaveBeenCalled();
    expect(
      screen.getByText('Win probability will appear once games are scheduled.'),
    ).toBeTruthy();
  });

  // AC2 — the panel must ship behind the Premium gate on mobile.
  describe('gated behind PremiumGate', () => {
    it('shows the upgrade overlay for free users', () => {
      primeProjectionMocks();

      render(
        <PremiumGate isPremium={false} featureName="Matchup Projections">
          <MatchupWinProbabilityPanel matchup={makeMatchup()} />
        </PremiumGate>,
      );

      expect(screen.getByText('Premium Feature')).toBeTruthy();
    });

    it('renders the panel without the upgrade overlay for premium users', () => {
      primeProjectionMocks();

      render(
        <PremiumGate isPremium featureName="Matchup Projections">
          <MatchupWinProbabilityPanel matchup={makeMatchup()} />
        </PremiumGate>,
      );

      expect(screen.queryByText('Premium Feature')).toBeNull();
      expect(screen.getByText('Win Probability')).toBeTruthy();
    });
  });
});

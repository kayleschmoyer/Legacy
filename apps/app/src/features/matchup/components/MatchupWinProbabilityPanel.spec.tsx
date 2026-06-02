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

// Scoring / analytics — deterministic so we control the rendered numbers.
const mockComputeScoring = jest.fn();
const mockCalculateMatchupProjection = jest.fn();
jest.mock('@legacy-sports/scoring', () => ({
  computeScoring: (...args: unknown[]): number =>
    mockComputeScoring(...args) as number,
  calculateMatchupProjection: (...args: unknown[]): unknown =>
    mockCalculateMatchupProjection(...args),
}));

const mockCalculateMatchupWinProbability = jest.fn();
jest.mock('@legacy-sports/analytics', () => ({
  calculateMatchupWinProbability: (...args: unknown[]): unknown =>
    mockCalculateMatchupWinProbability(...args),
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
jest.mock('../../../api/db/graphql.generated', () => ({
  MatchupStatus: {
    Scheduled: 'SCHEDULED',
    InProgress: 'IN_PROGRESS',
    Completed: 'COMPLETED',
  },
  useGetMatchupPlayersQuery: (opts: unknown): unknown =>
    mockUseGetMatchupPlayersQuery(opts),
  useGetLeagueTeamsQuery: (opts: unknown): unknown =>
    mockUseGetLeagueTeamsQuery(opts),
}));

const mockUseLeagueScoringSettings = jest.fn();
jest.mock('../../../common/scoring', () => ({
  useLeagueScoringSettings: (id: unknown): unknown =>
    mockUseLeagueScoringSettings(id),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SCHEDULED = 'SCHEDULED';
const COMPLETED = 'COMPLETED';

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
  mockCalculateMatchupWinProbability.mockReturnValue({
    team1WinProbability: 0.62,
    team2WinProbability: 0.38,
    tiesProbability: 0,
    team1ProjectedScore: 100.5,
    team2ProjectedScore: 88.25,
    simulationCount: 5000,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MatchupWinProbabilityPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders win probability, projected scores, and team names when projections are available', () => {
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
    expect(mockCalculateMatchupWinProbability).toHaveBeenCalledWith(100, 100);
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

  it('renders nothing when there are no projection-eligible players', () => {
    primeProjectionMocks();
    // No projections → both team totals are zero → no simulation, no panel.
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.queryByText('Win Probability')).toBeNull();
    expect(mockCalculateMatchupWinProbability).not.toHaveBeenCalled();
  });

  it('renders nothing for a null matchup', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={null} />);

    expect(screen.queryByText('Win Probability')).toBeNull();
  });

  it('logs and falls back to actual scores when projection calculation throws', () => {
    primeProjectionMocks();
    // Projection throws for every player → perGame stays null. With no played
    // games the actual totals are zero, so no simulation runs and nothing renders
    // — but the error must be surfaced rather than silently swallowed.
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(mockLoggerError).toHaveBeenCalled();
    expect(screen.queryByText('Win Probability')).toBeNull();
    expect(mockCalculateMatchupWinProbability).not.toHaveBeenCalled();
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

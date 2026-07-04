/**
 * Unit tests for MatchupWinProbabilityPanel (LS-5358).
 *
 * Mirrors the mobile coverage in
 * apps/app/src/features/matchup/components/MatchupWinProbabilityPanel.spec.tsx
 * for the panel's own render logic (projection/simulation wiring, visibility
 * rules). Premium-gate composition is intentionally left to the hermetic E2E
 * suite (apps/web-e2e/src/tests/matchup-week-navigation.spec.ts), which
 * already exercises the full `PremiumGate` + panel flow end to end.
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

const mockCalculateMatchupWinProbability = jest.fn();
jest.mock('@legacy-sports/analytics', () => ({
  calculateMatchupWinProbability: (...args: unknown[]): unknown =>
    mockCalculateMatchupWinProbability(...args),
}));

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
  } as MatchupFragment;
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

    expect(screen.getByText('Win Probability')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('100.50')).toBeInTheDocument();
    expect(screen.getByText('88.25')).toBeInTheDocument();
    expect(screen.getAllByText('Aces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bolts').length).toBeGreaterThan(0);
    expect(mockCalculateMatchupWinProbability).toHaveBeenCalledWith(100, 100);
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

  it('renders nothing when there are no projection-eligible players', () => {
    primeProjectionMocks();
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: [] },
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
    expect(mockCalculateMatchupWinProbability).not.toHaveBeenCalled();
  });

  it('renders nothing for a null matchup', () => {
    primeProjectionMocks();

    render(<MatchupWinProbabilityPanel matchup={null} />);

    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
  });

  it('falls back to actual scores (no throw) when projection calculation throws', () => {
    primeProjectionMocks();
    mockCalculateMatchupProjection.mockImplementation(() => {
      throw new Error('bad scoring config');
    });

    render(<MatchupWinProbabilityPanel matchup={makeMatchup()} />);

    // No played games and a thrown projection means both teams stay at 0 —
    // no simulation runs and nothing renders, but the render itself must not
    // throw or unhandled-reject.
    expect(screen.queryByText('Win Probability')).not.toBeInTheDocument();
    expect(mockCalculateMatchupWinProbability).not.toHaveBeenCalled();
  });
});

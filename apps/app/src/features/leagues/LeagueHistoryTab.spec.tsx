import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import { LeagueHistoryTab } from './LeagueHistoryTab';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mutable mock state (mutated per-test in setupMocks) ───────────────────────

let mockHistoryResult = { data: undefined, loading: false, error: undefined };
let mockStandingsResult = { data: undefined, loading: false, error: undefined };
let mockRecordsResult = { data: undefined, loading: false, error: undefined };
let mockLoggerError: jest.Mock;

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../api/db/graphql.generated', () => ({
  useGetLeagueHistoryQuery: () => mockHistoryResult,
  useGetLeagueStandingsQuery: () => mockStandingsResult,
  useGetAllTimeRecordsQuery: () => mockRecordsResult,
}));

jest.mock('@legacy-sports/logging', () => {
  mockLoggerError = jest.fn();
  return {
    LOGGER: {
      error: mockLoggerError,
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
  };
});

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Card: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    Spinner: ({ testID }: { testID?: string; size?: string }) => (
      <View testID={testID ?? 'spinner'} />
    ),
    Text: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Text testID={testID} onPress={onPress}>
        {children}
      </Text>
    ),
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

// ── Test data ─────────────────────────────────────────────────────────────────

const SEASON_1 = {
  leagueId: 10,
  seasonNumber: 1,
  name: 'Season 1',
  frozenAt: '2024-01-01T00:00:00Z',
  leaguePhase: 'complete',
  totalMatchups: 100,
  championTeamId: 1,
  championTeamName: 'Team Alpha',
  runnerUpTeamId: 2,
  runnerUpTeamName: 'Team Beta',
  championScore: 120.5,
  runnerUpScore: 110.2,
};

const SEASON_2 = {
  leagueId: 20,
  seasonNumber: 2,
  name: 'Season 2',
  frozenAt: null,
  leaguePhase: 'active',
  totalMatchups: 50,
  championTeamId: null,
  championTeamName: null,
  runnerUpTeamId: null,
  runnerUpTeamName: null,
  championScore: null,
  runnerUpScore: null,
};

const STANDINGS = [
  {
    teamId: 1,
    teamName: 'Team Alpha',
    wins: 10,
    losses: 2,
    ties: 0,
    winPercentage: 0.833,
    pointsFor: 1200,
    pointsAgainst: 1000,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
  },
  {
    teamId: 2,
    teamName: 'Team Beta',
    wins: 8,
    losses: 4,
    ties: 0,
    winPercentage: 0.667,
    pointsFor: 1100,
    pointsAgainst: 1050,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
  },
];

const RECORDS = [
  {
    recordType: 'most_wins',
    value: 12,
    teamName: 'Team Alpha',
    teamId: 1,
    seasonNumber: 1,
    leagueId: 10,
    details: null,
  },
  {
    recordType: 'highest_score',
    value: 145.2,
    teamName: 'Team Beta',
    teamId: 2,
    seasonNumber: 1,
    leagueId: 10,
    details: null,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

type MockResult = { data?: unknown; loading?: boolean; error?: unknown };

function setupMocks({
  history = { data: undefined, loading: false, error: undefined },
  standings = { data: undefined, loading: false, error: undefined },
  records = { data: undefined, loading: false, error: undefined },
}: {
  history?: MockResult;
  standings?: MockResult;
  records?: MockResult;
} = {}) {
  mockHistoryResult = {
    data: undefined,
    loading: false,
    error: undefined,
    ...history,
  };
  mockStandingsResult = {
    data: undefined,
    loading: false,
    error: undefined,
    ...standings,
  };
  mockRecordsResult = {
    data: undefined,
    loading: false,
    error: undefined,
    ...records,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeagueHistoryTab', () => {
  beforeEach(() => {
    setupMocks();
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows spinner while history is loading with no data', () => {
      setupMocks({ history: { loading: true } });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
      expect(screen.getByText('Loading history…')).toBeTruthy();
    });
  });

  describe('first-season empty state', () => {
    it('shows first-season message when only one season is present', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={20} />);
      expect(screen.getByText('First season in progress')).toBeTruthy();
    });
  });

  describe('with historical data', () => {
    it('renders section headings', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: STANDINGS } },
        records: { data: { getAllTimeRecords: RECORDS } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText('League History')).toBeTruthy();
      expect(screen.getByText('All-Time Records')).toBeTruthy();
      expect(screen.getByText('Champions Row')).toBeTruthy();
    });

    it('renders standings teams', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: STANDINGS } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
    });

    it('renders all-time record labels and holders', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: RECORDS } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText('Most Wins in a Season')).toBeTruthy();
      expect(screen.getByText('Highest Single-Matchup Score')).toBeTruthy();
    });

    it('renders champions row', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText('Champions Row')).toBeTruthy();
      expect(screen.getByText('vs Team Beta')).toBeTruthy();
    });

    it('shows season picker when multiple seasons exist', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: STANDINGS } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getAllByText('Season 1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Season 2/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error states', () => {
    it('shows history error when history fails with no seasons', () => {
      setupMocks({
        history: { error: new Error('Network error'), data: undefined },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText("Couldn't load league history")).toBeTruthy();
    });

    it('shows records error when records fail with no data', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: STANDINGS } },
        records: { error: new Error('Records error'), data: undefined },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText("Couldn't load records")).toBeTruthy();
    });
  });

  describe('empty records state', () => {
    it('shows no records message when records list is empty', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.getByText('No records yet')).toBeTruthy();
    });
  });

  describe('error logging', () => {
    it('logs LOGGER.error when history query fails', () => {
      const err = new Error('Network error');
      setupMocks({
        history: { error: err, data: undefined },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'League history query failed',
        err,
        { leagueId: 10 },
      );
    });

    it('logs LOGGER.error when records query fails', () => {
      const err = new Error('Records error');
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { error: err, data: undefined },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'All-time records query failed',
        err,
        { leagueId: 10 },
      );
    });
  });

  describe('season picker interaction', () => {
    it('switches to the selected season when a chip is pressed', () => {
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: STANDINGS } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);

      // Default is Season 1 (frozen); press Season 2 chip
      fireEvent.press(screen.getByText('Season 2 (current)'));

      // Subtitle should reflect Season 2 (no frozenAt → "Current")
      expect(screen.getByText('Season 2 · Current')).toBeTruthy();
    });
  });

  describe('nullable GraphQL field rendering', () => {
    it('does not render "Season null" when record seasonNumber is null', () => {
      const recordNullSeason = { ...RECORDS[0], seasonNumber: null };
      setupMocks({
        history: { data: { getLeagueHistory: [SEASON_1, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [recordNullSeason] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.queryByText(/Season null/)).toBeNull();
    });

    it('does not render "vs null" when runnerUpTeamName is null', () => {
      const seasonNoRunner = { ...SEASON_1, runnerUpTeamName: null };
      setupMocks({
        history: { data: { getLeagueHistory: [seasonNoRunner, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.queryByText(/vs null/)).toBeNull();
    });

    it('does not render score line when championScore is null', () => {
      const seasonNoScore = {
        ...SEASON_1,
        championScore: null,
        runnerUpScore: null,
      };
      setupMocks({
        history: { data: { getLeagueHistory: [seasonNoScore, SEASON_2] } },
        standings: { data: { getLeagueStandings: [] } },
        records: { data: { getAllTimeRecords: [] } },
      });
      render(<LeagueHistoryTab leagueId={10} />);
      expect(screen.queryByText(/^Final:/)).toBeNull();
    });
  });
});

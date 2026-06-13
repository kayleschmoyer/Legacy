import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { FOOTBALL_PLAYER_DETAIL_POLL_MS } from '@legacy-sports/shared-components/football';
import FootballPlayerDetailScreen from './[playerId]';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn(() => ({ playerId: '7' }));
const mockBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ back: mockBack, navigate: mockNavigate }),
}));

let mockIsPremium = false;
jest.mock('../../../../features/subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: mockIsPremium }),
}));

const mockUseFootballPlayerQuery = jest.fn();
jest.mock('../../../../api/db/graphql.generated', () => ({
  useFootballPlayerQuery: (...args: unknown[]) =>
    mockUseFootballPlayerQuery(...args) as Record<string, unknown>,
}));

let capturedDetailProps: Record<string, unknown> | null = null;

jest.mock('@legacy-sports/shared-components/football', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    // Sentinel value so the wiring test proves the screen forwards the shared
    // constant rather than a hard-coded literal.
    FOOTBALL_PLAYER_DETAIL_POLL_MS: 54321,
    FootballPlayerDetail: (props: {
      player?: { firstName?: string | null } | null;
      loading?: boolean;
      error?: boolean;
      isPremium?: boolean;
      onUpgrade?: () => void;
      [key: string]: unknown;
    }) => {
      capturedDetailProps = props;
      const { player, loading, error } = props;
      return (
        <View testID="detail">
          <Text>{loading ? 'loading' : 'loaded'}</Text>
          <Text>{error ? 'error' : 'ok'}</Text>
          <Text>{player?.firstName ?? 'no-player'}</Text>
        </View>
      );
    },
  };
});

const QB_PLAYER = {
  id: 7,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  careerStats: { passing: { yds: 5000, td: 37, int: 14, rating: 105.2 } },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FootballPlayerDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedDetailProps = null;
    mockIsPremium = false;
    mockUseLocalSearchParams.mockReturnValue({ playerId: '7' });
    mockUseFootballPlayerQuery.mockReturnValue({
      data: { footballPlayer: QB_PLAYER },
      loading: false,
      error: undefined,
    });
  });

  it('parses the route param and queries the player by id', () => {
    render(<FootballPlayerDetailScreen />);
    const call = mockUseFootballPlayerQuery.mock.calls[0] as [
      { skip: boolean; variables: { id: number } },
    ];
    expect(call[0].skip).toBe(false);
    expect(call[0].variables.id).toBe(7);
    expect(screen.getByText('Patrick')).toBeTruthy();
  });

  it('skips the query when the route param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({} as { playerId: string });
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    });
    render(<FootballPlayerDetailScreen />);
    const call = mockUseFootballPlayerQuery.mock.calls[0] as [
      { skip: boolean; variables: { id: number } },
    ];
    expect(call[0].skip).toBe(true);
    expect(call[0].variables.id).toBe(0);
  });

  it('passes loading state through to the shared detail component', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });
    render(<FootballPlayerDetailScreen />);
    expect(screen.getByText('loading')).toBeTruthy();
  });

  it('passes error state through to the shared detail component', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('boom'),
    });
    render(<FootballPlayerDetailScreen />);
    expect(screen.getByText('error')).toBeTruthy();
  });

  it('polls the query so injury-status changes auto-refresh (LS-6252)', () => {
    render(<FootballPlayerDetailScreen />);
    const call = mockUseFootballPlayerQuery.mock.calls[0] as [
      { pollInterval?: number },
    ];
    expect(call[0].pollInterval).toBe(FOOTBALL_PLAYER_DETAIL_POLL_MS);
  });

  it('passes isPremium=false to FootballPlayerDetail for free-tier users (LS-5011)', () => {
    mockIsPremium = false;
    render(<FootballPlayerDetailScreen />);
    expect(capturedDetailProps?.isPremium).toBe(false);
  });

  it('passes isPremium=true to FootballPlayerDetail for premium users (LS-5011)', () => {
    mockIsPremium = true;
    render(<FootballPlayerDetailScreen />);
    expect(capturedDetailProps?.isPremium).toBe(true);
  });

  it('wires onUpgrade to subscription-settings navigation (LS-5011)', () => {
    render(<FootballPlayerDetailScreen />);
    expect(typeof capturedDetailProps?.onUpgrade).toBe('function');
    (capturedDetailProps?.onUpgrade as () => void)();
    expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
  });
});

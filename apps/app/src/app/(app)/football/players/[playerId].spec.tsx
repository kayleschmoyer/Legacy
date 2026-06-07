import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import FootballPlayerDetailScreen from './[playerId]';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn(() => ({ playerId: '7' }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ back: mockBack }),
}));

const mockUseFootballPlayerQuery = jest.fn();
jest.mock('../../../../api/db/graphql.generated', () => ({
  useFootballPlayerQuery: (...args: unknown[]) =>
    mockUseFootballPlayerQuery(...args) as Record<string, unknown>,
}));

jest.mock('@legacy-sports/shared-components/football', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    FootballPlayerDetail: ({
      player,
      loading,
      error,
    }: {
      player?: { firstName?: string | null } | null;
      loading?: boolean;
      error?: boolean;
    }) => (
      <View testID="detail">
        <Text>{loading ? 'loading' : 'loaded'}</Text>
        <Text>{error ? 'error' : 'ok'}</Text>
        <Text>{player?.firstName ?? 'no-player'}</Text>
      </View>
    ),
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
});

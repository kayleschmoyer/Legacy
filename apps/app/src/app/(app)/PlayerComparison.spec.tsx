import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PlayerComparisonScreen from './PlayerComparison';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

// Tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../__test-utils__/tamagui-mocks')
  >('../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Subscription status — controlled per-test
interface SubscriptionResult {
  isPremium: boolean;
  loading: boolean;
}
const mockUseSubscription = jest.fn(
  (): SubscriptionResult => ({ isPremium: true, loading: false }),
);
jest.mock('../../features/subscription/useSubscription', () => ({
  useSubscription: (): SubscriptionResult => mockUseSubscription(),
}));

// PremiumGate dependencies (used only for the free-tier overlay path)
jest.mock('../../features/subscription/useStripePrices', () => ({
  useStripePrices: () => ({ annualMonthlyEquivalent: '$3.33' }),
}));
jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureBlocked: jest.fn(),
  trackPremiumFeatureClick: jest.fn(),
}));

// Shared PlayerStatsPage selector — exposes two "add" buttons that invoke the
// onPlayerDetails callback with distinct players.
jest.mock('@legacy-sports/shared-components', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    PlayerStatsPage: ({
      onPlayerDetails,
    }: {
      onPlayerDetails?: (player: { id: number; name: string }) => void;
    }) =>
      ReactActual.createElement(View, { testID: 'mock-player-stats-page' }, [
        ReactActual.createElement(
          Pressable,
          {
            key: 'a',
            testID: 'add-player-1',
            onPress: () => onPlayerDetails?.({ id: 1, name: 'Babe Ruth' }),
          },
          ReactActual.createElement(Text, null, 'Add Babe Ruth'),
        ),
        ReactActual.createElement(
          Pressable,
          {
            key: 'b',
            testID: 'add-player-2',
            onPress: () => onPlayerDetails?.({ id: 2, name: 'Hank Aaron' }),
          },
          ReactActual.createElement(Text, null, 'Add Hank Aaron'),
        ),
      ]),
  };
});

// Player ids whose stats query should resolve with an error (per-test injectable).
const mockErroredIds = new Set<number>();

// Career stats query — returns batting stats keyed off the requested playerId so
// the two columns differ; skipped slots return no data; ids in mockErroredIds error.
jest.mock('../../api/db/graphql.generated', () => ({
  useGetPlayerCareerStatsQuery: ({
    variables,
    skip,
  }: {
    variables: { playerId: number };
    skip?: boolean;
  }) => {
    if (skip) return { data: undefined, loading: false, error: undefined };
    const id = variables.playerId;
    if (mockErroredIds.has(id)) {
      return { data: undefined, loading: false, error: new Error('boom') };
    }
    return {
      loading: false,
      error: undefined,
      data: {
        batting: {
          games: 100 * id,
          battingAverage: 0.3 + id / 100,
          homeRuns: 10 * id,
          rbi: 50 * id,
          hits: 200 * id,
          runs: 100 * id,
          stolenBases: id,
          onBasePercentage: 0.4,
          sluggingPercentage: 0.5,
        },
        pitching: null,
        fielding: null,
      },
    };
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerComparisonScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockErroredIds.clear();
    mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
  });

  describe('premium access', () => {
    it('renders the comparison tool and player selector for premium users', () => {
      render(<PlayerComparisonScreen />);
      expect(screen.getByText('Player Comparison')).toBeTruthy();
      expect(
        screen.getByText(/Compare up to 4 players head-to-head/),
      ).toBeTruthy();
      expect(screen.getByTestId('mock-player-stats-page')).toBeTruthy();
      // Upgrade overlay must NOT be shown for premium users.
      expect(screen.queryByText('Upgrade to Premium')).toBeNull();
    });

    it('prompts the user to pick at least two players initially', () => {
      render(<PlayerComparisonScreen />);
      expect(
        screen.getByText(/Select at least two players below/),
      ).toBeTruthy();
    });

    it('renders a side-by-side comparison after two players are added', () => {
      render(<PlayerComparisonScreen />);

      fireEvent.press(screen.getByTestId('add-player-1'));
      fireEvent.press(screen.getByTestId('add-player-2'));

      // Both players appear as columns and the batting table renders.
      expect(screen.getAllByText('Babe Ruth').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Hank Aaron').length).toBeGreaterThan(0);
      expect(screen.getByText('Batting')).toBeTruthy();
      expect(screen.getByText('AVG')).toBeTruthy();
      // The prompt is gone once two players are selected.
      expect(
        screen.queryByText(/Select at least two players below/),
      ).toBeNull();
    });

    it('removes a selected player via its chip', () => {
      render(<PlayerComparisonScreen />);
      fireEvent.press(screen.getByTestId('add-player-1'));
      // The chip shows the player name (distinct from the selector's "Add …" label).
      expect(screen.getByText('Babe Ruth')).toBeTruthy();

      fireEvent.press(screen.getByTestId('remove-player-1'));
      expect(screen.queryByText('Babe Ruth')).toBeNull();
    });

    it('does not add the same player twice', () => {
      render(<PlayerComparisonScreen />);
      fireEvent.press(screen.getByTestId('add-player-1'));
      fireEvent.press(screen.getByTestId('add-player-1'));
      expect(screen.getByText('Selected (1/4):')).toBeTruthy();
    });

    it('surfaces an error indicator for a column whose stats failed to load', () => {
      mockErroredIds.add(2);
      render(<PlayerComparisonScreen />);
      fireEvent.press(screen.getByTestId('add-player-1'));
      fireEvent.press(screen.getByTestId('add-player-2'));

      // The failed column shows an explicit error note rather than only a dash.
      expect(screen.getByText('Stats unavailable')).toBeTruthy();
    });
  });

  describe('free-tier gating', () => {
    it('shows the upgrade prompt for free users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<PlayerComparisonScreen />);
      expect(screen.getByText('Premium Feature')).toBeTruthy();
      expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    });
  });

  describe('loading', () => {
    it('does not render the comparison tool while the subscription loads', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<PlayerComparisonScreen />);
      expect(
        screen.queryByText(/Compare up to 4 players head-to-head/),
      ).toBeNull();
      expect(screen.queryByText('Upgrade to Premium')).toBeNull();
    });
  });
});

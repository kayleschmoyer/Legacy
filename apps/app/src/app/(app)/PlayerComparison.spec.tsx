import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PlayerComparisonScreen from './PlayerComparison';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

// Tamagui — shared mock from __test-utils__ (Spinner / YStack loading state)
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

// Shared PlayerComparison — stubbed so the wrapper test stays focused on
// premium gating / navigation wiring rather than the shared component internals
// (which are covered by lib/shared-components/.../PlayerComparison.spec.tsx).
jest.mock('@legacy-sports/shared-components', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    PLAYER_COMPARISON_FEATURE_DESCRIPTION: 'feature description',
    PlayerComparison: ({
      isPremium,
      onUpgrade,
    }: {
      isPremium: boolean;
      onUpgrade?: () => void;
    }) =>
      ReactActual.createElement(View, { testID: 'shared-player-comparison' }, [
        ReactActual.createElement(
          Text,
          { key: 'premium' },
          `premium:${String(isPremium)}`,
        ),
        ReactActual.createElement(
          Pressable,
          {
            key: 'upgrade',
            testID: 'shared-upgrade-trigger',
            onPress: onUpgrade,
          },
          ReactActual.createElement(Text, null, 'upgrade'),
        ),
      ]),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerComparisonScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
  });

  describe('premium access', () => {
    it('renders the shared comparison feature for premium users', () => {
      render(<PlayerComparisonScreen />);
      expect(screen.getByTestId('shared-player-comparison')).toBeTruthy();
      expect(screen.getByText('premium:true')).toBeTruthy();
      // Upgrade overlay must NOT be shown for premium users.
      expect(screen.queryByText('Upgrade to Premium')).toBeNull();
    });

    it('wires onUpgrade to subscription-settings navigation', () => {
      render(<PlayerComparisonScreen />);
      fireEvent.press(screen.getByTestId('shared-upgrade-trigger'));
      expect(mockNavigate).toHaveBeenCalledWith('/subscription-settings');
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
      expect(screen.queryByTestId('shared-player-comparison')).toBeNull();
      expect(screen.queryByText('Upgrade to Premium')).toBeNull();
    });
  });
});

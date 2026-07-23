import React from 'react';
import { Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { PremiumGate } from './PremiumGate';
import { trackPremiumFeatureBlocked } from '../../utils/analytics';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock tamagui to plain React Native primitives so the component renders
// without a TamaguiProvider/theme in the test environment (mirrors the
// established pattern in profile-settings.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    // Forward testID + flex so tests can assert the fill-mode layout fix
    // (LS-8636) — a flex-sized child collapses the gate without flex: 1 here.
    YStack: ({
      children,
      testID,
      flex,
    }: {
      children?: React.ReactNode;
      testID?: string;
      flex?: number;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        View,
        { testID, style: flex !== undefined ? { flex } : undefined },
        children,
      ),
    Text: ({
      children,
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, null, children),
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureBlocked: jest.fn(),
  trackPremiumFeatureClick: jest.fn(),
}));

const mockUseStripePrices = jest.fn();
jest.mock('./useStripePrices', () => ({
  useStripePrices: (): unknown => mockUseStripePrices(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PremiumGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: live prices yielding a monthly-equivalent distinct from the old
    // hardcoded "$3.33" so we can prove the value is dynamic.
    mockUseStripePrices.mockReturnValue({ annualMonthlyEquivalent: '$6.67' });
  });

  it('renders the monthly-equivalent price from useStripePrices for free users', () => {
    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <RNText>locked content</RNText>
      </PremiumGate>,
    );

    expect(screen.getByText('From $6.67/mo')).toBeTruthy();
    // The old hardcoded value must not appear when live prices differ.
    expect(screen.queryByText('From $3.33/mo')).toBeNull();
  });

  it('renders the hook fallback value when live prices are unavailable', () => {
    // useStripePrices serves fallback display values (3999¢ / 12 = $3.33) when
    // Stripe prices cannot be fetched.
    mockUseStripePrices.mockReturnValue({ annualMonthlyEquivalent: '$3.33' });

    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <RNText>locked content</RNText>
      </PremiumGate>,
    );

    expect(screen.getByText('From $3.33/mo')).toBeTruthy();
  });

  it('does not render the upgrade overlay (or price) for premium users', () => {
    render(
      <PremiumGate isPremium featureName="Player Comparison">
        <RNText>locked content</RNText>
      </PremiumGate>,
    );

    expect(screen.queryByText(/\/mo$/)).toBeNull();
  });

  it('fires trackPremiumFeatureBlocked on mount for non-premium users (default backward compat)', () => {
    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <RNText>content</RNText>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
    expect(trackPremiumFeatureBlocked).toHaveBeenCalledWith(
      'Player Comparison',
    );
  });

  it('does not fire trackPremiumFeatureBlocked while isUserLoaded is false', () => {
    render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <RNText>content</RNText>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();
  });

  it('fires trackPremiumFeatureBlocked once identity settles and user is non-premium', () => {
    const { rerender } = render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <RNText>content</RNText>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();

    rerender(
      <PremiumGate
        isPremium={false}
        isUserLoaded={true}
        featureName="Player Comparison"
      >
        <RNText>content</RNText>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
    expect(trackPremiumFeatureBlocked).toHaveBeenCalledWith(
      'Player Comparison',
    );
  });

  it('applies flex: 1 to the overlay container and content wrapper when fill is set', () => {
    // Regression (LS-8636): PlayerStatsPage sizes itself with flex, so without
    // fill the overlay collapsed to zero height — free users saw a blank
    // screen instead of the upgrade card.
    render(
      <PremiumGate isPremium={false} featureName="Player Statistics" fill>
        <RNText>locked content</RNText>
      </PremiumGate>,
    );

    expect(screen.getByTestId('premium-gate-overlay')).toHaveStyle({
      flex: 1,
    });
    expect(screen.getByTestId('premium-gate-content')).toHaveStyle({
      flex: 1,
    });
  });

  it('does not apply flex sizing by default (intrinsic-height card usages)', () => {
    render(
      <PremiumGate isPremium={false} featureName="Matchup Projections">
        <RNText>locked content</RNText>
      </PremiumGate>,
    );

    expect(screen.getByTestId('premium-gate-overlay')).not.toHaveStyle({
      flex: 1,
    });
    expect(screen.getByTestId('premium-gate-content')).not.toHaveStyle({
      flex: 1,
    });
  });

  it('does not fire trackPremiumFeatureBlocked when isPremium resolves true after loading', () => {
    const { rerender } = render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <RNText>content</RNText>
      </PremiumGate>,
    );

    rerender(
      <PremiumGate
        isPremium={true}
        isUserLoaded={true}
        featureName="Player Comparison"
      >
        <RNText>content</RNText>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();
  });
});

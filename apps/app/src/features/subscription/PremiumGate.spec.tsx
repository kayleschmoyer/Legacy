import React from 'react';
import { Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { PremiumGate } from './PremiumGate';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock tamagui to plain React Native primitives so the component renders
// without a TamaguiProvider/theme in the test environment (mirrors the
// established pattern in profile-settings.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    YStack: ({
      children,
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactActual.createElement(View, null, children),
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
});

import React from 'react';
import { Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { withPremiumScreen } from './withPremiumScreen';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    createTokens: (tokens: unknown) => tokens,
    // Forward testID + flex so tests can assert the screen gate fills the
    // viewport (LS-8636) — without flex: 1 the overlay collapses to zero
    // height for flex-sized screens and free users see a blank screen.
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
    Spinner: () => ReactActual.createElement(View, { testID: 'spinner' }),
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

const mockUseSubscription = jest.fn();
jest.mock('./useSubscription', () => ({
  useSubscription: (): unknown => mockUseSubscription(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScreenContent({ isPremium }: { isPremium: boolean }) {
  return (
    <RNText testID="screen-content">{isPremium ? 'premium' : 'free'}</RNText>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('withPremiumScreen', () => {
  const GatedScreen = withPremiumScreen(ScreenContent, {
    featureName: 'Test Feature',
    featureDescription: 'Unlock Test Feature with Premium.',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStripePrices.mockReturnValue({ annualMonthlyEquivalent: '$6.67' });
  });

  it('shows a loading spinner while subscription data loads', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });

    render(<GatedScreen />);

    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(screen.queryByTestId('screen-content')).toBeNull();
  });

  it('renders the screen content for premium users', () => {
    mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });

    render(<GatedScreen />);

    expect(screen.getByTestId('screen-content')).toBeTruthy();
    expect(screen.getByText('premium')).toBeTruthy();
    // No upgrade overlay for premium users
    expect(screen.queryByText(/\/mo$/)).toBeNull();
  });

  it('shows the premium gate overlay for free users', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<GatedScreen />);

    expect(screen.getByText('Premium Feature')).toBeTruthy();
    expect(screen.getByText('From $6.67/mo')).toBeTruthy();
    // Screen content is still rendered (dimmed behind overlay)
    expect(screen.getByTestId('screen-content')).toBeTruthy();
  });

  it('renders the gate in fill mode so flex-sized screens do not collapse', () => {
    // Regression (LS-8636): screen-level gates wrap flex-sized screens; without
    // fill the free-tier overlay collapsed to zero height (blank screen).
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<GatedScreen />);

    expect(screen.getByTestId('premium-gate-overlay')).toHaveStyle({
      flex: 1,
    });
    expect(screen.getByTestId('premium-gate-content')).toHaveStyle({
      flex: 1,
    });
  });

  it('injects isPremium=false into the wrapped component for free users', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<GatedScreen />);

    expect(screen.getByText('free')).toBeTruthy();
  });

  it('sets a displayName for easier debugging', () => {
    expect(GatedScreen.displayName).toBe('withPremiumScreen(ScreenContent)');
  });

  it('passes through own props to the wrapped component', () => {
    interface ExtraProps {
      label: string;
      isPremium: boolean;
    }

    function LabeledScreen({ label, isPremium }: ExtraProps) {
      return (
        <RNText testID="label">
          {label}-{isPremium ? 'premium' : 'free'}
        </RNText>
      );
    }

    const GatedLabeledScreen = withPremiumScreen(LabeledScreen, {
      featureName: 'Labeled Feature',
    });

    mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });

    render(<GatedLabeledScreen label="hello" />);

    expect(screen.getByText('hello-premium')).toBeTruthy();
  });
});

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import SubscriptionSettingsScreen from './SubscriptionSettingsScreen';

// ── Mock type helpers ────────────────────────────────────────────────────────
type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  const passthrough =
    (testID?: string) =>
    ({ children }: { children?: React.ReactNode }) => (
      <View testID={testID}>{children}</View>
    );
  return {
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Text
        accessibilityState={{ disabled: !!disabled }}
        onPress={disabled ? undefined : onPress}
      >
        {children}
      </Text>
    ),
    H1: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Paragraph: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Separator: passthrough('separator'),
    Text: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    XStack: passthrough(),
    YStack: passthrough(),
  };
});

const mockUseSubscription = jest.fn();
const mockUseCheckoutSession = jest.fn();
const mockUseBillingPortalSession = jest.fn();
jest.mock('./useSubscription', () => ({
  useSubscription: (...args: unknown[]): unknown =>
    mockUseSubscription(...args),
  useCheckoutSession: (...args: unknown[]): unknown =>
    mockUseCheckoutSession(...args),
  useBillingPortalSession: (...args: unknown[]): unknown =>
    mockUseBillingPortalSession(...args),
}));

jest.mock('./useStripePrices', () => ({
  useStripePrices: () => ({
    monthlyPriceDisplay: '$4.99',
    annualPriceDisplay: '$49.99',
    annualMonthlyEquivalent: '$4.17',
    annualSavingsPct: '17%',
    monthlyPriceId: 'price_month',
    annualPriceId: 'price_year',
  }),
}));

const mockRestorePurchases = jest.fn();
const mockClearError = jest.fn();
let mockIapState: {
  restorePurchases: jest.Mock;
  loading: boolean;
  error: string | null;
  isSubscribed: boolean;
  clearError: jest.Mock;
};
jest.mock('./useIAP', () => ({
  useIAP: () => mockIapState,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMocks() {
  mockUseSubscription.mockReturnValue({
    subscription: null,
    isPremium: true,
    tier: 'monthly',
    loading: false,
  });
  mockUseCheckoutSession.mockReturnValue([jest.fn(), { loading: false }]);
  mockUseBillingPortalSession.mockReturnValue([jest.fn(), { loading: false }]);
  mockIapState = {
    restorePurchases: mockRestorePurchases,
    loading: false,
    error: null,
    isSubscribed: false,
    clearError: mockClearError,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubscriptionSettingsScreen — Restore Purchases (LS-5192)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it('invokes the IAP restore flow (server-side sync) instead of opening the Apple website', () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    render(<SubscriptionSettingsScreen />);

    fireEvent.press(screen.getAllByText('Restore Purchases').slice(-1)[0]);

    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(openURLSpy).not.toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions',
    );
  });

  it('surfaces a confirmation alert once the restore succeeds', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    const { rerender } = render(<SubscriptionSettingsScreen />);
    fireEvent.press(screen.getAllByText('Restore Purchases').slice(-1)[0]);

    // restorePurchases sets isSubscribed asynchronously; simulate the state
    // settling and re-render so the success effect runs.
    mockIapState = { ...mockIapState, isSubscribed: true };
    rerender(<SubscriptionSettingsScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Purchases Restored',
        'Your subscription has been restored successfully.',
      );
    });
  });

  it('surfaces an error alert when the restore fails', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    const { rerender } = render(<SubscriptionSettingsScreen />);
    fireEvent.press(screen.getAllByText('Restore Purchases').slice(-1)[0]);

    mockIapState = {
      ...mockIapState,
      error: 'No previous purchases found for this Apple ID.',
    };
    rerender(<SubscriptionSettingsScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Restore Purchases',
        'No previous purchases found for this Apple ID.',
      );
    });
    expect(mockClearError).toHaveBeenCalled();
  });
});

describe('SubscriptionSettingsScreen — plan tier label (LS-5199)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // The useSubscription hook only ever returns 'premium' or 'free' as the tier
  // (see useSubscription.ts), so the plan label must render "Premium" for
  // premium subscribers. Before the fix, 'premium' matched no switch case and
  // fell through to the "Free" default. The "Free"/"Premium" feature-comparison
  // column headers always render once each, so the plan label adds a second
  // occurrence of whichever word matches the current tier.
  it('labels a premium subscriber as Premium, not Free', () => {
    mockUseSubscription.mockReturnValue({
      subscription: { status: 'active' },
      isPremium: true,
      tier: 'premium',
      loading: false,
    });

    render(<SubscriptionSettingsScreen />);

    // Plan label "Premium" + the "Premium" feature-comparison header.
    expect(screen.getAllByText('Premium')).toHaveLength(2);
    // Only the "Free" feature-comparison header — the plan label is NOT "Free".
    expect(screen.getAllByText('Free')).toHaveLength(1);
  });

  it('labels a free user as Free', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isPremium: false,
      tier: 'free',
      loading: false,
    });

    render(<SubscriptionSettingsScreen />);

    // Plan label "Free" + the "Free" feature-comparison header.
    expect(screen.getAllByText('Free')).toHaveLength(2);
    // Only the "Premium" feature-comparison header.
    expect(screen.getAllByText('Premium')).toHaveLength(1);
  });
});

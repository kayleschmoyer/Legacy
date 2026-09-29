import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert, Linking, Platform } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import SubscriptionSettingsScreen from './SubscriptionSettingsScreen';
import {
  ACTIVATION_MAX_POLLS,
  ACTIVATION_POLL_INTERVAL_MS,
  PREMIUM_FEATURES,
} from './constants';

// ── Mock type helpers ────────────────────────────────────────────────────────
type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSearchParams: { checkout?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

const mockRequireStepUp = jest.fn();
const mockOnStepUpVerified = jest.fn();
const mockOnStepUpDismiss = jest.fn();
let mockIsStepUpPrompting = false;
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useStepUpGate: () => ({
    isPrompting: mockIsStepUpPrompting,
    requireStepUp: mockRequireStepUp,
    onVerified: mockOnStepUpVerified,
    onDismiss: mockOnStepUpDismiss,
  }),
}));

jest.mock('../../common/auth/AuthHooks', () => ({
  useCurrentUserInfo: () => ({ data: { mfaEnabled: false }, loading: false }),
  readKeychainValue: jest.fn(),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('./StepUpModal', () => ({
  StepUpModal: ({
    onDismiss,
  }: {
    onSuccess: (v: number) => void;
    onDismiss: () => void;
    mfaEnabled?: boolean;
  }) => {
    const { View, Text } = jest.requireActual<typeof import('react-native')>(
      'react-native',
    ) as RNComponents;
    return (
      <View testID="step-up-modal">
        <Text onPress={onDismiss}>Dismiss</Text>
      </View>
    );
  },
}));

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
    createTokens: (tokens: unknown) => tokens,
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
    Text: ({
      children,
      accessibilityLabel,
      accessibilityRole,
    }: {
      children?: React.ReactNode;
      accessibilityLabel?: string;
      accessibilityRole?: 'text';
    }) => (
      <Text
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
      >
        {children}
      </Text>
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

const mockRefetch = jest.fn();

function resetMocks() {
  mockSearchParams = {};
  mockIsStepUpPrompting = false;
  mockRequireStepUp.mockReset();
  mockRefetch.mockReset();
  mockRefetch.mockResolvedValue(undefined);
  mockUseSubscription.mockReturnValue({
    subscription: null,
    isPremium: true,
    tier: 'monthly',
    loading: false,
    refetch: mockRefetch,
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
  // column headers render once each for non-Premium users only, so a free user
  // sees the plan label as a second occurrence of "Free".
  it('labels a premium subscriber as Premium, not Free', () => {
    mockUseSubscription.mockReturnValue({
      subscription: { status: 'active' },
      isPremium: true,
      tier: 'premium',
      loading: false,
      refetch: mockRefetch,
    });

    render(<SubscriptionSettingsScreen />);

    // Only the plan label — the feature-comparison card is hidden for Premium.
    expect(screen.getAllByText('Premium')).toHaveLength(1);
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText("What's Included")).toBeNull();
  });

  it('labels a free user as Free', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isPremium: false,
      tier: 'free',
      loading: false,
      refetch: mockRefetch,
    });

    render(<SubscriptionSettingsScreen />);

    // Plan label "Free" + the "Free" feature-comparison header.
    expect(screen.getAllByText('Free')).toHaveLength(2);
    // Only the "Premium" feature-comparison header.
    expect(screen.getAllByText('Premium')).toHaveLength(1);
  });
});

describe('SubscriptionSettingsScreen — comparison table a11y (LS-7395)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    // The comparison card only renders for non-Premium users.
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isPremium: false,
      tier: 'free',
      loading: false,
      refetch: mockRefetch,
    });
  });

  it('gives every Free/Premium indicator cell a column- and state-aware label', () => {
    render(<SubscriptionSettingsScreen />);

    for (const feature of PREMIUM_FEATURES) {
      const free = `${feature.label}: ${feature.free ? 'Included' : 'Not included'} on Free`;
      const premium = `${feature.label}: ${feature.premium ? 'Included' : 'Not included'} on Premium`;
      expect(screen.getByLabelText(free)).toHaveTextContent(
        feature.free ? '✓' : '—',
      );
      expect(screen.getByLabelText(premium)).toHaveTextContent(
        feature.premium ? '✓' : '—',
      );
    }
  });

  it('distinguishes a Free-excluded, Premium-included feature', () => {
    render(<SubscriptionSettingsScreen />);

    expect(
      screen.getByLabelText('Salary cap leagues: Not included on Free'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Salary cap leagues: Included on Premium'),
    ).toBeTruthy();
  });
});

describe('SubscriptionSettingsScreen — step-up gate (LS-5029)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it('routes the Upgrade button through requireStepUp instead of calling checkout directly', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      isPremium: false,
      tier: 'free',
      loading: false,
      refetch: mockRefetch,
    });
    const mockCreateCheckout = jest.fn();
    mockUseCheckoutSession.mockReturnValue([
      mockCreateCheckout,
      { loading: false },
    ]);

    render(<SubscriptionSettingsScreen />);

    fireEvent.press(screen.getAllByText(/^Upgrade/).slice(-1)[0]);

    expect(mockRequireStepUp).toHaveBeenCalledTimes(1);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  describe('double-tap guard (LS-7405)', () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isPremium: false,
        tier: 'free',
        loading: false,
        refetch: mockRefetch,
      });
      // Fresh step-up: the gate runs the action synchronously.
      mockRequireStepUp.mockImplementation((action: () => void) => action());
    });

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS });
    });

    it('creates one checkout session when Upgrade is pressed twice before the mutation resolves', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      let resolveCheckout: (v: unknown) => void = () => undefined;
      const mockCreateCheckout = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveCheckout = resolve;
          }),
      );
      // `loading` stays false: the render-lag window the ref guards against.
      mockUseCheckoutSession.mockReturnValue([
        mockCreateCheckout,
        { loading: false },
      ]);

      render(<SubscriptionSettingsScreen />);

      const upgrade = screen.getAllByText(/^Upgrade/).slice(-1)[0];
      fireEvent.press(upgrade);
      fireEvent.press(upgrade);

      expect(mockCreateCheckout).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveCheckout({ data: { createCheckoutSession: { url: null } } });
        await Promise.resolve();
      });
    });

    it('creates one checkout session when the iOS Continue button is pressed twice', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
      let resolveCheckout: (v: unknown) => void = () => undefined;
      const mockCreateCheckout = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveCheckout = resolve;
          }),
      );
      mockUseCheckoutSession.mockReturnValue([
        mockCreateCheckout,
        { loading: false },
      ]);

      render(<SubscriptionSettingsScreen />);
      fireEvent.press(screen.getAllByText(/^Upgrade/).slice(-1)[0]);

      const buttons = alertSpy.mock.calls[0][2] ?? [];
      const proceed = buttons.find((b) => b.text === 'Continue');
      proceed?.onPress?.();
      proceed?.onPress?.();

      expect(mockCreateCheckout).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveCheckout({ data: { createCheckoutSession: { url: null } } });
        await Promise.resolve();
      });
      alertSpy.mockRestore();
    });

    it('releases the lock after a failure so the user can retry', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
      const mockCreateCheckout = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ data: { createCheckoutSession: { url: null } } });
      mockUseCheckoutSession.mockReturnValue([
        mockCreateCheckout,
        { loading: false },
      ]);

      render(<SubscriptionSettingsScreen />);
      const upgrade = screen.getAllByText(/^Upgrade/).slice(-1)[0];

      await act(async () => {
        fireEvent.press(upgrade);
        await Promise.resolve();
      });
      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Unable to start checkout. Please try again.',
      );

      await act(async () => {
        fireEvent.press(upgrade);
        await Promise.resolve();
      });
      expect(mockCreateCheckout).toHaveBeenCalledTimes(2);
      alertSpy.mockRestore();
    });
  });

  it('routes the Manage Subscription button through requireStepUp instead of opening the portal directly', () => {
    const mockCreatePortal = jest.fn();
    mockUseBillingPortalSession.mockReturnValue([
      mockCreatePortal,
      { loading: false },
    ]);

    render(<SubscriptionSettingsScreen />);

    fireEvent.press(screen.getByText('Manage Subscription'));

    expect(mockRequireStepUp).toHaveBeenCalledTimes(1);
    expect(mockCreatePortal).not.toHaveBeenCalled();
  });

  it('renders the StepUpModal when isStepUpPrompting is true', () => {
    mockIsStepUpPrompting = true;

    render(<SubscriptionSettingsScreen />);

    expect(screen.getByTestId('step-up-modal')).toBeTruthy();
  });

  it('does not render the StepUpModal when isStepUpPrompting is false', () => {
    mockIsStepUpPrompting = false;

    render(<SubscriptionSettingsScreen />);

    expect(screen.queryByTestId('step-up-modal')).toBeNull();
  });
});

// The Stripe return deep link (`legacysports://subscription/success`) is
// rewritten by `+native-intent` to `/subscription-settings?checkout=success`.
// This screen owns what happens after that landing.
describe('SubscriptionSettingsScreen — Stripe checkout return', () => {
  const FREE_SUBSCRIPTION = {
    subscription: null,
    isPremium: false,
    tier: 'free',
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the activation state and refetches on a successful checkout return', () => {
    mockUseSubscription.mockReturnValue({
      ...FREE_SUBSCRIPTION,
      refetch: mockRefetch,
    });
    mockSearchParams = { checkout: 'success' };

    render(<SubscriptionSettingsScreen />);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Activating your Premium membership/)).toBeTruthy();
    expect(screen.getByText('Activating…')).toBeTruthy();
    // A buyer who just paid must not be shown the upgrade CTA again while the
    // webhook is still in flight.
    expect(screen.queryByText(/^Upgrade —/)).toBeNull();
  });

  it('keeps polling until the webhook flips the tier, then stops', () => {
    jest.useFakeTimers();
    mockUseSubscription.mockReturnValue({
      ...FREE_SUBSCRIPTION,
      refetch: mockRefetch,
    });
    mockSearchParams = { checkout: 'success' };

    const { rerender } = render(<SubscriptionSettingsScreen />);
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    void act(() => {
      jest.advanceTimersByTime(ACTIVATION_POLL_INTERVAL_MS);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(2);

    // The webhook lands: the query now reports premium.
    mockUseSubscription.mockReturnValue({
      subscription: { status: 'active' },
      isPremium: true,
      tier: 'premium',
      loading: false,
      refetch: mockRefetch,
    });
    rerender(<SubscriptionSettingsScreen />);

    expect(screen.queryByText(/Activating your Premium membership/)).toBeNull();

    void act(() => {
      jest.advanceTimersByTime(ACTIVATION_POLL_INTERVAL_MS * 5);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget rather than polling forever', () => {
    jest.useFakeTimers();
    mockUseSubscription.mockReturnValue({
      ...FREE_SUBSCRIPTION,
      refetch: mockRefetch,
    });
    mockSearchParams = { checkout: 'success' };

    render(<SubscriptionSettingsScreen />);

    for (let i = 0; i < ACTIVATION_MAX_POLLS + 2; i++) {
      void act(() => {
        jest.advanceTimersByTime(ACTIVATION_POLL_INTERVAL_MS);
      });
    }

    // One immediate refetch on landing plus the full retry budget, no more.
    expect(mockRefetch).toHaveBeenCalledTimes(ACTIVATION_MAX_POLLS + 1);
    expect(screen.queryByText(/Activating your Premium membership/)).toBeNull();
    // Falls back to the normal free-tier view so the user can retry.
    expect(screen.getByText(/^Upgrade —/)).toBeTruthy();
  });

  it('refetches once on a billing portal return without an activation window', () => {
    mockSearchParams = { checkout: 'portal-return' };

    render(<SubscriptionSettingsScreen />);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Activating your Premium membership/)).toBeNull();
  });

  it('does nothing on a canceled checkout beyond landing on the screen', () => {
    mockUseSubscription.mockReturnValue({
      ...FREE_SUBSCRIPTION,
      refetch: mockRefetch,
    });
    mockSearchParams = { checkout: 'canceled' };

    render(<SubscriptionSettingsScreen />);

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/Activating your Premium membership/)).toBeNull();
    expect(screen.getByText(/^Upgrade —/)).toBeTruthy();
  });
});

describe('SubscriptionSettingsScreen — combined cancel/past-due banner (LS-7390)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  function renderWith(overrides: {
    cancelAtPeriodEnd: boolean;
    gracePeriodEndsAt: string | null;
  }) {
    mockUseSubscription.mockReturnValue({
      subscription: {
        status: overrides.gracePeriodEndsAt ? 'past_due' : 'active',
        currentPeriodEnd: '2026-08-15T00:00:00.000Z',
        ...overrides,
      },
      isPremium: true,
      tier: 'premium',
      loading: false,
      refetch: mockRefetch,
    });
    render(<SubscriptionSettingsScreen />);
  }

  it('renders only the cancel banner when only cancelAtPeriodEnd is set', () => {
    renderWith({ cancelAtPeriodEnd: true, gracePeriodEndsAt: null });

    expect(screen.getAllByText('⚠️')).toHaveLength(1);
    expect(
      screen.getByText(/Your subscription is set to cancel at the end/),
    ).toBeTruthy();
    expect(screen.queryByText(/Payment issue detected/)).toBeNull();
  });

  it('renders only the payment-issue banner when only gracePeriodEndsAt is set', () => {
    renderWith({
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: '2026-08-20T00:00:00.000Z',
    });

    expect(screen.getAllByText('⚠️')).toHaveLength(1);
    expect(screen.getByText(/Payment issue detected/)).toBeTruthy();
    expect(screen.queryByText(/set to cancel/)).toBeNull();
  });

  it('renders exactly one combined banner when both are set', () => {
    renderWith({
      cancelAtPeriodEnd: true,
      gracePeriodEndsAt: '2026-08-20T00:00:00.000Z',
    });

    expect(screen.getAllByText('⚠️')).toHaveLength(1);
    expect(
      screen.getByText(/past due and set to cancel.*canceled on/),
    ).toBeTruthy();
    expect(screen.queryByText(/Payment issue detected/)).toBeNull();
    expect(
      screen.queryByText(/Your subscription is set to cancel at the end/),
    ).toBeNull();
  });

  it('renders no status banner when neither is set', () => {
    renderWith({ cancelAtPeriodEnd: false, gracePeriodEndsAt: null });

    expect(screen.queryByText('⚠️')).toBeNull();
    expect(screen.getByText('Renews on')).toBeTruthy();
  });
});

/**
 * Regression tests for LS-5176: the "Manage Subscription" button (which opens
 * the Stripe billing portal) must NOT render for free users with no
 * subscription row. Such users have no Stripe customer, so opening the portal
 * fails server-side — the button is gated behind an active/past-due/canceled
 * subscription. These tests pin that gating so it cannot regress, alongside the
 * backend fix that turns the portal error into a BAD_USER_INPUT GraphQLError.
 *
 * Lives in a `.render.spec.tsx` file (not `SubscriptionPage.spec.ts`) because
 * these are RTL render tests requiring JSX, and a `.ts`/`.tsx` pair sharing the
 * `SubscriptionPage.spec` basename collides in TypeScript module resolution.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import SubscriptionPage, {
  ACTIVATION_MAX_POLLS,
  getActivationPollDelayMs,
} from './SubscriptionPage';

type ChildrenProps = { children?: React.ReactNode };

type SubscriptionMock = {
  status: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string | null;
  gracePeriodEndsAt?: string | null;
};

type MySubscriptionQueryMock = {
  data?: { mySubscription: SubscriptionMock | null };
  loading: boolean;
  refetch: jest.Mock;
};

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockUseWebSocket = jest.fn<undefined, [UseWebSocketOptions]>();
jest.mock('@legacy-sports/shared-components/ui', () => ({
  H1: ({ children }: ChildrenProps) => <h1>{children}</h1>,
  Paragraph: ({ children }: ChildrenProps) => <p>{children}</p>,
  useWebSocket: (opts: UseWebSocketOptions) => mockUseWebSocket(opts),
  XStack: ({ children }: ChildrenProps) => <div>{children}</div>,
  YStack: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

jest.mock('../../components/PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  styled: <T,>(Component: T) => Component,
  Button: ({ children, onPress }: ChildrenProps & { onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ScrollView: ({ children }: ChildrenProps) => <div>{children}</div>,
  Separator: () => <hr />,
}));

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => null,
  CheckCircle2: () => null,
  CreditCard: () => null,
  Crown: () => null,
  RefreshCw: () => null,
  Zap: () => null,
}));

interface MockStripePrices {
  monthlyPrice: number;
  annualTotal: number;
  monthlyPriceDisplay: string;
  annualPriceDisplay: string;
  annualMonthlyEquivalent: string;
  annualSavingsPct: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  loading: boolean;
  pricesFailed: boolean;
}

const LOADED_STRIPE_PRICES: MockStripePrices = {
  monthlyPrice: 9.99,
  annualTotal: 99.99,
  monthlyPriceDisplay: '$9.99',
  annualPriceDisplay: '$99.99',
  annualMonthlyEquivalent: '$8.33',
  annualSavingsPct: '17%',
  monthlyPriceId: 'price_monthly',
  annualPriceId: 'price_annual',
  loading: false,
  pricesFailed: false,
};

// Hardcoded fallback figures useStripePrices serves while the Stripe query
// is in flight (FALLBACK_MONTHLY_PRICE_CENTS / FALLBACK_ANNUAL_TOTAL_CENTS) —
// distinct from LOADED_STRIPE_PRICES so a leaked fallback render is detectable.
const LOADING_STRIPE_PRICES: MockStripePrices = {
  monthlyPrice: 4.99,
  annualTotal: 39.99,
  monthlyPriceDisplay: '$4.99',
  annualPriceDisplay: '$39.99',
  annualMonthlyEquivalent: '$3.33',
  annualSavingsPct: '33%',
  monthlyPriceId: null,
  annualPriceId: null,
  loading: true,
  pricesFailed: false,
};

const mockUseStripePrices = jest.fn<MockStripePrices, []>(
  () => LOADED_STRIPE_PRICES,
);
jest.mock('../../hooks/useStripePrices', () => ({
  useStripePrices: () => mockUseStripePrices(),
}));

jest.mock('../../utils/analytics', () => ({
  trackBeginCheckout: jest.fn(),
  trackPurchase: jest.fn(),
  trackSubscriptionStarted: jest.fn(),
}));

const mockCreateCheckoutSession = jest.fn();
const mockUseGetMySubscriptionQuery = jest.fn<MySubscriptionQueryMock, []>();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMySubscriptionQuery: (): MySubscriptionQueryMock =>
    mockUseGetMySubscriptionQuery(),
  useCreateCheckoutSessionMutation: () => [
    mockCreateCheckoutSession,
    { loading: false },
  ],
  useCreateBillingPortalSessionMutation: () => [jest.fn(), { loading: false }],
}));

type UseLeagueWebSocketOptions = {
  onSubscriptionUpdated?: () => void;
};

const mockUseLeagueWebSocket = jest.fn<{ connected: boolean }, [unknown]>();
jest.mock('../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: (opts: unknown) => mockUseLeagueWebSocket(opts),
}));

const mockUseLeagueWebSocketClient = jest.fn<
  { client: unknown; connected: boolean },
  []
>();
jest.mock('../../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: () => mockUseLeagueWebSocketClient(),
}));

type UseWebSocketOptions = {
  viewContext?: string;
  autoConnect?: boolean;
  onSubscriptionUpdated?: () => void;
};

jest.mock('@legacy-sports/shared-components/auth', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@legacy-sports/shared-components/auth',
  );
  return {
    ...actual,
    useAuth: jest.fn(() => ({ user: { id: 1 }, token: 'test-token' })),
    // Fresh step-up: run the action immediately, like the real hook does when
    // isStepUpFresh() is true (no de-duplication of repeat calls).
    useStepUpGate: () => ({
      isPrompting: false,
      requireStepUp: (action: () => void | Promise<void>) => void action(),
      onVerified: jest.fn(),
      onDismiss: jest.fn(),
    }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SubscriptionPage />
    </MemoryRouter>,
  );
}

describe('SubscriptionPage — Manage Subscription gating (LS-5176)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  it('hides the Manage Subscription button for free users with no subscription row', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch: jest.fn(),
    });

    renderPage();

    expect(screen.getByText('Free Plan')).toBeInTheDocument();
    expect(screen.queryByText('Manage Subscription')).not.toBeInTheDocument();
  });

  it('shows the Manage Subscription button for an active (premium) subscriber', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: {
        mySubscription: {
          status: 'active',
          tier: 'premium',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
      },
      loading: false,
      refetch: jest.fn(),
    });

    renderPage();

    expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
  });
});

describe('SubscriptionPage — trialing status (LS-7391)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  function mockSubscription(overrides: Partial<SubscriptionMock>) {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: {
        mySubscription: {
          status: 'trialing',
          tier: 'premium',
          currentPeriodEnd: '2026-08-01T12:00:00.000Z',
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          ...overrides,
        },
      },
      loading: false,
      refetch: jest.fn(),
    });
  }

  it('labels a trialing subscription "Trial" and shows the trial end date', () => {
    mockSubscription({ trialEndsAt: '2026-07-15T12:00:00.000Z' });

    renderPage();

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Trial ends')).toBeInTheDocument();
    expect(screen.getByText('July 15, 2026')).toBeInTheDocument();
  });

  it('omits the trial end row when trialEndsAt is absent', () => {
    mockSubscription({ trialEndsAt: null });

    renderPage();

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.queryByText('Trial ends')).not.toBeInTheDocument();
  });

  it('does not show the trial end row for a paid active subscription', () => {
    mockSubscription({
      status: 'active',
      trialEndsAt: '2026-07-15T12:00:00.000Z',
    });

    renderPage();

    expect(screen.queryByText('Trial ends')).not.toBeInTheDocument();
  });
});

describe('SubscriptionPage — realtime subscription refresh (LS-7380)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
  });

  it('refetches when a SUBSCRIPTION_UPDATED push arrives', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch,
    });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: {},
      connected: true,
    });

    renderPage();

    const opts = mockUseLeagueWebSocket.mock
      .calls[0]?.[0] as UseLeagueWebSocketOptions;
    expect(opts.onSubscriptionUpdated).toBeDefined();
    opts.onSubscriptionUpdated?.();

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches on window focus when no live WebSocket client is available', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch,
    });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });

    renderPage();
    window.dispatchEvent(new Event('focus'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on window focus when a live WebSocket client is present', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch,
    });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: {},
      connected: true,
    });

    renderPage();
    window.dispatchEvent(new Event('focus'));

    expect(refetch).not.toHaveBeenCalled();
  });
});

describe('SubscriptionPage — live update on SUBSCRIPTION_UPDATED push (LS-7384)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
  });

  it('refetches mySubscription when the WebSocket reports onSubscriptionUpdated', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: {
        mySubscription: {
          status: 'past_due',
          tier: 'premium',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
      },
      loading: false,
      refetch,
    });

    renderPage();

    expect(mockUseWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({
        viewContext: 'general',
        onSubscriptionUpdated: expect.any(Function),
      }),
    );

    const opts = mockUseWebSocket.mock.calls[0]?.[0];
    expect(opts?.onSubscriptionUpdated).toBeDefined();
    opts?.onSubscriptionUpdated?.();

    expect(refetch).toHaveBeenCalled();
  });

  it('does not attempt a WebSocket connection when no auth token is available', () => {
    jest
      .requireMock('@legacy-sports/shared-components/auth')
      .useAuth.mockReturnValueOnce({ user: { id: 1 }, token: null });

    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch: jest.fn(),
    });

    renderPage();

    expect(mockUseWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ autoConnect: false }),
    );
  });
});

describe('SubscriptionPage — past-due banner grace period date (LS-7400)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  function mockPastDue(gracePeriodEndsAt: string | null | undefined) {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: {
        mySubscription: {
          status: 'past_due',
          tier: 'premium',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt,
        },
      },
      loading: false,
      refetch: jest.fn(),
    });
  }

  it('shows the formatted grace period expiry date in the banner', () => {
    mockPastDue('2026-07-15T12:00:00.000Z');

    renderPage();

    expect(
      screen.getByText(
        'Your payment failed. Please update your payment method to keep your Premium access until July 15, 2026.',
      ),
    ).toBeInTheDocument();
  });

  it.each([null, undefined])(
    'falls back to the date-less text when gracePeriodEndsAt is %s',
    (value) => {
      mockPastDue(value);

      renderPage();

      expect(
        screen.getByText(
          'Your payment failed. Please update your payment method to keep your Premium access.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/until/)).not.toBeInTheDocument();
    },
  );
});

// LS-8813: useStripePrices returns the hardcoded fallback prices ($4.99/mo,
// $39.99/yr) together with a `loading` flag so callers can suppress the
// fallback while the live Stripe query is in flight. SubscriptionPage
// previously discarded that flag on destructure — a same-named `loading`
// from useGetMySubscriptionQuery shadowed it — so the fallback rendered on
// every cold load regardless of the hook's actual loading state.
describe('SubscriptionPage — price loading state (LS-8813)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
  });

  it('never renders the hardcoded fallback price while the Stripe prices query is in flight', () => {
    mockUseStripePrices.mockReturnValue(LOADING_STRIPE_PRICES);

    renderPage();

    expect(screen.queryByText(/4\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/39\.99/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('price-skeleton').length).toBeGreaterThan(0);
  });

  it('renders the live price once the query resolves, not the fallback', () => {
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);

    renderPage();

    // Default billing cycle is annual.
    expect(screen.getByText('$99.99')).toBeInTheDocument();
    expect(screen.queryByText(/4\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/39\.99/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
  });

  it('still renders the fallback price when the prices query genuinely fails (not loading)', () => {
    mockUseStripePrices.mockReturnValue({
      ...LOADING_STRIPE_PRICES,
      loading: false,
      pricesFailed: true,
    });

    renderPage();

    expect(screen.getByText('$39.99')).toBeInTheDocument();
    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
  });
});

// LS-7406: two overlapping handleUpgradeAction calls (fresh step-up runs the
// action synchronously with no de-duplication) must only surface the latest
// call's outcome in checkoutError — a slower, earlier call settling late is a
// no-op.
describe('SubscriptionPage — overlapping upgrade attempts (LS-7406)', () => {
  const COULD_NOT_START =
    'Could not start checkout — please try again or contact support.';

  // Let promise continuations queued by the mocked mutation settle in act().
  const flushPromises = () => act(() => Promise.resolve());

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCheckoutSession.mockReset();
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  function clickUpgrade() {
    fireEvent.click(screen.getByText(/Upgrade to Premium — /));
  }

  it('still shows the error for a single failed attempt', async () => {
    mockCreateCheckoutSession.mockRejectedValueOnce(new Error('boom'));

    renderPage();
    act(() => {
      clickUpgrade();
    });
    await flushPromises();

    expect(screen.getByText(COULD_NOT_START)).toBeInTheDocument();
  });

  it('ignores a stale error from an earlier in-flight call while a newer call is pending', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockCreateCheckoutSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    renderPage();
    act(() => {
      clickUpgrade();
      clickUpgrade();
    });
    await flushPromises();
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2);

    // The earlier (slower) call fails after the newer one started.
    act(() => {
      first.reject(new Error('stale failure'));
    });
    await flushPromises();
    expect(screen.queryByText(COULD_NOT_START)).not.toBeInTheDocument();

    // The newer call's own outcome is still reported.
    act(() => {
      second.resolve({ data: { createCheckoutSession: { url: null } } });
    });
    await flushPromises();
    expect(screen.getByText(COULD_NOT_START)).toBeInTheDocument();
  });

  it('does not let an earlier call overwrite the latest call after it settles', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockCreateCheckoutSession
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    renderPage();
    act(() => {
      clickUpgrade();
      clickUpgrade();
    });
    await flushPromises();

    // Newer call settles first with an error, then the older one settles with
    // an empty result — the error must remain (latest wins, no clearing).
    act(() => {
      second.reject(new Error('latest failure'));
    });
    await flushPromises();
    expect(screen.getByText(COULD_NOT_START)).toBeInTheDocument();
    act(() => {
      first.resolve({ data: { createCheckoutSession: { url: null } } });
    });
    await flushPromises();
    expect(screen.getByText(COULD_NOT_START)).toBeInTheDocument();
  });
});

describe('SubscriptionPage — league-cap comparison row (LS-7394)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  it('renders one "Active leagues" row with text values instead of two boolean league rows', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch: jest.fn(),
    });

    renderPage();

    expect(screen.getByText('Active leagues')).toBeInTheDocument();
    expect(screen.getByText('Up to 3')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByText('Join up to 3 leagues')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Unlimited active leagues'),
    ).not.toBeInTheDocument();
    // Unchanged boolean rows still render.
    expect(screen.getByText('Salary cap leagues')).toBeInTheDocument();
    expect(screen.getByText('FAAB waivers')).toBeInTheDocument();
  });

  it('keeps the league row in the cancel dialog "lose access" list, worded as a loss', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: {
        mySubscription: {
          status: 'active',
          tier: 'premium',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
      },
      loading: false,
      refetch: jest.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByText('Cancel Subscription'));

    expect(screen.getByText('Unlimited active leagues')).toBeInTheDocument();
    expect(screen.getByText('Salary cap leagues')).toBeInTheDocument();
  });
});

// LS-7424: checkoutJustCompleted was a one-shot flag — once true it never reset,
// so a second ?checkout=success in the same mounted page set it true again (a
// no-op) and never reopened the activation window (no refetch, no polling).
describe('SubscriptionPage — repeat checkout return in one session (LS-7424)', () => {
  const POLL_BUDGET_TICKS = ACTIVATION_MAX_POLLS;
  let navigateTo: (to: string) => void = () => undefined;

  function NavigatorProbe() {
    navigateTo = useNavigate();
    return null;
  }

  // Each poll timer is scheduled by an effect that only re-runs after the
  // previous tick's state update renders, so advance one backoff delay per
  // act() (LS-7423: the delay grows with the attempt number).
  function advancePollTicks(ticks: number) {
    for (let i = 0; i < ticks; i += 1) {
      act(() => {
        jest.advanceTimersByTime(getActivationPollDelayMs(i));
      });
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sessionStorage.clear();
    mockUseLeagueWebSocket.mockReturnValue({ connected: false });
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    mockUseStripePrices.mockReturnValue(LOADED_STRIPE_PRICES);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reopens the activation window (immediate refetch + polling) for a second checkout return', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockUseGetMySubscriptionQuery.mockReturnValue({
      data: { mySubscription: null },
      loading: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/profile/subscription?checkout=success&session_id=abc',
        ]}
      >
        <NavigatorProbe />
        <SubscriptionPage />
      </MemoryRouter>,
    );

    // First checkout: immediate refetch, then the poll loop runs to exhaustion
    // (premium never shows up) and closes the activation window.
    expect(refetch).toHaveBeenCalledTimes(1);
    advancePollTicks(POLL_BUDGET_TICKS);
    const callsAfterFirstWindow = refetch.mock.calls.length;
    expect(callsAfterFirstWindow).toBe(1 + POLL_BUDGET_TICKS);

    // No further polling once the window has closed.
    advancePollTicks(POLL_BUDGET_TICKS);
    expect(refetch).toHaveBeenCalledTimes(callsAfterFirstWindow);

    // Second checkout return in the same mounted page.
    act(() => {
      navigateTo('/profile/subscription?checkout=success&session_id=def');
    });
    expect(refetch).toHaveBeenCalledTimes(callsAfterFirstWindow + 1);

    // ...and it polls again.
    advancePollTicks(1);
    expect(refetch).toHaveBeenCalledTimes(callsAfterFirstWindow + 2);
  });
});

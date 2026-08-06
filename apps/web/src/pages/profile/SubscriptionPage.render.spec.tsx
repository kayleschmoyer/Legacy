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
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubscriptionPage from './SubscriptionPage';

type ChildrenProps = { children?: React.ReactNode };

type SubscriptionMock = {
  status: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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

jest.mock('@legacy-sports/shared-components/ui', () => ({
  H1: ({ children }: ChildrenProps) => <h1>{children}</h1>,
  Paragraph: ({ children }: ChildrenProps) => <p>{children}</p>,
  XStack: ({ children }: ChildrenProps) => <div>{children}</div>,
  YStack: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

jest.mock('../../components/PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
}));

jest.mock('tamagui', () => ({
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

const mockUseGetMySubscriptionQuery = jest.fn<MySubscriptionQueryMock, []>();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMySubscriptionQuery: (): MySubscriptionQueryMock =>
    mockUseGetMySubscriptionQuery(),
  useCreateCheckoutSessionMutation: () => [jest.fn(), { loading: false }],
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

const mockUseWebSocket = jest.fn<undefined, [UseWebSocketOptions]>();
jest.mock('@legacy-sports/shared-components', () => ({
  useWebSocket: (opts: UseWebSocketOptions) => mockUseWebSocket(opts),
}));

jest.mock('@legacy-sports/shared-components/auth', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@legacy-sports/shared-components/auth',
  );
  return {
    ...actual,
    useAuth: jest.fn(() => ({ user: { id: 1 }, token: 'test-token' })),
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

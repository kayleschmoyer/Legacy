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

jest.mock('../../hooks/useStripePrices', () => ({
  useStripePrices: () => ({
    monthlyPrice: 9.99,
    annualTotal: 99.99,
    monthlyPriceDisplay: '$9.99',
    annualPriceDisplay: '$99.99',
    annualMonthlyEquivalent: '$8.33',
    annualSavingsPct: '17%',
    monthlyPriceId: 'price_monthly',
    annualPriceId: 'price_annual',
  }),
}));

jest.mock('../../utils/analytics', () => ({
  trackBeginCheckout: jest.fn(),
  trackPurchase: jest.fn(),
  trackSubscriptionStarted: jest.fn(),
}));

const mockUseGetMySubscriptionQuery = jest.fn<MySubscriptionQueryMock, []>();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetMySubscriptionQuery: (): MySubscriptionQueryMock =>
    mockUseGetMySubscriptionQuery(),
  useCreateCheckoutSessionMutation: () => [jest.fn(), { loading: false }],
  useCreateBillingPortalSessionMutation: () => [jest.fn(), { loading: false }],
}));

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

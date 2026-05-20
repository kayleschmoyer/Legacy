/**
 * Regression tests for LS-4028: AdminRevenuePage showed a blank screen when
 * `useAdminRevenueStatsQuery` returned `data.adminRevenueStats == null`
 * without an error. These tests pin the rendering of each (loading / error /
 * empty / data) state so the empty-state explanation cannot regress.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminRevenuePage from './AdminRevenuePage';

type ChildrenProps = { children?: React.ReactNode };

type AuthMock = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: { accessLevel: string };
};

type RevenueStatsMock = {
  data?:
    | {
        adminRevenueStats: {
          totalSubscribers?: number;
          totalPremiumUsers?: number;
          totalFreeUsers?: number;
          conversionRate?: number;
          newSubscribersThisMonth?: number;
          totalUsers?: number;
          statusBreakdown?: unknown[];
          subscriberGrowth?: unknown[];
        } | null;
      }
    | undefined;
  loading: boolean;
  error?: Error;
};

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Paragraph: ({ children }: ChildrenProps) => <p>{children}</p>,
  Separator: () => <hr />,
  XStack: ({ children }: ChildrenProps) => <div>{children}</div>,
  YStack: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

jest.mock('tamagui', () => ({
  styled: <T,>(Component: T) => Component,
  Card: ({ children }: ChildrenProps) => <div>{children}</div>,
  Spinner: () => <span data-testid="spinner" />,
  Text: ({ children }: ChildrenProps) => <span>{children}</span>,
}));

jest.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: ChildrenProps) => <div>{children}</div>,
  Bar: () => null,
  BarChart: ({ children }: ChildrenProps) => <div>{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: ChildrenProps) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const mockUseAuth = jest.fn<AuthMock, []>();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (): AuthMock => mockUseAuth(),
}));

const mockUseAdminRevenueStatsQuery = jest.fn<RevenueStatsMock, [unknown?]>();
jest.mock('../../api/db/graphql.generated', () => ({
  useAdminRevenueStatsQuery: (opts?: unknown): RevenueStatsMock =>
    mockUseAdminRevenueStatsQuery(opts),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminRevenuePage />
    </MemoryRouter>,
  );
}

const adminAuth = {
  isAuthenticated: true,
  isLoading: false,
  user: { accessLevel: 'admin' },
};

describe('AdminRevenuePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(adminAuth);
  });

  it('shows the spinner while the query is loading', () => {
    mockUseAdminRevenueStatsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });

    renderPage();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(
      screen.queryByText(/No revenue data available/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to load revenue data/i),
    ).not.toBeInTheDocument();
  });

  it('shows the error card when the query errors', () => {
    mockUseAdminRevenueStatsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('boom'),
    });

    renderPage();

    expect(
      screen.getByText(/Failed to load revenue data/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No revenue data available/i),
    ).not.toBeInTheDocument();
  });

  it('shows the empty-state explanation when the query returns null without error', () => {
    mockUseAdminRevenueStatsQuery.mockReturnValue({
      data: { adminRevenueStats: null },
      loading: false,
      error: undefined,
    });

    renderPage();

    expect(screen.getByText(/No revenue data available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/metrics service is temporarily/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to load revenue data/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('renders KPIs when data is present and hides the empty state', () => {
    mockUseAdminRevenueStatsQuery.mockReturnValue({
      data: {
        adminRevenueStats: {
          totalSubscribers: 100,
          totalPremiumUsers: 80,
          totalFreeUsers: 20,
          conversionRate: 0.8,
          newSubscribersThisMonth: 5,
          totalUsers: 100,
          statusBreakdown: [],
          subscriberGrowth: [],
        },
      },
      loading: false,
      error: undefined,
    });

    renderPage();

    expect(screen.getByText('Total Subscribers')).toBeInTheDocument();
    expect(
      screen.queryByText(/No revenue data available/i),
    ).not.toBeInTheDocument();
  });
});

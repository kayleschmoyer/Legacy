import React from 'react';
import { render, screen } from '@testing-library/react-native';

import AdminRevenueScreen from './admin-revenue';

// ── Configurable mock state ──────────────────────────────────────────────────

let mockCurrentUser: { isAdmin: boolean } | null = null;
let mockAuthLoading = false;
let mockStatsData: unknown = undefined;
let mockStatsLoading = false;
let mockStatsError: Error | undefined = undefined;

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => {
      const { Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return <Text testID={`redirect-to-${href}`} />;
    },
  };
});

jest.mock('../../common/auth/AuthHooks', () => ({
  useCurrentUserInfo: () => ({
    data: mockCurrentUser,
    loading: mockAuthLoading,
  }),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useAdminRevenueStatsQuery: () => ({
    data: mockStatsData,
    loading: mockStatsLoading,
    error: mockStatsError,
  }),
}));

jest.mock('./_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

jest.mock('tamagui', () => {
  const { View, Text, ScrollView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const passthrough =
    (testID?: string) =>
    ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <View testID={testID} {...(rest as object)}>
        {children}
      </View>
    );
  return {
    H1: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    H3: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Paragraph: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Separator: passthrough(),
    Spinner: () => <View testID="spinner" />,
    Text: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...(rest as object)}>{children}</Text>,
    XStack: passthrough(),
    YStack: passthrough(),
    ScrollView: ({ children }: { children?: React.ReactNode }) => (
      <ScrollView>{children}</ScrollView>
    ),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCurrentUser = null;
  mockAuthLoading = false;
  mockStatsData = undefined;
  mockStatsLoading = false;
  mockStatsError = undefined;
});

describe('AdminRevenueScreen', () => {
  describe('auth loading', () => {
    it('renders nothing while auth is loading', () => {
      mockAuthLoading = true;
      render(<AdminRevenueScreen />);
      expect(screen.queryByText('Revenue Analytics')).toBeNull();
    });
  });

  describe('non-admin user', () => {
    it('redirects to / for non-admin users', () => {
      mockCurrentUser = { isAdmin: false };
      render(<AdminRevenueScreen />);
      expect(screen.getByTestId('redirect-to-/')).toBeTruthy();
    });

    it('redirects to / when no user is logged in', () => {
      mockCurrentUser = null;
      render(<AdminRevenueScreen />);
      expect(screen.getByTestId('redirect-to-/')).toBeTruthy();
    });
  });

  describe('admin user', () => {
    beforeEach(() => {
      mockCurrentUser = { isAdmin: true };
    });

    it('shows the Revenue Analytics heading', () => {
      render(<AdminRevenueScreen />);
      expect(screen.getByText('Revenue Analytics')).toBeTruthy();
    });

    it('shows a spinner while data is loading', () => {
      mockStatsLoading = true;
      render(<AdminRevenueScreen />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows an error message when the query fails', () => {
      mockStatsError = new Error('network error');
      render(<AdminRevenueScreen />);
      expect(screen.getByText(/Failed to load revenue data/i)).toBeTruthy();
    });

    it('shows "No revenue data available" when stats are null', () => {
      mockStatsData = { adminRevenueStats: null };
      render(<AdminRevenueScreen />);
      expect(screen.getByText(/No revenue data available/i)).toBeTruthy();
    });

    describe('with stats loaded', () => {
      const STATS = {
        totalSubscribers: 1234,
        totalPremiumUsers: 987,
        totalFreeUsers: 247,
        totalUsers: 5000,
        conversionRate: 0.197,
        newSubscribersThisMonth: 42,
        stripeSubscribers: 900,
        statusBreakdown: [
          { status: 'active', count: 900 },
          { status: 'trialing', count: 87 },
        ],
        subscriberGrowth: [
          { month: '2026-01', newSubscribers: 30 },
          { month: '2026-02', newSubscribers: 55 },
        ],
      };

      beforeEach(() => {
        mockStatsData = { adminRevenueStats: STATS };
      });

      it('displays total subscribers', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('1,234')).toBeTruthy();
      });

      it('displays premium users count', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('987')).toBeTruthy();
      });

      it('displays conversion rate as percentage', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('19.7%')).toBeTruthy();
      });

      it('displays new subscribers this month', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('42')).toBeTruthy();
      });

      it('displays total users', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('5,000')).toBeTruthy();
      });

      it('renders the Subscription Status section', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('Subscription Status')).toBeTruthy();
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.getByText('Trialing')).toBeTruthy();
      });

      it('renders the Subscriber Growth section', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('Subscriber Growth')).toBeTruthy();
        expect(screen.getByText('2026-01')).toBeTruthy();
        expect(screen.getByText('2026-02')).toBeTruthy();
      });

      it('renders Stripe subscriber count in Revenue by Platform', () => {
        render(<AdminRevenueScreen />);
        expect(screen.getByText('900 subscribers')).toBeTruthy();
      });

      it('does not show the spinner when data is loaded', () => {
        render(<AdminRevenueScreen />);
        expect(screen.queryByTestId('spinner')).toBeNull();
      });
    });
  });
});

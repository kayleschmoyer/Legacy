import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { TradeCenterPage } from './TradeCenterPage';

// ── Configurable mock state ──────────────────────────────────────────────────
let mockUserLeagues: unknown;
let mockUserTeamId: number | null;
let mockLeague: unknown;
let mockTeamTradeOffers: unknown[];
let mockIsPremium = false;

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'test@example.com' } }),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: () => ({
    data: mockUserLeagues,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
  useGetUserTeamIdQuery: () => ({
    data: { userTeamId: mockUserTeamId },
    loading: false,
  }),
  useGetLeagueByIdQuery: () => ({ data: mockLeague, loading: false }),
  useGetTeamTradeOffersQuery: () => ({
    data: { teamTradeOffers: mockTeamTradeOffers },
    loading: false,
  }),
}));

jest.mock('../../features/baseball/TradingCenter', () => ({
  TradingCenter: ({ leagueId }: { leagueId: number }) => (
    <div data-testid={`trading-center-${leagueId}`} />
  ),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({
    children,
    isPremium,
    featureName,
    featureDescription,
  }: {
    children: React.ReactNode;
    isPremium: boolean;
    featureName: string;
    featureDescription?: string;
  }) => (
    <div
      data-testid="premium-gate"
      data-is-premium={String(isPremium)}
      data-feature-name={featureName}
      data-feature-description={featureDescription ?? ''}
    >
      {children}
    </div>
  ),
}));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD: '#C5A55A',
  withAlpha: () => 'rgba(0,0,0,0)',
}));

jest.mock('tamagui', () => {
  return {
    Spinner: () => <div data-testid="spinner" />,
    Text: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <span onClick={onPress} {...(rest as object)}>
        {children}
      </span>
    ),
    XStack: ({ children }: { children: React.ReactNode }) => (
      <div style={{ display: 'flex' }}>{children}</div>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeftRight: () => null,
  BarChart2: () => null,
  ChevronLeft: () => null,
  RefreshCw: () => null,
  Users: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage(initialPath = '/trade-center') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/trade-center" element={<TradeCenterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUserLeagues = undefined;
  mockUserTeamId = null;
  mockLeague = undefined;
  mockTeamTradeOffers = [];
  mockIsPremium = false;
});

describe('TradeCenterPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('renders the Trade Center heading', () => {
    renderPage();
    expect(screen.getByText(/Trade Center/i)).toBeInTheDocument();
  });

  it('renders the league selection prompt', () => {
    renderPage();
    expect(screen.getByText(/Select a league/i)).toBeInTheDocument();
  });

  it('shows an empty state with CTAs when user has no leagues', () => {
    mockUserLeagues = { userLeagues: [] };
    renderPage();
    expect(screen.getByText(/No leagues yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Leagues/i)).toBeInTheDocument();
    expect(screen.getByText(/Create a League/i)).toBeInTheDocument();
  });

  it('renders a selectable league card for each league', () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 1, name: 'Alpha League' },
        { id: 2, name: 'Beta League' },
      ],
    };
    renderPage();
    expect(
      screen.getByRole('button', { name: /View trades for Alpha League/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /View trades for Beta League/i }),
    ).toBeInTheDocument();
  });

  it('shows TradingCenter when a league is selected and user has a team', async () => {
    mockUserLeagues = { userLeagues: [{ id: 3, name: 'My League' }] };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 3, owner: 99 } };
    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /View trades for My League/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-3')).toBeInTheDocument();
    });
  });

  it('shows non-member message when user has no team in selected league', async () => {
    mockUserLeagues = { userLeagues: [{ id: 3, name: 'My League' }] };
    mockUserTeamId = null;
    mockLeague = { league: { id: 3, owner: 99 } };
    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /View trades for My League/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/not a member/i)).toBeInTheDocument();
    });
  });

  it('pre-selects a league from the ?leagueId= query param', async () => {
    mockUserLeagues = { userLeagues: [{ id: 5, name: 'Deep Linked League' }] };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };

    renderPage('/trade-center?leagueId=5');

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-5')).toBeInTheDocument();
    });
  });

  it('shows a pending badge when the user has pending trade offers in a league', () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'Badge League' }] };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [{ id: 10 }, { id: 11 }];
    renderPage();
    expect(screen.getByLabelText('2 pending offers')).toBeInTheDocument();
  });

  it('shows singular label when exactly one pending offer exists', () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'Badge League' }] };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [{ id: 10 }];
    renderPage();
    expect(screen.getByLabelText('1 pending offer')).toBeInTheDocument();
  });

  it('does not show a badge when there are no pending offers', () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'No Badge League' }] };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [];
    renderPage();
    expect(screen.queryByLabelText(/pending offer/i)).not.toBeInTheDocument();
  });

  describe('TradeAnalyzerCard', () => {
    it('renders the Trade Analyzer heading on the landing screen', () => {
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      expect(screen.getByText('Trade Analyzer')).toBeInTheDocument();
    });

    it('shows PREMIUM badge and PremiumGate with isPremium=false for free users', () => {
      mockIsPremium = false;
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      expect(screen.getByText('PREMIUM')).toBeInTheDocument();
      const gate = screen.getByTestId('premium-gate');
      expect(gate).toBeInTheDocument();
      expect(gate.getAttribute('data-is-premium')).toBe('false');
      expect(gate.getAttribute('data-feature-name')).toBe('Trade Analyzer');
    });

    it('passes a featureDescription to PremiumGate', () => {
      mockIsPremium = false;
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      const gate = screen.getByTestId('premium-gate');
      expect(gate.getAttribute('data-feature-description')).toMatch(
        /trade fairness/i,
      );
    });

    it('hides PREMIUM badge for premium users', () => {
      mockIsPremium = true;
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      expect(screen.queryByText('PREMIUM')).not.toBeInTheDocument();
    });

    it('shows coming soon message for premium users', () => {
      mockIsPremium = true;
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
    });

    it('passes isPremium=true to PremiumGate for premium users', () => {
      mockIsPremium = true;
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      const gate = screen.getByTestId('premium-gate');
      expect(gate.getAttribute('data-is-premium')).toBe('true');
    });

    it('does not render TradeAnalyzerCard when a league is selected', async () => {
      mockUserLeagues = { userLeagues: [{ id: 3, name: 'My League' }] };
      mockUserTeamId = 42;
      mockLeague = { league: { id: 3, owner: 99 } };
      renderPage();

      fireEvent.click(
        screen.getByRole('button', { name: /View trades for My League/i }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('premium-gate')).not.toBeInTheDocument();
      });
    });
  });
});

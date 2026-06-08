import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { TradeCenterPage } from './TradeCenterPage';

// ── Configurable mock state ──────────────────────────────────────────────────
let mockUserLeagues: unknown;
let mockUserTeamId: number | null;
let mockLeague: unknown;

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
}));

jest.mock('../../features/baseball/TradingCenter', () => ({
  TradingCenter: ({ leagueId }: { leagueId: number }) => (
    <div data-testid={`trading-center-${leagueId}`} />
  ),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
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
});

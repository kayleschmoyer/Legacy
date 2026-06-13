import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

import { TradeCenterPage } from './TradeCenterPage';

// ── Configurable mock state ──────────────────────────────────────────────────
let mockUserLeagues: unknown;
let mockUserLeaguesPreviousData: unknown;
let mockLeaguesLoading = false;
let mockLeaguesError: unknown = undefined;
let mockUserTeamId: number | null;
let mockLeague: unknown;
let mockTeamTradeOffers: unknown[];
let mockIsPremium = false;

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'test@example.com' } }),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: () => ({
    data: mockUserLeagues,
    previousData: mockUserLeaguesPreviousData,
    loading: mockLeaguesLoading,
    error: mockLeaguesError,
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
  TradingCenter: ({
    leagueId,
    deepLinkOfferId,
    isPremium,
  }: {
    leagueId: number;
    deepLinkOfferId?: number;
    isPremium?: boolean;
  }) => (
    <div
      data-testid={`trading-center-${leagueId}`}
      data-deep-link-offer-id={deepLinkOfferId ?? ''}
      data-is-premium={isPremium == null ? '' : String(isPremium)}
    />
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
  BRAND_NAVY: '#1B3A5C',
  BRAND_SEAM_RED: '#C41E3A',
  TEXT_MUTED: '#9CAAC5',
  withAlpha: () => 'rgba(0,0,0,0)',
}));

jest.mock('tamagui', () => {
  return {
    Button: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <button type="button" onClick={onPress} {...(rest as object)}>
        {children}
      </button>
    ),
    Spinner: () => <div data-testid="spinner" />,
    Text: ({
      children,
      onPress,
      testID,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <span onClick={onPress} data-testid={testID} {...(rest as object)}>
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

jest.mock('../../components/icons/SportIcons', () => ({
  BaseballIcon: () => <div data-testid="baseball-icon" />,
  FootballIcon: () => <div data-testid="football-icon" />,
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
  mockUserLeaguesPreviousData = undefined;
  mockLeaguesLoading = false;
  mockLeaguesError = undefined;
  mockUserTeamId = null;
  mockLeague = undefined;
  mockTeamTradeOffers = [];
  mockIsPremium = false;
  mockNavigate.mockReset();
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

  it('does not show a spinner when stale league data exists during a background refetch', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Alpha League', leaguePhase: 'active' }],
    };
    mockLeaguesLoading = true;
    renderPage();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /View trades for Alpha League/i }),
    ).toBeInTheDocument();
  });

  it('shows stale leagues from previousData without a spinner when data resets during skip transition', () => {
    mockUserLeagues = undefined;
    mockUserLeaguesPreviousData = {
      userLeagues: [{ id: 1, name: 'Alpha League', leaguePhase: 'active' }],
    };
    mockLeaguesLoading = true;
    renderPage();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /View trades for Alpha League/i }),
    ).toBeInTheDocument();
  });

  it('shows error state with diagnostic code when leagues fail to load', () => {
    mockLeaguesError = new Error('Network error');
    renderPage();
    expect(screen.getByText(/Failed to load leagues/i)).toBeInTheDocument();
    expect(screen.getByTestId('load-leagues-error-diag')).toHaveTextContent(
      'Code: LOAD_LEAGUES_FAILED',
    );
  });

  it('includes server correlation id in the diagnostic line when present', () => {
    mockLeaguesError = new CombinedGraphQLErrors(
      {
        errors: [
          {
            message: 'Internal error',
            extensions: { correlationId: 'corr-abc-123' },
          },
        ],
      },
      [
        {
          message: 'Internal error',
          extensions: { correlationId: 'corr-abc-123' },
        },
      ],
    );
    renderPage();
    expect(screen.getByTestId('load-leagues-error-diag')).toHaveTextContent(
      'Ref: corr-abc-123',
    );
  });

  it('shows an empty state with CTAs when user has no leagues', () => {
    mockUserLeagues = { userLeagues: [] };
    renderPage();
    expect(screen.getByText(/No leagues yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Leagues/i)).toBeInTheDocument();
    expect(screen.getByText(/Create a League/i)).toBeInTheDocument();
  });

  it('navigates to /baseball/leagues when Browse Leagues is clicked', () => {
    mockUserLeagues = { userLeagues: [] };
    renderPage();
    fireEvent.click(screen.getByText(/Browse Leagues/i));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/leagues');
  });

  it('navigates to /league/create when Create a League is clicked', () => {
    mockUserLeagues = { userLeagues: [] };
    renderPage();
    fireEvent.click(screen.getByText(/Create a League/i));
    expect(mockNavigate).toHaveBeenCalledWith('/league/create');
  });

  it('renders a selectable league card for each league', () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 1, name: 'Alpha League', leaguePhase: 'active' },
        { id: 2, name: 'Beta League', leaguePhase: 'active' },
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
    mockUserLeagues = {
      userLeagues: [{ id: 3, name: 'My League', leaguePhase: 'active' }],
    };
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
    mockUserLeagues = {
      userLeagues: [{ id: 3, name: 'My League', leaguePhase: 'active' }],
    };
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
    mockUserLeagues = {
      userLeagues: [
        { id: 5, name: 'Deep Linked League', leaguePhase: 'active' },
      ],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };

    renderPage('/trade-center?leagueId=5');

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-5')).toBeInTheDocument();
    });
  });

  it('passes deepLinkOfferId to TradingCenter when ?offerId= is present', async () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 5, name: 'Deep Linked League', leaguePhase: 'active' },
      ],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };

    renderPage('/trade-center?leagueId=5&offerId=42');

    await waitFor(() => {
      const el = screen.getByTestId('trading-center-5');
      expect(el).toBeInTheDocument();
      expect(el.getAttribute('data-deep-link-offer-id')).toBe('42');
    });
  });

  it('ignores non-numeric ?offerId= param', async () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 5, name: 'Deep Linked League', leaguePhase: 'active' },
      ],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };

    renderPage('/trade-center?leagueId=5&offerId=abc');

    await waitFor(() => {
      const el = screen.getByTestId('trading-center-5');
      expect(el.getAttribute('data-deep-link-offer-id')).toBe('');
    });
  });

  it('shows a pending badge when the user has pending trade offers in a league', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Badge League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [{ id: 10 }, { id: 11 }];
    renderPage();
    expect(screen.getByLabelText('2 pending offers')).toBeInTheDocument();
  });

  it('shows singular label when exactly one pending offer exists', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Badge League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [{ id: 10 }];
    renderPage();
    expect(screen.getByLabelText('1 pending offer')).toBeInTheDocument();
  });

  it('does not show a badge when there are no pending offers', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'No Badge League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 7;
    mockTeamTradeOffers = [];
    renderPage();
    expect(screen.queryByLabelText(/pending offer/i)).not.toBeInTheDocument();
  });

  describe('cross-league pending summary', () => {
    it('shows a summary banner when any league has pending offers', async () => {
      mockUserLeagues = {
        userLeagues: [
          { id: 1, name: 'League A', leaguePhase: 'active' },
          { id: 2, name: 'League B', leaguePhase: 'active' },
        ],
      };
      mockUserTeamId = 7;
      mockTeamTradeOffers = [{ id: 10 }, { id: 11 }];
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
      });
    });

    it('aggregates pending offers from all leagues in the summary', async () => {
      // Mock returns 2 offers per league; 2 leagues = 4 total
      mockUserLeagues = {
        userLeagues: [
          { id: 1, name: 'League A', leaguePhase: 'active' },
          { id: 2, name: 'League B', leaguePhase: 'active' },
        ],
      };
      mockUserTeamId = 7;
      mockTeamTradeOffers = [{ id: 10 }, { id: 11 }];
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          '4 pending trade offers across 2 leagues',
        );
      });
    });

    it('uses singular form when only one offer exists across all leagues', async () => {
      mockUserLeagues = {
        userLeagues: [{ id: 1, name: 'League A', leaguePhase: 'active' }],
      };
      mockUserTeamId = 7;
      mockTeamTradeOffers = [{ id: 10 }];
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          '1 pending trade offer across 1 league',
        );
      });
    });

    it('does not show summary banner when there are no pending offers', async () => {
      mockUserLeagues = {
        userLeagues: [
          { id: 1, name: 'League A', leaguePhase: 'active' },
          { id: 2, name: 'League B', leaguePhase: 'active' },
        ],
      };
      mockUserTeamId = 7;
      mockTeamTradeOffers = [];
      renderPage();
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('does not show summary banner when no leagues are loaded', () => {
      mockUserLeagues = { userLeagues: [] };
      renderPage();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not show summary banner when a league is selected', async () => {
      mockUserLeagues = {
        userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
      };
      mockUserTeamId = 42;
      mockLeague = { league: { id: 1, owner: 99 } };
      mockTeamTradeOffers = [{ id: 10 }];
      renderPage();

      fireEvent.click(
        screen.getByRole('button', { name: /View trades for My League/i }),
      );

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
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
      mockUserLeagues = {
        userLeagues: [{ id: 3, name: 'My League', leaguePhase: 'active' }],
      };
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

  it('shows baseball icon for a baseball league', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 1,
          name: 'Baseball League',
          sport: 'baseball',
          leaguePhase: 'active',
        },
      ],
    };
    renderPage();
    expect(screen.getByTestId('baseball-icon')).toBeInTheDocument();
  });

  it('shows football icon for a football league', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 2,
          name: 'Football League',
          sport: 'football',
          leaguePhase: 'active',
        },
      ],
    };
    renderPage();
    expect(screen.getByTestId('football-icon')).toBeInTheDocument();
  });

  it('defaults to baseball icon when sport is not set', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 3,
          name: 'Unknown Sport League',
          sport: null,
          leaguePhase: 'active',
        },
      ],
    };
    renderPage();
    expect(screen.getByTestId('baseball-icon')).toBeInTheDocument();
  });

  it('does not show a pre-draft league (trading requires active phase)', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 1,
          name: 'My League',
          sport: 'baseball',
          leaguePhase: 'pre-draft',
        },
      ],
    };
    renderPage();
    expect(
      screen.queryByRole('button', { name: /View trades for My League/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Trading is only available during the active season/i),
    ).toBeInTheDocument();
  });

  it('shows Active phase chip with week number for an active league', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 1,
          name: 'My League',
          sport: 'baseball',
          leaguePhase: 'active',
          currentWeekNumber: 7,
        },
      ],
    };
    renderPage();
    expect(screen.getByText('Week 7')).toBeInTheDocument();
  });

  it('does not show an offseason league (trading requires active phase)', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 1,
          name: 'My League',
          sport: 'baseball',
          leaguePhase: 'offseason',
        },
      ],
    };
    renderPage();
    expect(
      screen.queryByRole('button', { name: /View trades for My League/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Trading is only available during the active season/i),
    ).toBeInTheDocument();
  });

  it('does not show a live-draft league (pre-draft phase is filtered; trading requires active)', () => {
    mockUserLeagues = {
      userLeagues: [
        {
          id: 1,
          name: 'My League',
          sport: 'baseball',
          leaguePhase: 'pre-draft',
          draftStatus: 'in-progress',
        },
      ],
    };
    renderPage();
    expect(
      screen.queryByRole('button', { name: /View trades for My League/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Trading is only available during the active season/i),
    ).toBeInTheDocument();
  });

  // TC-003-P: premium variant — league cards must show sport icon and phase
  // color so users with many leagues across sports can scan the list.
  describe('premium variant — sport icon and phase color (TC-003-P)', () => {
    beforeEach(() => {
      mockIsPremium = true;
    });

    it('shows baseball sport icon for premium users', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'Baseball League',
            sport: 'baseball',
            leaguePhase: 'active',
          },
        ],
      };
      renderPage();
      expect(screen.getByTestId('baseball-icon')).toBeInTheDocument();
    });

    it('shows football sport icon for premium users', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 2,
            name: 'Football League',
            sport: 'football',
            leaguePhase: 'active',
          },
        ],
      };
      renderPage();
      expect(screen.getByTestId('football-icon')).toBeInTheDocument();
    });

    it('does not show a pre-draft league for premium users (active-phase filter applies to all users)', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'My League',
            sport: 'baseball',
            leaguePhase: 'pre-draft',
          },
        ],
      };
      renderPage();
      expect(
        screen.queryByRole('button', { name: /View trades for My League/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Trading is only available during the active season/i),
      ).toBeInTheDocument();
    });

    it('shows active phase chip with week number for premium users', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'My League',
            sport: 'baseball',
            leaguePhase: 'active',
            currentWeekNumber: 4,
          },
        ],
      };
      renderPage();
      expect(screen.getByText('Week 4')).toBeInTheDocument();
    });

    it('does not show an offseason league for premium users (active-phase filter applies to all users)', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'My League',
            sport: 'baseball',
            leaguePhase: 'offseason',
          },
        ],
      };
      renderPage();
      expect(
        screen.queryByRole('button', { name: /View trades for My League/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Trading is only available during the active season/i),
      ).toBeInTheDocument();
    });

    it('does not show a live-draft league for premium users (active-phase filter applies to all users)', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'My League',
            sport: 'football',
            leaguePhase: 'pre-draft',
            draftStatus: 'in-progress',
          },
        ],
      };
      renderPage();
      expect(
        screen.queryByRole('button', { name: /View trades for My League/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Trading is only available during the active season/i),
      ).toBeInTheDocument();
    });

    it('shows both baseball and football icons when user has mixed-sport leagues', () => {
      mockUserLeagues = {
        userLeagues: [
          {
            id: 1,
            name: 'Baseball League',
            sport: 'baseball',
            leaguePhase: 'active',
          },
          {
            id: 2,
            name: 'Football League',
            sport: 'football',
            leaguePhase: 'active',
          },
        ],
      };
      renderPage();
      expect(screen.getByTestId('baseball-icon')).toBeInTheDocument();
      expect(screen.getByTestId('football-icon')).toBeInTheDocument();
    });
  });
});

// ── Premium gating parity (LS-7516 — TC-019-P) ───────────────────────────────
// The web /trade-center page gates premium features at the PAGE level via
// TradeAnalyzerCard (which uses useIsPremium() independently). The per-league
// TradingCenter instance rendered by LeagueTradesView does NOT receive isPremium
// — premium status is not threaded through from the page to the component.
// This is intentional: TradingCenter can render its own PremiumTradeTools section
// independently using the caller-supplied isPremium prop, but this surface does
// not supply it.
describe('TradeCenterPage — premium gating parity (LS-7516 — TC-019-P)', () => {
  it('does not inject isPremium into TradingCenter even when the user is a premium subscriber', async () => {
    mockIsPremium = true;
    mockUserLeagues = {
      userLeagues: [{ id: 5, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };
    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /View trades for My League/i }),
    );

    await waitFor(() => {
      const el = screen.getByTestId('trading-center-5');
      // data-is-premium is empty string when isPremium prop is not provided
      expect(el.getAttribute('data-is-premium')).toBe('');
    });
  });

  it('does not inject isPremium into TradingCenter for free users either', async () => {
    mockIsPremium = false;
    mockUserLeagues = {
      userLeagues: [{ id: 5, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };
    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /View trades for My League/i }),
    );

    await waitFor(() => {
      const el = screen.getByTestId('trading-center-5');
      expect(el.getAttribute('data-is-premium')).toBe('');
    });
  });
});

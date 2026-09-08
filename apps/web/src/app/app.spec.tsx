import { act, render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import React from 'react';

import App from './app';
import { useFeatureValue } from '../context/GrowthBookProvider';
import * as analytics from '../utils/analytics';
import { prefetchHomePage } from '../utils/prefetchHomePage';

jest.mock('../utils/prefetchHomePage', () => ({
  prefetchHomePage: jest.fn(),
}));

// Mock all the components that might have complex dependencies
jest.mock('@legacy-sports/shared-components', () => {
  const actual = jest.requireActual('@legacy-sports/shared-components');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- spread of jest.requireActual result
  return {
    ...actual,
    Button: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <button {...props}>{children}</button>,
    H1: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <h1 {...props}>{children}</h1>,
    XStack: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
    YStack: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
    Paragraph: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <p {...props}>{children}</p>,
    Separator: () => <hr />,
    BaseballScreen: () => <div>Baseball Screen</div>,
    FootballScreen: () => <div>Football Screen</div>,
    useAuth: () => ({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      },
      logout: jest.fn(),
    }),
  };
});

// Mock subpath entry points — app.tsx now imports from feature-specific subpaths
jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
  XStack: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  YStack: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  Paragraph: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <p {...props}>{children}</p>,
  Separator: () => <hr />,
  UnifiedLoadingPanel: () => <div data-testid="unified-loading-panel" />,
}));

jest.mock('@legacy-sports/shared-components/sports', () => ({
  FootballScreen: () => <div>Football Screen</div>,
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    isImpersonating: false,
    user: {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
    },
    logout: jest.fn(),
  })),
  consumeBillingNotice: jest.fn(() => null),
}));

// Mock analytics identify hook (requires ApolloProvider not present in tests)
jest.mock('../hooks/useAnalyticsIdentify', () => ({
  useAnalyticsIdentify: () => undefined,
}));

// Default football_enabled = true so existing football route tests remain green.
// Tests that want to assert flag-off behavior should override useFeatureIsOn locally.
jest.mock('../context/GrowthBookProvider', () => ({
  useFeatureIsOn: jest.fn(() => true),
  useFeatureValue: jest.fn(() => null),
  GrowthBookProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  growthbook: {},
}));

// Mock the styled function to avoid Tamagui issues. Also stub XStack/Text —
// NavBar (LS-4652) imports those directly from 'tamagui' rather than
// through @legacy-sports/shared-components/ui (whose own XStack/YStack are
// stubbed the same way, below), so without these two this mock left them
// undefined and NavBar failed to render. (Loading the *real* tamagui via
// jest.requireActual from inside this factory was tried and rejected — its
// CJS build's internal circular `require('tamagui')` calls reenter this
// same mock factory before it finishes initializing, throwing on
// half-wired internals like `Anchor.cjs`'s `styleable`.)
jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  styled: (component: React.ComponentType<unknown>) => component,
  XStack: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  Text: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <span {...props}>{children}</span>,
}));

// Mock the layout components
jest.mock('../components/layout/UserProfileDropdown', () => ({
  UserProfileDropdown: () => <div>User Profile Dropdown</div>,
}));

jest.mock('../components/layout/SportsDropdown', () => ({
  SportsDropdown: () => <div>Sports Dropdown</div>,
}));

jest.mock('../components/layout/PlayersDropdown', () => ({
  PlayersDropdown: () => <div>Players Dropdown</div>,
}));

jest.mock('../components/layout/MyLeaguesDropdown', () => ({
  MyLeaguesDropdown: () => <div>My Leagues Dropdown</div>,
}));

jest.mock('../components/layout/NotificationDropdown', () => ({
  NotificationDropdown: () => <div>Notification Dropdown</div>,
}));

jest.mock('../components/a11y/GlobalAnnouncer', () => ({
  GlobalAnnouncer: () => <div>Global Announcer</div>,
}));

// Mock page components (default exports)
jest.mock('../pages/about/AboutPage', () => () => <div>About Page</div>);
jest.mock('../pages/pricing/PricingPage', () => () => <div>Pricing Page</div>);

jest.mock('../pages/management/ManagementPage', () => () => (
  <div>Management Page</div>
));

jest.mock('../pages/home/HomePage', () => () => <div>Home Page</div>);
jest.mock('../pages/analytics/AnalyticsPage', () => () => (
  <div>Analytics Page</div>
));

// Mock draft components
jest.mock('../components/EliteDraftBoard', () => ({
  EliteDraftBoardScreen: () => <div>Elite Draft Board Page</div>,
}));

// Mock baseball components
jest.mock('../pages/baseball/LeagueCreatePage', () => () => (
  <div>League Create Page</div>
));

jest.mock('../pages/baseball/LeagueDetailPage', () => () => (
  <div>League Detail Page</div>
));

jest.mock('../pages/baseball/TeamDetailPage', () => ({
  TeamDetailPage: () => <div>Team Detail Page</div>,
}));

jest.mock('../pages/baseball/JoinLeagueByCodePage', () => () => (
  <div>Join League By Code</div>
));

// Mock matchup components
jest.mock('../pages/matchup/MatchupDetailPage', () => ({
  MatchupDetailPage: () => <div>Matchup Detail Page</div>,
}));

// Mock baseball screen
jest.mock('../components/baseball', () => ({
  BaseballScreen: () => <div>Baseball Screen</div>,
}));

// Mock football hub page (used for /football route)
jest.mock('../pages/football/FootballHubPage', () => ({
  FootballHubPage: () => <div>Football Hub</div>,
}));

// Mock AdminRevenuePage — access control is now handled by the page itself (LS-5758).
// This mock mirrors the real page's auth branch so the AdminGuard routing tests remain meaningful.
jest.mock('../pages/admin/AdminRevenuePage', () => {
  function MockAdminRevenuePage() {
    const { useAuth } = jest.requireMock(
      '@legacy-sports/shared-components/auth',
    );
    const { user } = useAuth();
    if (user?.accessLevel !== 'admin') {
      return <div>Admin Access Required</div>;
    }
    return <div>Admin Revenue Page</div>;
  }
  return MockAdminRevenuePage;
});

jest.mock('../pages/admin/AdminAppDownloadsPage', () => {
  function MockAdminAppDownloadsPage() {
    const { useAuth } = jest.requireMock(
      '@legacy-sports/shared-components/auth',
    );
    const { user } = useAuth();
    if (user?.accessLevel !== 'admin') {
      return <div>Admin Access Required</div>;
    }
    return <div>Admin App Downloads Page</div>;
  }
  return MockAdminAppDownloadsPage;
});

// Mock hooks
jest.mock('../hooks/usePageTracking', () => ({
  usePageTracking: () => null,
}));

jest.mock('../hooks/useWebPushRegistration', () => ({
  useWebPushRegistration: () => null,
}));

// Mock ScoreboardTicker — it uses Apollo query hooks (for example, useGetScoreboardQuery), which require an ApolloProvider
jest.mock('../components/scoreboard/ScoreboardTicker', () => ({
  ScoreboardTicker: () => null,
}));

// Mock useIsPremiumStatus — PremiumGuard calls this; the hook uses Apollo and
// requires an ApolloProvider that is not present in these unit tests.
jest.mock('../hooks/useIsPremium', () => ({
  useIsPremium: jest.fn(() => true),
  useIsPremiumStatus: jest.fn(() => ({ isPremium: true, isLoading: false })),
}));

// Mock new nav components that use Apollo query hooks (require an ApolloProvider)
jest.mock('../components/layout/LeagueSwitcherChip', () => ({
  LeagueSwitcherChip: () => <div>League Switcher</div>,
}));

jest.mock('../components/layout/HelpMenuButton', () => ({
  HelpMenuButton: () => <button>Help</button>,
}));

jest.mock('../components/layout/MobileBottomBar', () => ({
  MobileBottomBar: () => null,
}));

jest.mock('../components/layout/MobileNavDrawer', () => ({
  MobileNavDrawer: () => null,
}));

describe('App', () => {
  beforeEach(() => {
    // Clear any timers between tests
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should render successfully', () => {
    const { baseElement } = render(
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </BrowserRouter>,
    );
    expect(baseElement).toBeTruthy();
  });

  it('should show authenticated app content immediately', () => {
    const { container } = render(
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </BrowserRouter>,
    );

    // Since we now show authenticated content immediately, check for the app content
    const appContent = container.querySelector('div');
    expect(appContent).toBeTruthy();
    expect(
      container.querySelector('img[alt="Legacy Sports"]'),
    ).toBeInTheDocument();
  });

  it('should render homepage with authenticated content', () => {
    const { container } = render(
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </BrowserRouter>,
    );

    // Since we now show authenticated content immediately, no need to advance timers
    // Check for the main app content container
    const appContainer = container.querySelector('div');
    expect(appContainer).toBeTruthy();
    expect(container).toHaveTextContent('Home Page');
  });

  describe('Homepage Snapshot', () => {
    it('should match homepage snapshot', () => {
      const { container } = render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>,
      );

      // Fast-forward time to complete loading and show the homepage
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Take snapshot of the entire rendered component
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match homepage content snapshot', () => {
      const { container } = render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Take snapshot of the home content area
      const homeContent = container.querySelector('main');
      expect(homeContent).toMatchSnapshot();
    });
  });

  describe('Navigation', () => {
    it('should render navigation with correct links', () => {
      const { container } = render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Navigation landmark should always be in the DOM for accessibility
      const nav = container.querySelector('nav');
      expect(nav).toBeInTheDocument();
      expect(nav).toMatchSnapshot();
    });

    it('should match navigation snapshot', () => {
      const { container } = render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Find the navigation element
      const navigation = container.querySelector('nav');
      expect(navigation).toMatchSnapshot();
    });
  });

  describe('Home page prefetch (LS-9350)', () => {
    const prefetchHomePageMock = prefetchHomePage as jest.Mock;

    afterEach(() => {
      prefetchHomePageMock.mockClear();
    });

    it('prefetches the Home chunk when landing on a non-home route', async () => {
      render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      await act(() => Promise.resolve());

      expect(prefetchHomePageMock).toHaveBeenCalledTimes(1);
    });

    it('does not prefetch when already on the home route', async () => {
      render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/']}
        >
          <App />
        </MemoryRouter>,
      );

      await act(() => Promise.resolve());

      expect(prefetchHomePageMock).not.toHaveBeenCalled();
    });

    it('does not prefetch under an automated browser (navigator.webdriver), even on a non-home route', async () => {
      const originalWebdriver = navigator.webdriver;
      Object.defineProperty(navigator, 'webdriver', {
        value: true,
        configurable: true,
      });

      try {
        render(
          <MemoryRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            initialEntries={['/football']}
          >
            <App />
          </MemoryRouter>,
        );

        await act(() => Promise.resolve());

        expect(prefetchHomePageMock).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(navigator, 'webdriver', {
          value: originalWebdriver,
          configurable: true,
        });
      }
    });
  });

  describe('AdminGuard', () => {
    let useAuthMock: jest.Mock;

    beforeEach(() => {
      useAuthMock = (
        jest.requireMock(
          '@legacy-sports/shared-components/auth',
        ) as unknown as {
          useAuth: jest.Mock;
        }
      ).useAuth;
    });

    afterEach(() => {
      // Restore default non-admin mock so other test suites are unaffected
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        isImpersonating: false,
        user: {
          id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com',
        },
        logout: jest.fn(),
      });
    });

    it('redirects non-admin user from /admin to /', () => {
      // Default mock has no accessLevel — AdminGuard redirects to /
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin']}
        >
          <App />
        </MemoryRouter>,
      );
      expect(container).toHaveTextContent('Home Page');
    });

    it('allows admin user to access /admin without redirecting to home', () => {
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        isImpersonating: false,
        user: {
          id: 'admin-user-id',
          username: 'adminuser',
          email: 'admin@example.com',
          accessLevel: 'admin',
        },
        logout: jest.fn(),
      });

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin']}
        >
          <App />
        </MemoryRouter>,
      );
      // Guard passes — not redirected to home
      expect(container).not.toHaveTextContent('Home Page');
    });

    it('renders nothing while auth is loading — does not redirect', () => {
      useAuthMock.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        isImpersonating: false,
        user: undefined,
        logout: jest.fn(),
      });

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin']}
        >
          <App />
        </MemoryRouter>,
      );
      // isLoading → AdminGuard returns null (no Navigate) — not redirected to home
      expect(container).not.toHaveTextContent('Home Page');
    });

    it('shows access-restricted state for non-admin user at /admin/revenue (not redirected to home)', async () => {
      // Access control moved to page level (LS-5758): non-admin sees inline denied state instead of redirect
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin/revenue']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());
      expect(container).not.toHaveTextContent('Home Page');
      expect(container).toHaveTextContent('Admin Access Required');
    });

    it('allows admin user to access /admin/revenue without redirecting to home', async () => {
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        isImpersonating: false,
        user: {
          id: 'admin-user-id',
          username: 'adminuser',
          email: 'admin@example.com',
          accessLevel: 'admin',
        },
        logout: jest.fn(),
      });

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin/revenue']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());
      // Page-level access check passes — renders revenue page, not redirected to home
      expect(container).not.toHaveTextContent('Home Page');
    });

    it('shows access-restricted state for non-admin user at /admin/app-downloads (not redirected to home)', async () => {
      // Gated at page level rather than by AdminGuard (LS-9456), mirroring
      // /admin/revenue: a non-admin gets an explanation, not a bounce home.
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin/app-downloads']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());
      expect(container).not.toHaveTextContent('Home Page');
      expect(container).toHaveTextContent('Admin Access Required');
    });

    it('allows admin user to access /admin/app-downloads', async () => {
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        isImpersonating: false,
        user: {
          id: 'admin-user-id',
          username: 'adminuser',
          email: 'admin@example.com',
          accessLevel: 'admin',
        },
        logout: jest.fn(),
      });

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/admin/app-downloads']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());
      expect(container).toHaveTextContent('Admin App Downloads Page');
    });
  });

  describe('League analytics route', () => {
    let useIsPremiumStatusMock: jest.Mock;

    beforeEach(() => {
      useIsPremiumStatusMock = jest.requireMock(
        '../hooks/useIsPremium',
      ).useIsPremiumStatus;
    });

    afterEach(() => {
      useIsPremiumStatusMock.mockReturnValue({
        isPremium: true,
        isLoading: false,
      });
    });

    it('renders the analytics page at /leagues/:leagueId/analytics for premium users', async () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/leagues/42/analytics']}
        >
          <App />
        </MemoryRouter>,
      );

      await act(() => Promise.resolve());

      expect(container).toHaveTextContent('Analytics Page');
    });

    it('redirects free-tier users away from /leagues/:leagueId/analytics', async () => {
      useIsPremiumStatusMock.mockReturnValue({
        isPremium: false,
        isLoading: false,
      });

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/leagues/42/analytics']}
        >
          <App />
        </MemoryRouter>,
      );

      await act(() => Promise.resolve());

      // PremiumGuard redirects to /pricing — analytics page must not render
      expect(container).not.toHaveTextContent('Analytics Page');
    });
  });

  describe('Auth entry-point redirects (LS-6690)', () => {
    // An already-authenticated user who reaches /login or /signup passes the
    // EnhancedAuthGuard and lands in App; these routes must bounce them to home
    // rather than letting them sit on a non-matching (blank) route or see the
    // sign-up flow. The default useAuth mock has isAuthenticated: true.
    it('redirects an authenticated user from /signup to home', async () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/signup']}
        >
          <App />
        </MemoryRouter>,
      );
      // Flush the lazy-loaded HomePage chunk (React.lazy + Suspense).
      await act(() => Promise.resolve());
      expect(container).toHaveTextContent('Home Page');
    });

    it('redirects an authenticated user from /login to home', async () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/login']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());
      expect(container).toHaveTextContent('Home Page');
    });
  });

  describe('FootballHubPage', () => {
    it('should render football hub when navigating to /football', async () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Flush React.lazy's Promise (timers don't help; microtask flush does)
      await act(() => Promise.resolve());

      // Verify football hub content is rendered
      expect(container).toHaveTextContent('Football Hub');
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
    });

    it('should display correct football content', () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Since we now show authenticated content immediately, no need to advance timers
      // Verify football content is present and matches expected structure
      expect(container).toHaveTextContent('Football Hub');
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();

      // Verify navigation is present
      const homeLink = container.querySelector('[href="/"]');
      expect(homeLink).toBeInTheDocument();
      // League switcher chip should be present in the nav
      expect(container).toHaveTextContent('League Switcher');
    });

    it('should match football hub snapshot', () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const footballContent = container.querySelector('main');
      expect(footballContent).toMatchSnapshot();
    });

    it('should render football hub with navigation and layout', () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Since user is now authenticated by default, should show navigation and content
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
      expect(container).toHaveTextContent('Football Hub');

      // Should show navigation links
      const homeLink = container.querySelector('[href="/"]');
      expect(homeLink).toBeInTheDocument();
      // League switcher chip should be present in the nav
      expect(container).toHaveTextContent('League Switcher');

      // Should show authenticated content instead of OAuth login
      expect(container).toHaveTextContent('User Profile Dropdown');
    });

    it('should show authenticated content immediately when navigating to football', () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Should show authenticated content immediately instead of loading
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
      expect(container).toHaveTextContent('Football Hub');
    });

    it('should match complete football page layout snapshot', () => {
      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Take snapshot of the entire page layout
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('FootballGate', () => {
    const mockUseFeatureValue = useFeatureValue as jest.Mock;

    afterEach(() => {
      // Restore the file-level default (loading/unconfigured GrowthBook).
      mockUseFeatureValue.mockReturnValue(null);
    });

    it('redirects to / and fires trackFeatureGateBlocked when football_enabled is explicitly false', async () => {
      mockUseFeatureValue.mockReturnValue(false);
      const trackSpy = jest
        .spyOn(analytics, 'trackFeatureGateBlocked')
        .mockImplementation(() => undefined);

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());

      expect(container).not.toHaveTextContent('Football Hub');
      expect(container).toHaveTextContent('Home Page');
      expect(trackSpy).toHaveBeenCalledTimes(1);
      expect(trackSpy).toHaveBeenCalledWith('football_enabled');

      trackSpy.mockRestore();
    });

    it('renders the football hub and does not track a redirect when football_enabled is true', async () => {
      mockUseFeatureValue.mockReturnValue(true);
      const trackSpy = jest
        .spyOn(analytics, 'trackFeatureGateBlocked')
        .mockImplementation(() => undefined);

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());

      expect(container).toHaveTextContent('Football Hub');
      expect(trackSpy).not.toHaveBeenCalled();

      trackSpy.mockRestore();
    });

    it('renders the football hub and does not track a redirect while GrowthBook is loading/unconfigured (null)', async () => {
      mockUseFeatureValue.mockReturnValue(null);
      const trackSpy = jest
        .spyOn(analytics, 'trackFeatureGateBlocked')
        .mockImplementation(() => undefined);

      const { container } = render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/football']}
        >
          <App />
        </MemoryRouter>,
      );
      await act(() => Promise.resolve());

      expect(container).toHaveTextContent('Football Hub');
      expect(trackSpy).not.toHaveBeenCalled();

      trackSpy.mockRestore();
    });
  });
});

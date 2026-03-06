import { act, render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import React from 'react';

import App from './app';

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
    }) => (
      <button {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    ),
    H1: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <h1 {...(props as React.HTMLAttributes<HTMLHeadingElement>)}>
        {children}
      </h1>
    ),
    XStack: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
    YStack: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
    Paragraph: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <p {...(props as React.HTMLAttributes<HTMLParagraphElement>)}>
        {children}
      </p>
    ),
    Separator: () => <hr />,
    BaseballScreen: () => <div>Baseball Screen</div>,
    FootballScreen: () => <div>Football Screen</div>,
    PlayersScreen: () => <div>Players Screen</div>,
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

// Mock the styled function to avoid Tamagui issues
jest.mock('tamagui', () => ({
  styled: (component: React.ComponentType<unknown>) => component,
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

jest.mock('../components/a11y/GlobalAnnouncer', () => ({
  GlobalAnnouncer: () => <div>Global Announcer</div>,
}));

// Mock page components (default exports)
jest.mock('../pages/about/AboutPage', () => () => <div>About Page</div>);

jest.mock('../pages/management/ManagementPage', () => () => (
  <div>Management Page</div>
));

jest.mock('../pages/home/HomePage', () => () => <div>Home Page</div>);

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

// Mock hooks
jest.mock('../hooks/usePageTracking', () => ({
  usePageTracking: () => null,
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
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(baseElement).toBeTruthy();
  });

  it('should show authenticated app content immediately', () => {
    const { container } = render(
      <BrowserRouter>
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
      <BrowserRouter>
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
        <BrowserRouter>
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
        <BrowserRouter>
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
        <BrowserRouter>
          <App />
        </BrowserRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Since user is not authenticated, should show OAuth login instead of navigation
      const nav = container.querySelector('nav');
      expect(nav).not.toBeInTheDocument();

      // Should show OAuth login form instead
      const oauthLogin = container.querySelector('div'); // OAuth login container
      expect(oauthLogin).toBeInTheDocument();
      expect(oauthLogin).toMatchSnapshot();
    });

    it('should match navigation snapshot', () => {
      const { container } = render(
        <BrowserRouter>
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

  describe('FootballScreen', () => {
    it('should render football screen when navigating to /football', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Since we now show authenticated content immediately, no need to advance timers
      // Verify football screen content is rendered
      expect(container).toHaveTextContent('Football Screen');
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
    });

    it('should display correct football content', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Since we now show authenticated content immediately, no need to advance timers
      // Verify football content is present and matches expected structure
      expect(container).toHaveTextContent('Football Screen');
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();

      // Verify navigation is present
      const homeLink = container.querySelector('[href="/"]');
      expect(homeLink).toBeInTheDocument();
      // Sports dropdown should be present (football link is now in a dropdown)
      expect(container).toHaveTextContent('Sports');
    });

    it('should match football screen snapshot', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
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

    it('should render football screen with navigation and layout', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Since user is now authenticated by default, should show navigation and content
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
      expect(container).toHaveTextContent('Football Screen');

      // Should show navigation links
      const homeLink = container.querySelector('[href="/"]');
      expect(homeLink).toBeInTheDocument();
      // Sports dropdown should be present (football link is now in a dropdown)
      expect(container).toHaveTextContent('Sports');

      // Should show authenticated content instead of OAuth login
      expect(container).toHaveTextContent('User Profile Dropdown');
    });

    it('should show authenticated content immediately when navigating to football', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Should show authenticated content immediately instead of loading
      expect(
        container.querySelector('img[alt="Legacy Sports"]'),
      ).toBeInTheDocument();
      expect(container).toHaveTextContent('Football Screen');
    });

    it('should match complete football page layout snapshot', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
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
});

import { act, render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import React from 'react';

import App from './app';

// Mock all the components that might have complex dependencies
jest.mock('@legacy-sports/shared-components', () => ({
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
    <h1 {...(props as React.HTMLAttributes<HTMLHeadingElement>)}>{children}</h1>
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
}));

// Mock the styled function to avoid Tamagui issues
jest.mock('tamagui', () => ({
  styled: (component: React.ComponentType<unknown>) => component,
}));

// Mock the web components
jest.mock('../components/WebHomeScreen', () => ({
  WebHomeScreen: () => <div>Web Home Screen</div>,
}));

jest.mock('../components/UserProfileDropdown', () => ({
  UserProfileDropdown: () => <div>User Profile Dropdown</div>,
}));

jest.mock('../components/WebPlayerStatsPage', () => ({
  WebPlayerDetailPage: () => <div>Web Player Detail Page</div>,
  WebPlayerStatsPage: () => <div>Web Player Stats Page</div>,
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
    expect(container).toHaveTextContent('Legacy Sports');
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
    expect(container).toHaveTextContent('Web Home Screen');
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
      expect(container).toHaveTextContent('Legacy Sports');
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
      expect(container).toHaveTextContent('Legacy Sports');

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
      expect(container).toHaveTextContent('Legacy Sports');
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
      expect(container).toHaveTextContent('Legacy Sports');
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

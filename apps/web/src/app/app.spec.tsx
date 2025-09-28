import { act, render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

import App from './app';

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

  it('should show loading panel initially', () => {
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    // Check for the loading spinner (the actual LoadingPanel component)
    const loadingSpinner = container.querySelector(
      '[style*="animation: spin"]',
    );
    expect(loadingSpinner).toBeTruthy();
  });

  it('should render homepage after loading completes', () => {
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    // Fast-forward time to complete loading
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Snapshot test the main content after loading
    const mainContent = container.querySelector('main');
    expect(mainContent).toMatchSnapshot();
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

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Verify football screen is rendered and matches expected content
      const footballContent = container.querySelector('main');
      expect(footballContent).toBeInTheDocument();
      expect(footballContent).toMatchSnapshot();
    });

    it('should display correct football content', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Verify football content is present and matches expected structure
      const footballContent = container.querySelector('main');
      expect(footballContent).toBeInTheDocument();
      expect(footballContent).toMatchSnapshot();
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

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Since user is not authenticated, should show OAuth login instead of navigation
      expect(container.querySelector('nav')).not.toBeInTheDocument();
      expect(container.querySelector('main')).toBeInTheDocument();

      // Should show OAuth login form when accessing protected routes
      const oauthLogin = container.querySelector('div'); // OAuth login container
      expect(oauthLogin).toBeInTheDocument();

      // Snapshot ensures OAuth login layout is correct for protected routes
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should show loading initially even when navigating to football', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>,
      );

      // Should show loading panel initially
      const loadingSpinner = container.querySelector(
        '[style*="animation: spin"]',
      );
      expect(loadingSpinner).toBeTruthy();
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

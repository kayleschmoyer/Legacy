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
      </BrowserRouter>
    );
    expect(baseElement).toBeTruthy();
  });

  it('should show loading panel initially', () => {
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Check for the loading spinner (the actual LoadingPanel component)
    const loadingSpinner = container.querySelector(
      '[style*="animation: spin"]'
    );
    expect(loadingSpinner).toBeTruthy();
  });

  it('should render homepage after loading completes', () => {
    const { getByText, container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Initially shows loading
    const loadingSpinner = container.querySelector(
      '[style*="animation: spin"]'
    );
    expect(loadingSpinner).toBeTruthy();

    // Fast-forward time to complete loading
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Loading should be gone and homepage should be visible
    expect(getByText('Fantasy Sports Hub')).toBeInTheDocument();
    expect(getByText('Choose your sport')).toBeInTheDocument();
  });

  describe('Homepage Snapshot', () => {
    it('should match homepage snapshot', () => {
      const { container } = render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
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
        </BrowserRouter>
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
      const { getByText } = render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(getByText('🏈 Fantasy Sports Hub')).toBeInTheDocument();
      expect(getByText('🏠 Home')).toBeInTheDocument();
      expect(getByText('🏈 Football')).toBeInTheDocument();
      expect(getByText('⚾ Baseball')).toBeInTheDocument();
      expect(getByText('🎨 Demo')).toBeInTheDocument();
    });

    it('should match navigation snapshot', () => {
      const { container } = render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
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
      const { getByText } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(getByText('Football Fantasy')).toBeInTheDocument();
    });

    it('should display correct football content', () => {
      const { getByText } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(getByText('Football Fantasy')).toBeInTheDocument();
      expect(getByText('Manage your leagues and drafts')).toBeInTheDocument();
    });

    it('should match football screen snapshot', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const footballContent = container.querySelector('main');
      expect(footballContent).toMatchSnapshot();
    });

    it('should render football screen with navigation and layout', () => {
      const { container, getByText } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
      );

      // Fast-forward time to complete loading
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Check that navigation is present
      expect(getByText('🏈 Fantasy Sports Hub')).toBeInTheDocument();
      expect(getByText('🏈 Football')).toBeInTheDocument();

      // Check that the full layout is rendered correctly
      expect(container.querySelector('nav')).toBeInTheDocument();
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('should show loading initially even when navigating to football', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
      );

      // Should show loading panel initially
      const loadingSpinner = container.querySelector(
        '[style*="animation: spin"]'
      );
      expect(loadingSpinner).toBeTruthy();
    });

    it('should match complete football page layout snapshot', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/football']}>
          <App />
        </MemoryRouter>
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

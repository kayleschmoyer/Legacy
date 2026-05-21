import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { View } from 'react-native';

// ── Components under test ─────────────────────────────────────────────────────
import { ErrorBoundary } from '@legacy-sports/shared-components';
import TradeCenterPage from './TradeCenterPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseAuthorizedUserInfo = jest.fn();
const mockUseGetUserLeaguesQuery = jest.fn();
const mockUseGetUserTeamIdQuery = jest.fn();
const mockRefetchLeagues = jest.fn();
const mockRefetchTeam = jest.fn();

const mockLeague = {
  id: 1,
  name: 'Test League',
  owner: 99,
  leaguePhase: 'regular',
};

// Replace TouchableOpacity with Pressable to avoid RN animation/renderer
// version-mismatch errors when pressing the ErrorBoundary "Try Again" button.
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return new Proxy(RN, {
    get(target, prop: string) {
      if (prop === 'TouchableOpacity') {
        return ({
          children,
          onPress,
        }: {
          children?: React.ReactNode;
          onPress?: () => void;
        }) => React.createElement(target.Pressable, { onPress }, children);
      }
      return Reflect.get(target, prop) as unknown;
    },
  });
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@tamagui/lucide-icons', () => {
  const { View: RNView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ArrowLeftRight: () =>
      React.createElement(RNView, { testID: 'icon-arrowleftright' }),
    ChevronLeft: () =>
      React.createElement(RNView, { testID: 'icon-chevronleft' }),
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  // Load ErrorBoundary from its specific file to avoid the full barrel export,
  // which transitively imports @react-native-google-signin (ESM, not transpiled).
  const { ErrorBoundary: RealErrorBoundary } = jest.requireActual<
    typeof import('../../../../../lib/shared-components/src/components/ErrorBoundary')
  >('../../../../../lib/shared-components/src/components/ErrorBoundary');
  const { View: RNView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ErrorBoundary: RealErrorBoundary,
    TradingCenter: ({
      leagueId,
      userTeamId,
    }: {
      leagueId: number;
      userTeamId: number;
      isCommissioner: boolean;
    }) =>
      React.createElement(RNView, {
        testID: `trading-center-${leagueId}-${userTeamId}`,
      }),
  };
});

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: (...args: unknown[]): unknown =>
    mockUseGetUserLeaguesQuery(...args),
  useGetUserTeamIdQuery: (...args: unknown[]): unknown =>
    mockUseGetUserTeamIdQuery(...args),
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: (...args: unknown[]): unknown =>
    mockUseAuthorizedUserInfo(...args),
}));

jest.mock('tamagui', () => {
  const {
    View: RNView,
    Text,
    Pressable,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID, onPress }, children),
    Card: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return React.createElement(Pressable, { testID, onPress }, children);
      }
      return React.createElement(RNView, { testID }, children);
    },
    Spinner: ({ testID }: { testID?: string; [key: string]: unknown }) =>
      React.createElement(RNView, { testID: testID ?? 'spinner' }),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID }, children),
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(RNView, { testID }, children),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(RNView, { testID }, children),
  };
});

// ── Helper: throw controller (external state so Strict Mode double-invocations
//    both see the same value — not mutated by the throw itself) ─────────────────

const throwCtrl = { active: false };

function ControlledThrowingComponent(): React.JSX.Element {
  if (throwCtrl.active) {
    throw new Error('Simulated render error');
  }
  return React.createElement(View, { testID: 'safe-child' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App resilience tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    throwCtrl.active = false;
    mockRefetchLeagues.mockResolvedValue({});
    mockRefetchTeam.mockResolvedValue({});
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, isAdmin: false });
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [mockLeague] },
      loading: false,
      error: null,
      refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
    });
    mockUseGetUserTeamIdQuery.mockReturnValue({
      data: { userTeamId: 5 },
      loading: false,
      error: null,
      refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
    });
    // Suppress React error boundary console noise
    jest.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ErrorBoundary integration', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <View testID="child" />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('child')).toBeTruthy();
    });

    it('shows default error UI when a child component throws', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();
    });

    it('shows a Try Again button in the default error UI', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Try Again')).toBeTruthy();
    });

    it('clears the error and re-renders children when Try Again is pressed', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      // Error UI is showing
      expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();

      // Disable throws so children recover after the boundary resets
      throwCtrl.active = false;
      fireEvent.press(screen.getByText('Try Again'));
      expect(screen.getByTestId('safe-child')).toBeTruthy();
    });

    it('renders a custom fallback instead of the default UI when provided', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary fallback={<View testID="custom-fallback" />}>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('custom-fallback')).toBeTruthy();
      expect(screen.queryByText('Oops! Something went wrong')).toBeNull();
    });

    it('calls the onError callback when a child throws', () => {
      const onError = jest.fn();
      throwCtrl.active = true;
      render(
        <ErrorBoundary onError={onError}>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String) as unknown,
        }),
      );
    });
  });

  describe('rapid interaction resilience', () => {
    it('handles rapid Retry presses on a leagues query error without crashing', async () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });

      render(<TradeCenterPage />);
      const retryButton = screen.getByText('Retry');

      // Rapidly press Retry 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.press(retryButton);
      }

      await waitFor(
        () => {
          expect(mockRefetchLeagues).toHaveBeenCalledTimes(10);
        },
        { timeout: 15000 },
      );
    }, 20000);

    it('handles rapid Retry presses on a team query error without crashing', async () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Team fetch failed'),
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });

      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      const retryButton = screen.getByText('Retry');

      for (let i = 0; i < 10; i++) {
        fireEvent.press(retryButton);
      }

      await waitFor(
        () => {
          expect(mockRefetchTeam).toHaveBeenCalledTimes(10);
        },
        { timeout: 15000 },
      );
    }, 20000);

    it('handles rapid league selection and back navigation without crashing', () => {
      const leagues = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `League ${i + 1}`,
        owner: 99,
        leaguePhase: 'regular',
      }));
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: leagues },
        loading: false,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });

      render(<TradeCenterPage />);

      // Rapidly select multiple leagues and go back between each selection
      fireEvent.press(screen.getByText('League 1'));
      expect(screen.getByTestId('trading-center-1-5')).toBeTruthy();

      // Press the back button (rendered as the league name label)
      fireEvent.press(screen.getAllByText('League 1')[0]);
      expect(screen.getByText('League 2')).toBeTruthy();

      fireEvent.press(screen.getByText('League 2'));
      expect(screen.getByTestId('trading-center-2-5')).toBeTruthy();

      fireEvent.press(screen.getAllByText('League 2')[0]);
      expect(screen.getByText('League 3')).toBeTruthy();
    });
  });

  describe('component remount state isolation', () => {
    it('shows the league list (not TradingCenter) on a fresh mount', () => {
      const { unmount } = render(<TradeCenterPage />);

      // Select a league to drive state into "selected" mode
      fireEvent.press(screen.getByText('Test League'));
      expect(screen.getByTestId('trading-center-1-5')).toBeTruthy();

      // Unmount
      unmount();

      // Re-mount — state should be fresh (league list shown, no TradingCenter)
      render(<TradeCenterPage />);
      expect(screen.getByText('Trade Center')).toBeTruthy();
      expect(screen.queryByTestId('trading-center-1-5')).toBeNull();
    });

    it('shows the spinner independently on each fresh mount', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });

      const { unmount } = render(<TradeCenterPage />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
      unmount();

      render(<TradeCenterPage />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('error recovery cycle', () => {
    it('transitions from error state to success state after leagues refetch succeeds', () => {
      // Start in error state
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });

      const { rerender } = render(<TradeCenterPage />);
      expect(
        screen.getByText('Failed to load leagues. Please try again.'),
      ).toBeTruthy();

      // Simulate successful refetch: update mock and re-render
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [mockLeague] },
        loading: false,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });

      rerender(<TradeCenterPage />);

      expect(
        screen.queryByText('Failed to load leagues. Please try again.'),
      ).toBeNull();
      expect(screen.getByText('Test League')).toBeTruthy();
    });

    it('transitions from team error to TradingCenter after team refetch succeeds', () => {
      // Start with leagues loaded but team query failing
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Team fetch failed'),
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });

      const { rerender } = render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(
        screen.getByText('Failed to load league data. Please try again.'),
      ).toBeTruthy();

      // Simulate successful team fetch
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: { userTeamId: 5 },
        loading: false,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });

      rerender(<TradeCenterPage />);

      expect(
        screen.queryByText('Failed to load league data. Please try again.'),
      ).toBeNull();
      expect(screen.getByTestId('trading-center-1-5')).toBeTruthy();
    });

    it('handles repeated error and success cycles without crashing', () => {
      const { rerender } = render(<TradeCenterPage />);

      for (let cycle = 0; cycle < 3; cycle++) {
        // Error state
        mockUseGetUserLeaguesQuery.mockReturnValue({
          data: undefined,
          loading: false,
          error: new Error(`Cycle ${cycle} error`),
          refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
        });
        rerender(<TradeCenterPage />);
        expect(
          screen.getByText('Failed to load leagues. Please try again.'),
        ).toBeTruthy();

        // Success state
        mockUseGetUserLeaguesQuery.mockReturnValue({
          data: { userLeagues: [mockLeague] },
          loading: false,
          error: null,
          refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
        });
        rerender(<TradeCenterPage />);
        expect(screen.getByText('Test League')).toBeTruthy();
      }
    });
  });
});

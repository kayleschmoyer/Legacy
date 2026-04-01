import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
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

jest.mock('@tamagui/lucide-icons', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ArrowLeftRight: () =>
      React.createElement(View, { testID: 'icon-arrowleftright' }),
    ChevronLeft: () =>
      React.createElement(View, { testID: 'icon-chevronleft' }),
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    TradingCenter: ({
      leagueId,
      userTeamId,
    }: {
      leagueId: number;
      userTeamId: number;
      isCommissioner: boolean;
    }) =>
      React.createElement(View, {
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
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
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
      return React.createElement(View, { testID }, children);
    },
    Spinner: ({ testID }: { testID?: string; [key: string]: unknown }) =>
      React.createElement(View, { testID: testID ?? 'spinner' }),
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
    }) => React.createElement(View, { testID }, children),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(View, { testID }, children),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TradeCenterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  describe('league list', () => {
    it('renders the Trade Center heading', () => {
      render(<TradeCenterPage />);
      expect(screen.getByText('Trade Center')).toBeTruthy();
    });

    it('renders the "select a league" subtitle', () => {
      render(<TradeCenterPage />);
      expect(
        screen.getByText('Select a league to manage trades.'),
      ).toBeTruthy();
    });

    it('shows a spinner while leagues are loading', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });
      render(<TradeCenterPage />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows an error message when the leagues query fails', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });
      render(<TradeCenterPage />);
      expect(
        screen.getByText('Failed to load leagues. Please try again.'),
      ).toBeTruthy();
    });

    it('renders a Retry button when the leagues query fails', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });
      render(<TradeCenterPage />);
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('calls refetch when the Retry button is pressed', async () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Retry'));
      await waitFor(() => {
        expect(mockRefetchLeagues).toHaveBeenCalled();
      });
    });

    it('shows an empty state when there are no leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchLeagues(...args),
      });
      render(<TradeCenterPage />);
      expect(screen.getByText('No leagues found.')).toBeTruthy();
    });

    it('renders a card for each league', () => {
      render(<TradeCenterPage />);
      expect(screen.getByText('Test League')).toBeTruthy();
    });

    it('shows the league phase when available', () => {
      render(<TradeCenterPage />);
      expect(screen.getByText('regular')).toBeTruthy();
    });
  });

  describe('league selection', () => {
    it('renders TradingCenter after selecting a league', () => {
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(screen.getByTestId('trading-center-1-5')).toBeTruthy();
    });

    it('shows the league name as the back button label after selecting a league', () => {
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      // Verify league selection happened — TradingCenter is now rendered
      expect(screen.getByTestId('trading-center-1-5')).toBeTruthy();
      // Back button label is the league name
      expect(screen.getAllByText('Test League').length).toBeGreaterThanOrEqual(
        1,
      );
    });
  });

  describe('LeagueTradingCenter loading states', () => {
    it('shows a spinner while team data is loading', () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows an error message when the team query fails', () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Team fetch failed'),
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(
        screen.getByText('Failed to load league data. Please try again.'),
      ).toBeTruthy();
    });

    it('renders a Retry button when the team query fails', () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Team fetch failed'),
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('calls refetchTeam when the Retry button is pressed', () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Team fetch failed'),
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      fireEvent.press(screen.getByText('Retry'));
      expect(mockRefetchTeam).toHaveBeenCalled();
    });

    it('shows a no-team message when the user has no team in the league', () => {
      mockUseGetUserTeamIdQuery.mockReturnValue({
        data: { userTeamId: null },
        loading: false,
        error: null,
        refetch: (...args: unknown[]): unknown => mockRefetchTeam(...args),
      });
      render(<TradeCenterPage />);
      fireEvent.press(screen.getByText('Test League'));
      expect(
        screen.getByText("You don't have a team in this league."),
      ).toBeTruthy();
    });
  });
});

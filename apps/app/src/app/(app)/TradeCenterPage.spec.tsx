import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import TradeCenterPage from './TradeCenterPage';

// ── Configurable mock state ──────────────────────────────────────────────────
let mockUserLeagues: unknown;
let mockLeaguesLoading = false;
let mockUserTeamId: number | null;
let mockLeague: unknown;
let capturedNativeProps: Record<string, unknown> | null = null;

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, email: 'test@example.com' }),
}));

jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue('mock-token'),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: () => ({
    data: mockUserLeagues,
    loading: mockLeaguesLoading,
    error: undefined,
    refetch: jest.fn(),
  }),
  useGetUserTeamIdQuery: () => ({
    data: { userTeamId: mockUserTeamId },
    loading: false,
  }),
  useGetLeagueByIdQuery: () => ({ data: mockLeague, loading: false }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TradingCenter: (props: { leagueId: number; [key: string]: unknown }) => {
      capturedNativeProps = props;
      return <View testID={`trading-center-${props.leagueId}`} />;
    },
    useWebSocket: jest.fn().mockReturnValue({ connected: false }),
  };
});

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { websocketUrl: 'wss://example.com' },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Card: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Pressable onPress={onPress} {...(rest as object)}>
        {children}
      </Pressable>
    ),
    Spinner: () => <View testID="spinner" />,
    Text: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Text onPress={onPress} {...(rest as object)}>
        {children}
      </Text>
    ),
    XStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeftRight: () => null,
  ChevronLeft: () => null,
  RefreshCw: () => null,
  Users: () => null,
}));

jest.mock('./_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUserLeagues = undefined;
  mockLeaguesLoading = false;
  mockUserTeamId = null;
  mockLeague = undefined;
  capturedNativeProps = null;
});

describe('TradeCenterPage', () => {
  it('renders without crashing', () => {
    render(<TradeCenterPage />);
  });

  it('renders the Trade Center heading', () => {
    render(<TradeCenterPage />);
    expect(screen.getByText(/Trade Center/i)).toBeTruthy();
  });

  it('renders the league selection prompt', () => {
    render(<TradeCenterPage />);
    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('does not show a spinner when stale league data exists during a background refetch', () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'Alpha League' }] };
    mockLeaguesLoading = true;
    render(<TradeCenterPage />);
    expect(screen.queryByTestId('spinner')).toBeNull();
    expect(screen.getByLabelText('View trades for Alpha League')).toBeTruthy();
  });

  it('renders an empty state when no leagues are returned', () => {
    mockUserLeagues = { userLeagues: [] };
    render(<TradeCenterPage />);
    expect(screen.getByText(/No leagues found/i)).toBeTruthy();
  });

  it('renders league cards when leagues are returned', () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 1, name: 'Test League A' },
        { id: 2, name: 'Test League B' },
      ],
    };
    render(<TradeCenterPage />);
    expect(screen.getByLabelText('View trades for Test League A')).toBeTruthy();
    expect(screen.getByLabelText('View trades for Test League B')).toBeTruthy();
  });

  it('navigates into league trades when a league card is pressed', async () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'My League' }] };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-1')).toBeTruthy();
    });
  });

  it('shows the non-member state when user has no team in the selected league', async () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'My League' }] };
    mockUserTeamId = null;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(screen.getByText(/not a member/i)).toBeTruthy();
    });
  });
});

// ── Parity assertions (LS-7513 — TC-019) ─────────────────────────────────────
// Verify the native surface satisfies the same TradingCenter contract as the
// web /trade-center route and the in-league Trades tab.  Key differences that
// are intentional and must stay stable:
//   - Commissioner: derived from `league.owner === userInfo.id` (owner-based),
//     NOT from userMembership.permissionLevel (that is the web surface's model).
//   - Real-time: wired via useWebSocket + keychain JWT + onSubscribeRefresh
//     (not via the shared LeagueWebSocketContext used by web).

describe('TradeCenterPage — surface contract (parity assertions)', () => {
  it('derives isCommissioner=true when league.owner matches the logged-in user id', async () => {
    // userInfo.id is 1 (from the useAuthorizedUserInfo mock above)
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'My League' }] };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 1 } }; // owner === user id
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(capturedNativeProps?.isCommissioner).toBe(true);
    });
  });

  it('derives isCommissioner=false when league.owner does not match the logged-in user id', async () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'My League' }] };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } }; // owner !== user id
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(capturedNativeProps?.isCommissioner).toBe(false);
    });
  });

  it('passes onSubscribeRefresh as a function to TradingCenter for real-time wiring', async () => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'My League' }] };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(typeof capturedNativeProps?.onSubscribeRefresh).toBe('function');
    });
  });
});

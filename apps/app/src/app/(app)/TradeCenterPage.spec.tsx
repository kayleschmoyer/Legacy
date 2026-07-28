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

// Captures the onSubscribeRefresh prop passed to the TradingCenter mock so
// WebSocket-subscription tests can register a refetch and verify it fires.
let capturedOnSubscribeRefresh:
  | ((refetch: () => void) => (() => void) | void)
  | undefined;

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSearchParams: Record<string, string> = {};

const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    cb();
  },
  Redirect: () => null,
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, email: 'test@example.com' }),
}));

jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue('mock-token'),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('@legacy-sports/graphql', () => ({
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
    TradingCenter: (props: {
      leagueId: number;
      isCommissioner?: boolean;
      onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
      deepLinkOfferId?: number;
      [key: string]: unknown;
    }) => {
      capturedNativeProps = props;
      capturedOnSubscribeRefresh = props.onSubscribeRefresh;
      return (
        <View
          testID={`trading-center-${props.leagueId}`}
          accessibilityHint={
            props.deepLinkOfferId != null
              ? String(props.deepLinkOfferId)
              : undefined
          }
        />
      );
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
    Button: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Pressable onPress={onPress} {...rest}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Card: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Pressable onPress={onPress} {...rest}>
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
      <Text onPress={onPress} {...rest}>
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

let mockIsPremium = false;
jest.mock('../../features/subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: mockIsPremium }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedOnSubscribeRefresh = undefined;
  jest.clearAllMocks();
  mockUserLeagues = undefined;
  mockLeaguesLoading = false;
  mockUserTeamId = null;
  mockLeague = undefined;
  capturedNativeProps = null;
  mockSearchParams = {};
  mockIsPremium = false;
  mockNavigate.mockReset();
  const sharedMocks: { useWebSocket: jest.Mock } = jest.requireMock(
    '@legacy-sports/shared-components',
  );
  sharedMocks.useWebSocket.mockReturnValue({ connected: false });
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
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Alpha League', leaguePhase: 'active' }],
    };
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

  it('renders a Browse Leagues CTA button in the empty state', () => {
    mockUserLeagues = { userLeagues: [] };
    render(<TradeCenterPage />);
    expect(screen.getByText(/Browse Leagues/i)).toBeTruthy();
  });

  it('navigates to league-discovery when Browse Leagues is pressed', () => {
    mockUserLeagues = { userLeagues: [] };
    render(<TradeCenterPage />);
    fireEvent.press(screen.getByText(/Browse Leagues/i));
    expect(mockNavigate).toHaveBeenCalledWith('/league-discovery');
  });

  it('renders league cards when leagues are returned', () => {
    mockUserLeagues = {
      userLeagues: [
        { id: 1, name: 'Test League A', leaguePhase: 'active' },
        { id: 2, name: 'Test League B', leaguePhase: 'active' },
      ],
    };
    render(<TradeCenterPage />);
    expect(screen.getByLabelText('View trades for Test League A')).toBeTruthy();
    expect(screen.getByLabelText('View trades for Test League B')).toBeTruthy();
  });

  it('navigates into league trades when a league card is pressed', async () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-1')).toBeTruthy();
    });
  });

  it('shows the non-member state when user has no team in the selected league', async () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = null;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(screen.getByText(/not a member/i)).toBeTruthy();
    });
  });

  it('pre-selects league from ?leagueId= deep-link param', async () => {
    mockSearchParams = { leagueId: '5' };
    mockUserLeagues = {
      userLeagues: [{ id: 5, name: 'Deep-Link League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };
    render(<TradeCenterPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trading-center-5')).toBeTruthy();
    });
  });

  it('passes tradeOfferId to TradingCenter when ?tradeOfferId= param is present', async () => {
    mockSearchParams = { leagueId: '5', tradeOfferId: '42' };
    mockUserLeagues = {
      userLeagues: [{ id: 5, name: 'Deep-Link League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };
    render(<TradeCenterPage />);

    await waitFor(() => {
      const tc = screen.getByTestId('trading-center-5');
      expect(tc.props.accessibilityHint).toBe('42');
    });
  });

  it('ignores non-numeric ?tradeOfferId= param', async () => {
    mockSearchParams = { leagueId: '5', tradeOfferId: 'abc' };
    mockUserLeagues = {
      userLeagues: [{ id: 5, name: 'Deep-Link League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 10;
    mockLeague = { league: { id: 5, owner: 99 } };
    render(<TradeCenterPage />);

    await waitFor(() => {
      const tc = screen.getByTestId('trading-center-5');
      expect(tc.props.accessibilityHint).toBeUndefined();
    });
  });
});

// ── Parity assertions (LS-7485 — TC-002-P / LS-7513 — TC-019 / LS-7516 — TC-019-P) ──────────
// Verify the native surface uses permissionLevel (not league.owner) to match
// the web surface and the server's vetoTrade authorisation logic.
// Additional intentional differences that must stay stable:
//   - Real-time: wired via useWebSocket + keychain JWT + onSubscribeRefresh
//     (not via the shared LeagueWebSocketContext used by web).
//   - Premium gating (LS-5011): isPremium and onUpgradePremium ARE injected
//     from useSubscription so premium users see their Trade Analysis Tools.

describe('TradeCenterPage — surface contract (parity assertions)', () => {
  it.each([
    ['commissioner', true],
    ['general_manager', true],
    ['assistant_manager', true],
    ['player', false],
    [undefined, false],
  ])(
    'derives isCommissioner=%s from permissionLevel=%s (not league.owner)',
    async (permissionLevel, expected) => {
      // league.owner (999) intentionally does NOT match userInfo.id (1)
      // so the old owner-based check would always return false here.
      mockUserLeagues = {
        userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
      };
      mockUserTeamId = 42;
      mockLeague = {
        league: {
          id: 1,
          owner: 999,
          userMembership: permissionLevel ? { permissionLevel } : null,
        },
      };
      render(<TradeCenterPage />);

      fireEvent.press(screen.getByLabelText('View trades for My League'));

      await waitFor(() => {
        expect(capturedNativeProps?.isCommissioner).toBe(expected);
      });
    },
  );

  it('passes onSubscribeRefresh as a function to TradingCenter for real-time wiring', async () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(typeof capturedNativeProps?.onSubscribeRefresh).toBe('function');
    });
  });

  // ── Premium gating contract (LS-5011) ───────────────────────────────────────
  // isPremium comes from useSubscription and is injected into TradingCenter so
  // premium users can access Trade Analysis Tools. onUpgradePremium navigates
  // to subscription-settings for free users who click the upgrade CTA.

  it('injects isPremium=false into TradingCenter when user is on free tier', async () => {
    mockIsPremium = false;
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(capturedNativeProps?.isPremium).toBe(false);
    });
  });

  it('injects isPremium=true into TradingCenter when user is on premium tier', async () => {
    mockIsPremium = true;
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(capturedNativeProps?.isPremium).toBe(true);
    });
  });

  it('injects onUpgradePremium that navigates to subscription-settings', async () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);

    fireEvent.press(screen.getByLabelText('View trades for My League'));

    await waitFor(() => {
      expect(typeof capturedNativeProps?.onUpgradePremium).toBe('function');
    });

    (capturedNativeProps?.onUpgradePremium as () => void)();
    expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
  });
});

// ── TC-026 regression: real-time WebSocket subscription ───────────────────────

describe('real-time WebSocket subscription (TC-026)', () => {
  const wsShared: { useWebSocket: jest.Mock } = jest.requireMock(
    '@legacy-sports/shared-components',
  );
  const { useWebSocket } = wsShared;

  const setup = async () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'My League', leaguePhase: 'active' }],
    };
    mockUserTeamId = 42;
    mockLeague = { league: { id: 1, owner: 99 } };
    render(<TradeCenterPage />);
    fireEvent.press(screen.getByLabelText('View trades for My League'));
    await waitFor(() => {
      expect(screen.getByTestId('trading-center-1')).toBeTruthy();
    });
  };

  const findWsArgs = (): {
    onTradeOffer?: () => void;
    onRosterUpdate?: () => void;
  } => {
    const calls = useWebSocket.mock.calls as unknown[][];
    for (const call of calls) {
      if ((call[0] as { leagueId?: number })?.leagueId === 1) {
        return call[0] as {
          onTradeOffer?: () => void;
          onRosterUpdate?: () => void;
        };
      }
    }
    return {};
  };

  it('calls useWebSocket with onTradeOffer and onRosterUpdate handlers', async () => {
    await setup();
    const opts = findWsArgs();
    expect(typeof opts.onTradeOffer).toBe('function');
    expect(typeof opts.onRosterUpdate).toBe('function');
  });

  it('passes onSubscribeRefresh to TradingCenter', async () => {
    await setup();
    expect(typeof capturedOnSubscribeRefresh).toBe('function');
  });

  it('invokes the registered refetch when onTradeOffer fires', async () => {
    await setup();
    const { onTradeOffer } = findWsArgs();
    if (!onTradeOffer || !capturedOnSubscribeRefresh) {
      expect(onTradeOffer).toBeDefined();
      return;
    }
    const mockRefetch = jest.fn();
    capturedOnSubscribeRefresh(mockRefetch);
    onTradeOffer();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('invokes the registered refetch when onRosterUpdate fires', async () => {
    await setup();
    const { onRosterUpdate } = findWsArgs();
    if (!onRosterUpdate || !capturedOnSubscribeRefresh) {
      expect(onRosterUpdate).toBeDefined();
      return;
    }
    const mockRefetch = jest.fn();
    capturedOnSubscribeRefresh(mockRefetch);
    onRosterUpdate();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

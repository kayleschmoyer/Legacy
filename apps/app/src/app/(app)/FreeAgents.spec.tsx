import React from 'react';
import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FreeAgentsScreen from './FreeAgents';

// ── Configurable mock state ──────────────────────────────────────────────────
// These are reset in beforeEach. They must be prefixed with `mock` so jest
// allows referencing them from inside the jest.mock factory below.
let mockUserLeagues: unknown;
let mockUserLeaguesLoading: boolean;
let mockLeague: unknown;
let mockTeamMembers: unknown;
let mockClaim: jest.Mock;
let mockSearchParams: { leagueId?: string };

// ── Mocks ────────────────────────────────────────────────────────────────────

// Prevent expo-router's native EventEmitter from crashing Jest.
jest.mock('expo-router', () => {
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: () => null,
    useFocusEffect: (cb: () => (() => void) | void) => {
      cb();
    },
    useLocalSearchParams: () => mockSearchParams,
  };
});

// Bypass the auth context — FreeAgentsScreen calls useAuthorizedUserInfo()
jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, email: 'test@example.com' }),
}));

// Mock the GraphQL hooks used by FreeAgentsScreen / LeagueFreeAgents. The hooks
// read from the mutable mock state so individual tests can drive the league /
// waiver-type scenarios. The player pool + filters now live in the shared
// LeagueDetailFreeAgentsTab (mocked below), so no player-pool query is needed.
jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({
    data: mockUserLeagues,
    loading: mockUserLeaguesLoading,
  }),
  useGetLeagueByIdQuery: () => ({ data: mockLeague }),
  useGetTeamMembersQuery: () => ({ data: mockTeamMembers }),
  useGetUserTeamIdQuery: () => ({ data: { userTeamId: 42 } }),
  useClaimFreeAgentMutation: () => [mockClaim, { loading: false }],
}));

// Stub the shared free-agents tab: it owns the pool/filters/columns/banners
// (covered by its own spec). Here we only need it to surface the native inline
// claim cluster so the FAAB claim-flow logic in the wrapper is exercised. The
// tab only renders the claim action for a member on a team, mirroring the real
// component's gating.
jest.mock('@legacy-sports/shared-components', () => ({
  LeagueDetailFreeAgentsTab: ({
    renderClaimAction,
    myTeamId,
    isMember,
  }: {
    renderClaimAction?: (p: {
      id: number;
      firstName?: string | null;
      lastName?: string | null;
      eligiblePositions?: string[] | null;
    }) => React.ReactNode;
    myTeamId: number | null;
    isMember: boolean;
  }) =>
    isMember && myTeamId != null && renderClaimAction
      ? renderClaimAction({
          id: 99,
          firstName: 'Mike',
          lastName: 'Trout',
          eligiblePositions: ['OF'],
        })
      : null,
}));

jest.mock('tamagui', () => {
  const { View, Text, TextInput, Pressable } =
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
      <Text onPress={onPress} {...rest}>
        {children}
      </Text>
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
    Input: ({
      value,
      onChangeText,
      placeholder,
      ...rest
    }: {
      value?: string;
      onChangeText?: (t: string) => void;
      placeholder?: string;
      [key: string]: unknown;
    }) => (
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        {...rest}
      />
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
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronLeft: () => null,
  UserPlus: () => null,
  Users: () => null,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Render the screen and drill into a single league's free-agent list. */
function selectLeague(): void {
  fireEvent.press(screen.getByLabelText('Browse free agents for Test League'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUserLeagues = undefined;
  mockUserLeaguesLoading = false;
  mockLeague = undefined;
  mockTeamMembers = { teamMembers: [] };
  mockClaim = jest.fn();
  mockSearchParams = {};
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FreeAgentsScreen', () => {
  it('renders without crashing', () => {
    render(<FreeAgentsScreen />);
  });

  it('renders the Free Agents & Waivers heading', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByText(/Free Agents & Waivers/i)).toBeTruthy();
  });

  it('renders the league selection prompt', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('renders an empty league list when no leagues are returned', () => {
    render(<FreeAgentsScreen />);
    expect(screen.queryByText(/No leagues found/i)).toBeTruthy();
  });
});

describe('FreeAgentsScreen — FAAB waiver bidding', () => {
  beforeEach(() => {
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'Test League' }] };
  });

  it('shows a FAAB bid input when claiming in a FAAB league', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'faab',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));

    expect(screen.getByPlaceholderText('FAAB $')).toBeTruthy();
  });

  it('blocks submitting a FAAB claim with no bid and surfaces guidance', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'faab',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));
    fireEvent.press(screen.getByText('Confirm'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'FAAB Bid Required',
      expect.stringContaining('FAAB bid amount'),
    );
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('submits a FAAB claim with the entered bid amount', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'faab',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));
    fireEvent.changeText(screen.getByPlaceholderText('FAAB $'), '15');
    fireEvent.press(screen.getByText('Confirm'));

    expect(mockClaim).toHaveBeenCalledWith({
      variables: { leagueId: 1, playerId: 99, faabBid: 15 },
    });
  });

  it('blocks a non-integer FAAB bid instead of silently truncating it', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'faab',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));
    fireEvent.changeText(screen.getByPlaceholderText('FAAB $'), '15.5');
    fireEvent.press(screen.getByText('Confirm'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'FAAB Bid Required',
      expect.stringContaining('FAAB bid amount'),
    );
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('hides the FAAB bid input for a standard (priority) waiver league', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'standard',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));

    expect(screen.queryByPlaceholderText('FAAB $')).toBeNull();
  });

  it('submits a standard waiver claim without a FAAB bid', () => {
    mockLeague = {
      league: {
        id: 1,
        waiverEnabled: true,
        waiverType: 'standard',
        maxRosterSize: 10,
      },
    };
    render(<FreeAgentsScreen />);
    selectLeague();

    fireEvent.press(screen.getByText('Claim'));
    fireEvent.press(screen.getByText('Confirm'));

    expect(mockClaim).toHaveBeenCalledWith({
      variables: { leagueId: 1, playerId: 99, faabBid: undefined },
    });
  });
});

describe('FreeAgentsScreen — route leagueId param (LS-8854)', () => {
  // Capture BackHandler subscriptions so tests can simulate hardware back
  // press and assert whether the screen intercepted it.
  const backHandlerHandlers: Array<() => boolean> = [];

  beforeEach(() => {
    backHandlerHandlers.length = 0;
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlerHandlers.push(handler as () => boolean);
        return {
          remove: jest.fn(() => {
            const idx = backHandlerHandlers.indexOf(handler as () => boolean);
            if (idx !== -1) backHandlerHandlers.splice(idx, 1);
          }),
        };
      });
    mockUserLeagues = { userLeagues: [{ id: 1, name: 'Test League' }] };
  });

  it('lands directly on the league free-agent list when leagueId matches a user league', () => {
    mockSearchParams = { leagueId: '1' };
    render(<FreeAgentsScreen />);

    expect(screen.queryByText(/Select a league/i)).toBeNull();
  });

  it('still shows the league picker when no leagueId param is present', () => {
    mockSearchParams = {};
    render(<FreeAgentsScreen />);

    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('falls back to the picker for a non-member leagueId param', () => {
    mockSearchParams = { leagueId: '999' };
    render(<FreeAgentsScreen />);

    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('falls back to the picker for a malformed leagueId param', () => {
    mockSearchParams = { leagueId: 'not-a-number' };
    render(<FreeAgentsScreen />);

    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('shows a spinner (not the picker) while resolving a route leagueId', () => {
    mockSearchParams = { leagueId: '1' };
    mockUserLeaguesLoading = true;
    mockUserLeagues = undefined;
    render(<FreeAgentsScreen />);

    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(screen.queryByText(/Select a league/i)).toBeNull();
  });

  it('does not intercept system back when the league came from the route param', () => {
    mockSearchParams = { leagueId: '1' };
    render(<FreeAgentsScreen />);

    expect(backHandlerHandlers).toHaveLength(0);
  });

  it('intercepts system back to unwind to the picker when the league was chosen in-screen', () => {
    mockSearchParams = {};
    render(<FreeAgentsScreen />);

    fireEvent.press(
      screen.getByLabelText('Browse free agents for Test League'),
    );
    expect(screen.queryByText(/Select a league/i)).toBeNull();
    expect(backHandlerHandlers).toHaveLength(1);

    void act(() => {
      backHandlerHandlers.forEach((handler) => handler());
    });

    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });
});

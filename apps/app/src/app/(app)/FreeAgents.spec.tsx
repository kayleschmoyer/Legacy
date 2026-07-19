import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import FreeAgentsScreen from './FreeAgents';

// ── Configurable mock state ──────────────────────────────────────────────────
// These are reset in beforeEach. They must be prefixed with `mock` so jest
// allows referencing them from inside the jest.mock factory below.
let mockUserLeagues: unknown;
let mockLeague: unknown;
let mockTeamMembers: unknown;
let mockClaim: jest.Mock;

// ── Mocks ────────────────────────────────────────────────────────────────────

// Prevent expo-router's native EventEmitter from crashing Jest.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.requireActual must use require-style import inside jest.mock factory
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: () => null,
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
  useGetUserLeaguesQuery: () => ({ data: mockUserLeagues, loading: false }),
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
  mockLeague = undefined;
  mockTeamMembers = { teamMembers: [] };
  mockClaim = jest.fn();
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

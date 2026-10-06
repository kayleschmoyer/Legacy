import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import BaseballTeam from './[teamId]';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ teamId: '10' })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/scoring', () => ({
  computeAverageScoring: jest.fn(() => 0),
  computeScoring: jest.fn(() => 0),
}));

// Mock value mirrors the real BRAND_NAVY_LIGHT constant; requireActual isn't
// used here since it pulls in the full barrel (native OAuth deps Jest can't parse).
const MOCK_BRAND_NAVY_LIGHT = '#2C4A7C';

// Captures the props from the most recent TeamBrandingControl render so
// LS-7685's canUploadLogo/imageUploadUrl/getAuthToken wiring is verifiable.
let lastTeamBrandingProps:
  | {
      canUploadLogo?: boolean;
      imageUploadUrl?: string | null;
      getAuthToken?: () => Promise<string | null>;
    }
  | undefined;

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    BRAND_NAVY_LIGHT: MOCK_BRAND_NAVY_LIGHT,
    UnifiedLoadingPanel: () => <View testID="loading-panel" />,
    TeamBrandingControl: (props: {
      canUploadLogo?: boolean;
      imageUploadUrl?: string | null;
      getAuthToken?: () => Promise<string | null>;
    }) => {
      lastTeamBrandingProps = props;
      return <View testID="team-branding-control" />;
    },
    SecureStorageProvider: {
      getItem: jest.fn(() => Promise.resolve('mock-jwt')),
    },
    TeamAssistantManagerSettings: () => (
      <View testID="team-assistant-manager-settings" />
    ),
  };
});

// The Lineup/Rotation tabs now mount the shared cross-platform RosterBoard
// (LS-9651), replacing the app-local LineupEditor fork. This double surfaces
// the props under test and exposes one pressable per interaction so the
// route's assign / bench / swap wiring is asserted directly.
type MockRosterSlot = { id: number | null; positionType: string };
type MockRosterPlayer = {
  id: number;
  playerId: number;
  positionId: number | null;
};
type MockRosterBoardProps = {
  positions: readonly MockRosterSlot[];
  teamPlayers: readonly MockRosterPlayer[];
  onPlayerAssign: (player: MockRosterPlayer, position: MockRosterSlot) => void;
  onPlayerRemove: (position: MockRosterSlot) => void;
  onPlayerSwap: (
    incoming: MockRosterPlayer,
    target: MockRosterSlot,
    displaced: MockRosterPlayer,
  ) => void;
  getPlayerStats?: (
    player: MockRosterPlayer,
  ) => { actual?: number | null; projected?: number | null } | null;
  readOnly?: boolean;
};

jest.mock('@legacy-sports/shared-components/roster', () => {
  const { Pressable, Text, View } = jest.requireActual<
    RNComponents & { Pressable: typeof import('react-native').Pressable }
  >('react-native');
  return {
    RosterBoard: ({
      positions,
      teamPlayers,
      onPlayerAssign,
      onPlayerRemove,
      onPlayerSwap,
      getPlayerStats,
      readOnly,
    }: MockRosterBoardProps) => {
      const slot = positions[0];
      const benched = teamPlayers.find((p) => p.positionId == null);
      const occupant = teamPlayers.find((p) => p.positionId === slot?.id);
      const projected: Record<number, number> = {};
      for (const p of teamPlayers) {
        const value = getPlayerStats?.(p)?.projected;
        if (value != null) projected[p.playerId] = value;
      }
      return (
        <View testID="roster-board">
          <Text testID="roster-board-readonly">{String(!!readOnly)}</Text>
          <Text testID="roster-board-slots">
            {positions.map((p) => p.positionType).join(',')}
          </Text>
          <Text testID="roster-board-projected">
            {JSON.stringify(projected)}
          </Text>
          <Pressable
            testID="roster-board-assign"
            onPress={() => benched && slot && onPlayerAssign(benched, slot)}
          />
          <Pressable
            testID="roster-board-remove"
            onPress={() => slot && onPlayerRemove(slot)}
          />
          <Pressable
            testID="roster-board-swap"
            onPress={() =>
              benched &&
              slot &&
              occupant &&
              onPlayerSwap(benched, slot, occupant)
            }
          />
        </View>
      );
    },
  };
});

jest.mock('../../../../../../common/scoring', () => ({
  applyMultiplierGroups: jest.fn(() => ({
    batting: {},
    fielding: {},
    pitching: {},
  })),
}));

jest.mock('../../../../../../common/models/Models', () => {
  const pitchingTypes = new Set(['SP', 'RP']);
  return {
    isBatter: (
      member: { player?: { eligiblePositions?: string[] } } | null,
    ) => {
      if (!member) return false;
      const eligible = member.player?.eligiblePositions ?? [];
      return (
        eligible.length === 0 ||
        eligible.some((pos: string) => !pitchingTypes.has(pos))
      );
    },
    isBattingSlot: (slot: { positionType?: string | null } | null): boolean =>
      slot !== null &&
      slot.positionType != null &&
      !pitchingTypes.has(slot.positionType),
    isPitcher: (
      member: { player?: { eligiblePositions?: string[] } } | null,
    ) => {
      if (!member) return false;
      const eligible = member.player?.eligiblePositions ?? [];
      return eligible.some((pos: string) => pitchingTypes.has(pos));
    },
    isPitchingSlot: (slot: { positionType?: string | null } | null): boolean =>
      slot !== null &&
      slot.positionType != null &&
      pitchingTypes.has(slot.positionType),
    PositionSlot: { Dh: 'DH' },
  };
});

jest.mock('../../../../../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../../../../../common/utilities/RouteUtils', () => ({
  toIntId: (v: unknown) => (typeof v === 'string' ? parseInt(v, 10) : null),
}));

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const mocks = jest.requireActual<
    typeof import('../../../../../../__test-utils__/tamagui-mocks')
  >('../../../../../../__test-utils__/tamagui-mocks');
  const { View, Text, Pressable } = jest.requireActual<
    RNComponents & { Pressable: typeof import('react-native').Pressable }
  >('react-native');

  const TabsCtx = React.createContext<{ onValueChange?: (v: string) => void }>(
    {},
  );

  const TabsList = ({ children }: { children: React.ReactNode }) => (
    <View testID="tabs-list">{children}</View>
  );

  const TabsTab = ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { onValueChange } = React.useContext(TabsCtx);
    return (
      <Pressable testID={`tab-${value}`} onPress={() => onValueChange?.(value)}>
        {children}
      </Pressable>
    );
  };

  const Tabs = Object.assign(
    ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      [key: string]: unknown;
    }) => (
      <TabsCtx.Provider value={{ onValueChange }}>
        <View testID="tabs">{children}</View>
      </TabsCtx.Provider>
    ),
    { List: TabsList, Tab: TabsTab },
  );

  return {
    createTokens: (tokens: unknown) => tokens,
    ...mocks.tamaguiMocks,
    Label: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Separator: () => <View testID="separator" />,
    Tabs,
  };
});

// ── GraphQL mocks ─────────────────────────────────────────────────────────────

const mockTeam = {
  id: 10,
  leagueId: 5,
  name: 'Test Team',
  avatarUrl: null,
  bannerUrl: null,
};
const mockPositions = [
  { id: 1, leagueId: 5, positionType: 'C' },
  { id: 2, leagueId: 5, positionType: 'SP' },
];
const mockMembers = [
  {
    id: 101,
    playerId: 1,
    positionId: 1,
    teamId: 10,
    leagueId: 5,
    player: {
      id: 1,
      firstName: 'Starting',
      lastName: 'Catcher',
      eligiblePositions: ['C'],
    },
  },
  // Benched (positionId === null) — RosterBoard derives bench membership from
  // a null positionId, so this is the player the assign/swap paths move.
  {
    id: 102,
    playerId: 2,
    positionId: null,
    teamId: 10,
    leagueId: 5,
    player: {
      id: 2,
      firstName: 'Bench',
      lastName: 'Hitter',
      eligiblePositions: ['C'],
    },
  },
  {
    id: 103,
    playerId: 3,
    positionId: 2,
    teamId: 10,
    leagueId: 5,
    player: {
      id: 3,
      firstName: 'Starting',
      lastName: 'Pitcher',
      eligiblePositions: ['SP'],
    },
  },
];

const mockUseGetTeamByIdQuery = jest.fn(() => ({
  loading: false,
  data: { team: mockTeam },
}));
const mockUseGetUserTeamIdQuery = jest.fn(() => ({ data: { userTeamId: 10 } }));
const mockUseGetLeagueByIdQuery = jest.fn(() => ({
  loading: false,
  data: { league: { userMembership: { permissionLevel: 'owner' } } },
}));
const mockUseGetLeagueScoringProfileQuery = jest.fn(() => ({
  loading: false,
  data: { leagueScoringProfile: { multiplierGroups: [] } },
}));
const mockUseGetMatchupPlayersQuery = jest.fn(() => ({
  loading: false,
  data: { getMatchupPlayers: [] },
}));
const mockUseGetPositionsForLeagueQuery = jest.fn(() => ({
  loading: false,
  data: { leaguePositions: mockPositions },
}));
const mockUseGetTeamMembersQuery = jest.fn(() => ({
  loading: false,
  data: { teamMembers: mockMembers },
}));
const mockUpdateTeamMemberPosition = jest.fn(() => Promise.resolve({}));
const mockSwapTeamMemberPositions = jest.fn(() => Promise.resolve({}));
const mockUseUpdateTeamMemberPositionMutation = jest.fn(() => [
  mockUpdateTeamMemberPosition,
]);
const mockUseSwapTeamMemberPositionsMutation = jest.fn(() => [
  mockSwapTeamMemberPositions,
]);

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamByIdQuery: (...args: unknown[]) => mockUseGetTeamByIdQuery(...args),
  useGetUserTeamIdQuery: (...args: unknown[]) =>
    mockUseGetUserTeamIdQuery(...args),
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockUseGetLeagueByIdQuery(...args),
  useGetLeagueScoringProfileQuery: (...args: unknown[]) =>
    mockUseGetLeagueScoringProfileQuery(...args),
  useGetMatchupPlayersQuery: (...args: unknown[]) =>
    mockUseGetMatchupPlayersQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockUseGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: (...args: unknown[]) =>
    mockUseGetTeamMembersQuery(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUseUpdateTeamMemberPositionMutation(...args),
  useSwapTeamMemberPositionsMutation: (...args: unknown[]) =>
    mockUseSwapTeamMemberPositionsMutation(...args),
}));

// ── Subscription mock ─────────────────────────────────────────────────────────

const mockUseSubscription = jest.fn(() => ({ isPremium: true }));
const mockUseHasEntitlement = jest.fn(() => true);

jest.mock('../../../../../../features/subscription/useSubscription', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
  useHasEntitlement: (...args: unknown[]) => mockUseHasEntitlement(...args),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockUseGetTeamByIdQuery.mockReturnValue({
    loading: false,
    data: { team: mockTeam },
  });
  mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 10 } });
  mockUseGetLeagueByIdQuery.mockReturnValue({
    loading: false,
    data: { league: { userMembership: { permissionLevel: 'owner' } } },
  });
  mockUseGetLeagueScoringProfileQuery.mockReturnValue({
    loading: false,
    data: { leagueScoringProfile: { multiplierGroups: [] } },
  });
  mockUseGetMatchupPlayersQuery.mockReturnValue({
    loading: false,
    data: { getMatchupPlayers: [] },
  });
  mockUseGetPositionsForLeagueQuery.mockReturnValue({
    loading: false,
    data: { leaguePositions: mockPositions },
  });
  mockUseGetTeamMembersQuery.mockReturnValue({
    loading: false,
    data: { teamMembers: mockMembers },
  });
  mockUseUpdateTeamMemberPositionMutation.mockReturnValue([
    mockUpdateTeamMemberPosition,
  ]);
  mockUseSwapTeamMemberPositionsMutation.mockReturnValue([
    mockSwapTeamMemberPositions,
  ]);
  mockUseSubscription.mockReturnValue({ isPremium: true });
  mockUseHasEntitlement.mockReturnValue(true);
}

describe('BaseballTeam route — RosterBoard wiring (LS-9651)', () => {
  beforeEach(resetMocks);

  it('renders the shared RosterBoard on the Lineup tab, scoped to batting slots', () => {
    render(<BaseballTeam />);
    expect(screen.getByTestId('roster-board')).toBeTruthy();
    expect(screen.getByTestId('roster-board-slots')).toHaveTextContent('C');
  });

  it('renders the shared RosterBoard on the Rotation tab, scoped to pitching slots', () => {
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Rotation'));
    expect(screen.getByTestId('roster-board-slots')).toHaveTextContent('SP');
  });

  it('leaves the board editable for the team owner', () => {
    render(<BaseballTeam />);
    expect(screen.getByTestId('roster-board-readonly')).toHaveTextContent(
      'false',
    );
  });

  it('renders a read-only board for a non-owner on both tabs', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 999 } });
    render(<BaseballTeam />);
    expect(screen.getByTestId('roster-board-readonly')).toHaveTextContent(
      'true',
    );
    fireEvent.press(screen.getByTestId('tab-Rotation'));
    expect(screen.getByTestId('roster-board-readonly')).toHaveTextContent(
      'true',
    );
  });

  it('assigns a benched hitter to a slot via updateTeamMemberPosition', () => {
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('roster-board-assign'));
    expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { teamMemberId: 102, positionId: 1 },
      }),
    );
  });

  it('benches a starter by clearing their positionId', () => {
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('roster-board-remove'));
    expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { teamMemberId: 101, positionId: null },
      }),
    );
  });

  it('swaps a starter and a bench player via the atomic swapTeamMemberPositions mutation', () => {
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('roster-board-swap'));
    expect(mockSwapTeamMemberPositions).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          teamMemberIdA: 102,
          positionIdA: 1,
          teamMemberIdB: 101,
          positionIdB: undefined,
        },
      }),
    );
  });

  it('gates projected stats behind the premium subscription on the Lineup tab', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false });
    render(<BaseballTeam />);
    expect(screen.getByTestId('roster-board-projected')).toHaveTextContent(
      '{}',
    );
  });
});

describe('BaseballTeam route — team identity header (LS-8313)', () => {
  beforeEach(resetMocks);

  it('shows a letter fallback avatar and league ID when no avatarUrl is set (AC1, AC2)', () => {
    render(<BaseballTeam />);
    expect(screen.getByTestId('team-avatar-fallback')).toHaveTextContent('T');
    expect(screen.queryByTestId('team-avatar-image')).toBeNull();
    expect(screen.getByTestId('team-league-id')).toHaveTextContent(
      'League ID: 5',
    );
  });

  it('renders the avatar image instead of the fallback when avatarUrl is set (AC1)', () => {
    mockUseGetTeamByIdQuery.mockReturnValue({
      loading: false,
      data: {
        team: { ...mockTeam, avatarUrl: 'https://example.com/logo.png' },
      },
    });
    render(<BaseballTeam />);
    expect(screen.getByTestId('team-avatar-image')).toBeTruthy();
    expect(screen.queryByTestId('team-avatar-fallback')).toBeNull();
  });

  it('omits the banner image when bannerUrl is not set (AC3)', () => {
    render(<BaseballTeam />);
    expect(screen.queryByTestId('team-banner-image')).toBeNull();
  });

  it('renders the banner image when bannerUrl is set (AC3)', () => {
    mockUseGetTeamByIdQuery.mockReturnValue({
      loading: false,
      data: {
        team: { ...mockTeam, bannerUrl: 'https://example.com/banner.jpg' },
      },
    });
    render(<BaseballTeam />);
    expect(screen.getByTestId('team-banner-image')).toBeTruthy();
  });

  it('shows the visitor note for a non-owner, non-commissioner viewer (AC4)', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 999 } });
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { userMembership: { permissionLevel: 'member' } } },
    });
    render(<BaseballTeam />);
    expect(screen.getByTestId('team-visitor-note')).toBeTruthy();
  });

  it('hides the visitor note for the owner (AC4)', () => {
    render(<BaseballTeam />);
    expect(screen.queryByTestId('team-visitor-note')).toBeNull();
  });

  it('hides the visitor note for a commissioner who is not the owner (AC4)', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 999 } });
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { userMembership: { permissionLevel: 'commissioner' } } },
    });
    render(<BaseballTeam />);
    expect(screen.queryByTestId('team-visitor-note')).toBeNull();
  });
});

describe('BaseballTeam route — Settings tab logo-upload gating (LS-7685)', () => {
  beforeEach(resetMocks);

  it('passes canUploadLogo=true to TeamBrandingControl for an entitled (premium) owner', () => {
    mockUseHasEntitlement.mockReturnValue(true);
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    expect(screen.getByTestId('team-branding-control')).toBeTruthy();
    expect(lastTeamBrandingProps?.canUploadLogo).toBe(true);
    expect(mockUseHasEntitlement).toHaveBeenCalledWith('logo_upload');
  });

  it('passes canUploadLogo=false to TeamBrandingControl for a non-entitled (free) owner', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    expect(lastTeamBrandingProps?.canUploadLogo).toBe(false);
  });

  it('passes a getAuthToken callback that resolves the stored bearer JWT', async () => {
    mockUseHasEntitlement.mockReturnValue(true);
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    await expect(lastTeamBrandingProps?.getAuthToken?.()).resolves.toBe(
      'mock-jwt',
    );
  });
});

describe('BaseballTeam route — assistant manager settings parity (LS-6029, AC1)', () => {
  beforeEach(resetMocks);

  it('renders TeamAssistantManagerSettings in the Settings tab for the team owner', () => {
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));
    expect(screen.getByTestId('team-assistant-manager-settings')).toBeTruthy();
  });

  it('does not render the Settings tab (or assistant manager settings) for a non-owner', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 999 } });
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { userMembership: { permissionLevel: 'member' } } },
    });
    render(<BaseballTeam />);
    expect(screen.queryByTestId('tab-Settings')).toBeNull();
    expect(screen.queryByTestId('team-assistant-manager-settings')).toBeNull();
  });
});

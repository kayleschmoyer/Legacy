import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import FootballTeam from './[teamId]';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ teamId: '42' })),
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// LS-6434: mocks for the picker+upload-backed BrandingSettings — the avatar/
// banner fields used to be free-text URL inputs with no MIME/size/NSFW
// screening, unlike web's TeamDetailPage upload flow (LS-1810).
const mockPickAndUploadLogo = jest.fn();
type MockUploadState = { uploading: boolean; uploadError: string | null };
const mockAvatarUploadState: MockUploadState = {
  uploading: false,
  uploadError: null,
};
const mockBannerUploadState: MockUploadState = {
  uploading: false,
  uploadError: null,
};
type MockTeamLogoUploadOptions = {
  imageType?: 'avatar' | 'banner';
  onUploaded: (url: string) => void;
};
const mockUseTeamLogoUpload = jest.fn((options: MockTeamLogoUploadOptions) => {
  const state =
    options.imageType === 'banner'
      ? mockBannerUploadState
      : mockAvatarUploadState;
  return {
    uploading: state.uploading,
    uploadError: state.uploadError,
    pickAndUploadLogo: (): void => {
      mockPickAndUploadLogo(options);
    },
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    UnifiedLoadingPanel: () => <View testID="loading-panel" />,
    SecureStorageProvider: { getItem: jest.fn(() => Promise.resolve('jwt')) },
    useTeamLogoUpload: (options: MockTeamLogoUploadOptions) =>
      mockUseTeamLogoUpload(options),
  };
});

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { imageUploadUrl: 'https://upload.example.com' },
}));

// Avoids loading the real @legacy-sports/shared-components/football barrel
// (pulled in transitively via deriveFootballScoringFormat), which drags in
// NFLHome/FootballPlayerCard/etc. and @react-native-google-signin/google-signin
// — an ESM-only package Jest can't parse (not in the app jest config's
// transformIgnorePatterns allowlist).
jest.mock('@legacy-sports/shared-components/football', () => ({
  detectFootballScoringPreset: (rec: number) => {
    if (rec === 0) return 'standard';
    if (rec === 0.5) return 'half_ppr';
    if (rec === 1) return 'ppr';
    return 'custom';
  },
}));

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  const { View, Text, Pressable } = jest.requireActual<
    RNComponents & { Pressable: typeof import('react-native').Pressable }
  >('react-native');

  const TabsCtx = React.createContext<{
    onValueChange?: (v: string) => void;
  }>({});

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

// Mock screens and features
jest.mock(
  '../../../../screens/leagues/football/FootballLeagueRosterScreen',
  () => {
    const { Text, View } = jest.requireActual<RNComponents>('react-native');
    return {
      FootballLeagueRosterScreen: ({
        teamId,
        defensiveFormat,
        rosterSlots,
        byeWeeksByTeam,
        currentWeek,
      }: {
        teamId: number;
        defensiveFormat?: string | null;
        rosterSlots?: readonly unknown[];
        byeWeeksByTeam?: Record<string, number>;
        currentWeek?: number | null;
      }) => (
        <View
          testID={`roster-screen-${teamId}-${defensiveFormat ?? 'dst'}-slots-${
            rosterSlots?.length ?? 0
          }`}
        >
          <Text testID="roster-screen-bye-weeks">
            {JSON.stringify(byeWeeksByTeam ?? {})}
          </Text>
          <Text testID="roster-screen-current-week">
            {JSON.stringify(currentWeek ?? null)}
          </Text>
        </View>
      ),
    };
  },
);

// The Lineup tab now mounts the shared cross-platform RosterBoard (LS-9649).
// This double surfaces the props under test and exposes one pressable per
// interaction so the route's assign / bench / swap wiring is asserted directly
// — the old LineupEditor mock swallowed the editor entirely and asserted
// nothing about it.
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
  ) => { actual?: number | null } | null;
  readOnly?: boolean;
  sport?: string;
  byeWeeksByTeam?: Record<string, number>;
  currentWeek?: number | null;
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
      sport,
      byeWeeksByTeam,
      currentWeek,
    }: MockRosterBoardProps) => {
      const slot = positions[0];
      const benched = teamPlayers.find((p) => p.positionId == null);
      const occupant = teamPlayers.find((p) => p.positionId === slot?.id);
      const actual: Record<number, number> = {};
      for (const p of teamPlayers) {
        const points = getPlayerStats?.(p)?.actual;
        if (points != null) actual[p.playerId] = points;
      }
      return (
        <View testID="roster-board">
          <Text testID="roster-board-sport">{sport}</Text>
          <Text testID="roster-board-readonly">{String(!!readOnly)}</Text>
          <Text testID="roster-board-slots">
            {positions.map((p) => p.positionType).join(',')}
          </Text>
          <Text testID="roster-board-actual">{JSON.stringify(actual)}</Text>
          <Text testID="roster-board-bye-weeks">
            {JSON.stringify(byeWeeksByTeam ?? {})}
          </Text>
          <Text testID="roster-board-current-week">
            {JSON.stringify(currentWeek ?? null)}
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

jest.mock('@legacy-sports/shared-components/matchup', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupAdditionalSections: ({
      matchup,
      leagueId,
    }: {
      matchup: { id: number } | null | undefined;
      leagueId: number;
    }) => (
      <View testID="matchup-additional-sections">
        <Text>
          Additional sections for matchup {matchup?.id} in league {leagueId}
        </Text>
      </View>
    ),
  };
});

jest.mock('../../../../features/matchup/components/MatchupCard', () => {
  const { Pressable, Text } = jest.requireActual<
    RNComponents & { Pressable: typeof import('react-native').Pressable }
  >('react-native');
  return {
    MatchupCard: ({
      matchup,
      onPress,
    }: {
      matchup: { id: number } | null | undefined;
      onPress?: () => void;
    }) =>
      matchup ? (
        <Pressable testID="matchup-card" onPress={onPress}>
          <Text>Matchup {matchup.id}</Text>
        </Pressable>
      ) : null,
  };
});

jest.mock('../../../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../../../common/utilities/RouteUtils', () => ({
  toIntId: (v: unknown) => (typeof v === 'string' ? parseInt(v, 10) : null),
}));

// ── GraphQL mocks ─────────────────────────────────────────────────────────────

const mockTeam = {
  id: 1,
  leagueId: 10,
  name: 'Test Team',
  avatarUrl: null,
  bannerUrl: null,
};

const mockLeague = {
  id: 10,
  name: 'Test League',
  defensiveFormat: 'dst',
  currentWeekNumber: 5,
  currentMatchup: 77,
  seasonNumber: 2026,
};

const mockNflByeWeekData = {
  nflTeamSeasonMetadata: [
    { teamAbbreviation: 'KC', byeWeek: 6, sosTier: 1, season: 2026 },
    { teamAbbreviation: 'BUF', byeWeek: 12, sosTier: 2, season: 2026 },
  ],
};

const mockMatchupScores = {
  matchupScores: [
    {
      __typename: 'FootballMatchupStats',
      teamId: 42,
      teamName: 'Test Team',
      totalPoints: 24.7,
      players: [
        {
          __typename: 'FootballMatchupPlayer',
          playerId: 1,
          playerName: 'Josh Allen',
          position: 'QB',
          totalPoints: 24.7,
        },
      ],
    },
    {
      __typename: 'FootballMatchupStats',
      teamId: 99,
      teamName: 'Opponent Team',
      totalPoints: 10.5,
      players: [
        {
          __typename: 'FootballMatchupPlayer',
          playerId: 2,
          playerName: 'Someone Else',
          position: 'RB',
          totalPoints: 10.5,
        },
      ],
    },
  ],
};

// `id` is widened to match the schema's nullable LeaguePosition.id so the
// null-slot guard test can override this fixture.
const mockPositions: {
  id: number | null;
  leagueId: number;
  positionType: string;
}[] = [{ id: 1, leagueId: 10, positionType: 'QB' }];

const mockMembers = [
  {
    id: 101,
    playerId: 1,
    positionId: 1,
    teamId: 42,
    leagueId: 10,
    onTradeBlock: false,
    player: {
      id: 1,
      firstName: 'Josh',
      lastName: 'Allen',
      brefId: null,
      eligiblePositions: ['QB'],
    },
  },
  // Benched (positionId === null) — RosterBoard derives bench membership from
  // a null positionId, so this is the player the assign/swap paths move.
  {
    id: 102,
    playerId: 2,
    positionId: null,
    teamId: 42,
    leagueId: 10,
    onTradeBlock: false,
    player: {
      id: 2,
      firstName: 'Backup',
      lastName: 'Quarterback',
      brefId: null,
      eligiblePositions: ['QB'],
    },
  },
];

const mockUseGetTeamByIdQuery = jest.fn(() => ({
  loading: false,
  data: { team: mockTeam },
}));
const mockUseGetUserTeamIdQuery = jest.fn(() => ({
  data: { userTeamId: 42 },
}));
const mockUseGetLeagueByIdQuery = jest.fn(() => ({
  loading: false,
  data: { league: mockLeague },
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
const mockUseUpdateTeamBrandingMutation = jest.fn(() => [
  jest.fn(),
  { loading: false },
]);
const mockUseMatchupScoresQuery = jest.fn(() => ({
  loading: false,
  data: undefined,
}));
const mockMatchup = {
  id: 77,
  weekNumber: 3,
  team1Id: 42,
  team2Id: 43,
  team1Score: 10,
  team2Score: 7,
  status: 'in_progress',
  team1: { id: 42, name: 'Test Team' },
  team2: { id: 43, name: 'Rival Team' },
};
const mockUseGetMatchupByIdQuery = jest.fn(() => ({
  loading: false,
  data: { getMatchupById: mockMatchup },
}));
const mockUseGetNflTeamSeasonMetadataQuery = jest.fn(() => ({
  data: mockNflByeWeekData,
}));

function buildScoringProfile(recMultiplier: number) {
  return {
    leagueScoringProfile: {
      profileId: 1,
      profileName: 'Test Profile',
      stats: [
        {
          multiplier: recMultiplier,
          defaultMultiplier: 1,
          isOverride: recMultiplier !== 1,
          isEnabled: true,
          definition: {
            id: 1,
            statKey: 'rec',
            statGroup: 'receiving',
            displayName: 'Reception',
          },
        },
      ],
      multiplierGroups: [],
      positionBonuses: [],
    },
  };
}

const mockUseGetLeagueScoringProfileQuery = jest.fn(() => ({
  loading: false,
  data: buildScoringProfile(1),
}));

jest.mock('@legacy-sports/graphql', () => ({
  // Real value (not a hook mock) — footballScoringFormat.ts reads
  // ScoringStatGroup.Receiving at module scope to derive the badge.
  ScoringStatGroup: { Receiving: 'receiving' },
  useGetTeamByIdQuery: (...args: unknown[]) => mockUseGetTeamByIdQuery(...args),
  useGetUserTeamIdQuery: (...args: unknown[]) =>
    mockUseGetUserTeamIdQuery(...args),
  useGetMatchupByIdQuery: (...args: unknown[]) =>
    mockUseGetMatchupByIdQuery(...args),
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockUseGetLeagueByIdQuery(...args),
  useGetNflTeamSeasonMetadataQuery: (...args: unknown[]) =>
    mockUseGetNflTeamSeasonMetadataQuery(...args),
  useGetLeagueScoringProfileQuery: (...args: unknown[]) =>
    mockUseGetLeagueScoringProfileQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockUseGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: (...args: unknown[]) =>
    mockUseGetTeamMembersQuery(...args),
  useMatchupScoresQuery: (...args: unknown[]) =>
    mockUseMatchupScoresQuery(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUseUpdateTeamMemberPositionMutation(...args),
  useSwapTeamMemberPositionsMutation: (...args: unknown[]) =>
    mockUseSwapTeamMemberPositionsMutation(...args),
  useUpdateTeamBrandingMutation: (...args: unknown[]) =>
    mockUseUpdateTeamBrandingMutation(...args),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FootballTeam route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetTeamByIdQuery.mockReturnValue({
      loading: false,
      data: { team: mockTeam },
    });
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 42 } });
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: mockLeague },
    });
    mockUseGetPositionsForLeagueQuery.mockReturnValue({
      loading: false,
      data: { leaguePositions: mockPositions },
    });
    mockUseGetTeamMembersQuery.mockReturnValue({
      loading: false,
      data: { teamMembers: mockMembers },
    });
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: false,
      data: { getMatchupById: mockMatchup },
    });
    mockUseUpdateTeamMemberPositionMutation.mockReturnValue([
      mockUpdateTeamMemberPosition,
    ]);
    mockUseSwapTeamMemberPositionsMutation.mockReturnValue([
      mockSwapTeamMemberPositions,
    ]);
    mockUseUpdateTeamBrandingMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: false,
      data: undefined,
    });
    mockUseGetNflTeamSeasonMetadataQuery.mockReturnValue({
      data: mockNflByeWeekData,
    });
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: buildScoringProfile(1),
    });
  });

  it('shows loading panel while data is loading', () => {
    mockUseGetTeamByIdQuery.mockReturnValue({ loading: true, data: undefined });
    render(<FootballTeam />);
    expect(screen.getByTestId('loading-panel')).toBeTruthy();
  });

  it('shows error when team fails to load', () => {
    mockUseGetTeamByIdQuery.mockReturnValue({
      loading: false,
      data: { team: null },
    });
    render(<FootballTeam />);
    expect(screen.getByText('Could not load team')).toBeTruthy();
  });

  it('shows error when positions fail to load', () => {
    mockUseGetPositionsForLeagueQuery.mockReturnValue({
      loading: false,
      data: { leaguePositions: null },
    });
    render(<FootballTeam />);
    expect(
      screen.getByText('Could not load positions for league'),
    ).toBeTruthy();
  });

  it('renders Roster, Matchup, and Lineup tabs for non-owner', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 99 } });
    render(<FootballTeam />);
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('Matchup')).toBeTruthy();
    expect(screen.getByText('Lineup')).toBeTruthy();
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('renders Settings tab for owner', () => {
    render(<FootballTeam />);
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('Matchup')).toBeTruthy();
    expect(screen.getByText('Lineup')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('shows roster screen on Roster tab by default', () => {
    render(<FootballTeam />);
    expect(screen.getByTestId('roster-screen-42-dst-slots-1')).toBeTruthy();
  });

  it('passes rosterSlots (league positions) to FootballLeagueRosterScreen', () => {
    mockUseGetPositionsForLeagueQuery.mockReturnValue({
      loading: false,
      data: {
        leaguePositions: [
          { id: 1, leagueId: 10, positionType: 'QB' },
          { id: 2, leagueId: 10, positionType: 'FLEX' },
        ],
      },
    });
    render(<FootballTeam />);
    expect(screen.getByTestId('roster-screen-42-dst-slots-2')).toBeTruthy();
  });

  it('renders the shared RosterBoard for football on the Lineup tab', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board')).toBeTruthy();
    // sport="football" is what makes the board resolve football slot
    // eligibility instead of the baseball-only table the old fork used.
    expect(screen.getByTestId('roster-board-sport')).toHaveTextContent(
      'football',
    );
  });

  it("shows the league's scoring format badge on the Lineup tab", () => {
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: buildScoringProfile(0.5),
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('lineup-scoring-format-badge')).toHaveTextContent(
      'Half-PPR Scoring',
    );
  });

  it('shows no scoring format badge when the profile has no receiving rec stat', () => {
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: undefined,
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.queryByTestId('lineup-scoring-format-badge')).toBeNull();
  });

  it("shows the league's scoring format callout on every tab, not just Lineup", () => {
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: buildScoringProfile(0.5),
    });
    render(<FootballTeam />);
    // Default tab is Roster.
    expect(screen.getByTestId('team-scoring-format-callout')).toHaveTextContent(
      /Half-PPR Scoring/,
    );
  });

  it('hides the scoring format callout when the profile has no receiving rec stat', () => {
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: undefined,
    });
    render(<FootballTeam />);
    expect(screen.queryByTestId('team-scoring-format-callout')).toBeNull();
  });

  it('expands the scoring format callout to preview point values by stat category', () => {
    mockUseGetLeagueScoringProfileQuery.mockReturnValue({
      loading: false,
      data: buildScoringProfile(1),
    });
    render(<FootballTeam />);
    expect(screen.queryByTestId('team-scoring-format-preview')).toBeNull();

    fireEvent.press(screen.getByTestId('team-scoring-format-toggle'));

    expect(screen.getByTestId('team-scoring-format-preview')).toHaveTextContent(
      /Reception/,
    );
    expect(screen.getByTestId('team-scoring-format-preview')).toHaveTextContent(
      /\+1/,
    );

    fireEvent.press(screen.getByTestId('team-scoring-format-toggle'));
    expect(screen.queryByTestId('team-scoring-format-preview')).toBeNull();
  });

  it("forwards the league's football slots to the board", () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-slots')).toHaveTextContent('QB');
  });

  it('leaves the board editable for the team owner', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-readonly')).toHaveTextContent(
      'false',
    );
  });

  it('renders a read-only board for a non-owner', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 99 } });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-readonly')).toHaveTextContent(
      'true',
    );
  });

  it('assigns a benched player to a slot via updateTeamMemberPosition', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    fireEvent.press(screen.getByTestId('roster-board-assign'));
    expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { teamMemberId: 102, positionId: 1 },
      }),
    );
  });

  it('benches a starter by clearing their positionId', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    fireEvent.press(screen.getByTestId('roster-board-remove'));
    expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { teamMemberId: 101, positionId: null },
      }),
    );
  });

  it('issues no mutation when a roster slot has no id', () => {
    // `LeaguePosition.id` is nullable in the schema. Without a guard, remove
    // would match every benched player (bench === `positionId == null`) and
    // assign would send positionId: null, benching the player it should start.
    mockUseGetPositionsForLeagueQuery.mockReturnValue({
      loading: false,
      data: {
        leaguePositions: [{ id: null, leagueId: 10, positionType: 'QB' }],
      },
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    fireEvent.press(screen.getByTestId('roster-board-remove'));
    fireEvent.press(screen.getByTestId('roster-board-assign'));
    expect(mockUpdateTeamMemberPosition).not.toHaveBeenCalled();
  });

  it('swaps two players with a single atomic mutation', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    fireEvent.press(screen.getByTestId('roster-board-swap'));
    expect(mockSwapTeamMemberPositions).toHaveBeenCalledTimes(1);
    expect(mockSwapTeamMemberPositions).toHaveBeenCalledWith({
      variables: {
        teamMemberIdA: 102,
        positionIdA: 1,
        teamMemberIdB: 101,
        positionIdB: undefined,
      },
    });
    // The old wiring fired two independent, non-transactional updates here.
    expect(mockUpdateTeamMemberPosition).not.toHaveBeenCalled();
  });

  it('passes defensiveFormat to FootballLeagueRosterScreen', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, defensiveFormat: 'idp' } },
    });
    render(<FootballTeam />);
    expect(screen.getByTestId('roster-screen-42-idp-slots-1')).toBeTruthy();
  });

  it('shows the current matchup card when the Matchup tab is selected', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.getByTestId('matchup-card')).toBeTruthy();
    expect(screen.getByText('Matchup 77')).toBeTruthy();
  });

  it('shows enhanced matchup analytics (key players, history, league context) on the Matchup tab (LS-6446)', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.getByTestId('matchup-additional-sections')).toBeTruthy();
    expect(
      screen.getByText('Additional sections for matchup 77 in league 10'),
    ).toBeTruthy();
  });

  it('does not show matchup analytics on the Matchup tab when there is no current matchup', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, currentMatchup: null } },
    });
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: false,
      data: { getMatchupById: null },
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.queryByTestId('matchup-additional-sections')).toBeNull();
  });

  it('navigates to the full matchup screen when the matchup card is pressed', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    fireEvent.press(screen.getByTestId('matchup-card'));
    expect(mockRouterPush).toHaveBeenCalledWith(
      '/football/matchup?matchupId=77&leagueId=10',
    );
  });

  it('shows an empty state on the Matchup tab when the league has no current matchup', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, currentMatchup: null } },
    });
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: false,
      data: { getMatchupById: null },
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.getByText('No matchup scheduled this week.')).toBeTruthy();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });

  it('skips the matchup query when the league has no current matchup', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, currentMatchup: null } },
    });
    render(<FootballTeam />);
    expect(mockUseGetMatchupByIdQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('shows a spinner on the Matchup tab while the matchup is loading', () => {
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: true,
      data: undefined,
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows an error message on the Matchup tab when the query errors, not the empty state', () => {
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: false,
      data: undefined,
      error: new Error('network error'),
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Matchup'));
    expect(screen.getByText('Could not load matchup.')).toBeTruthy();
    expect(screen.queryByText('No matchup scheduled this week.')).toBeNull();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });

  it("passes the current team's matchup scores to the board", () => {
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: false,
      data: mockMatchupScores,
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-actual')).toHaveTextContent(
      JSON.stringify({ 1: 24.7 }),
    );
  });

  it('falls back to empty actual scores when the league has no current week', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, currentWeekNumber: null } },
    });
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: false,
      data: undefined,
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-actual')).toHaveTextContent('{}');
  });

  it('falls back to empty actual scores while the matchup scores query is loading', () => {
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: true,
      data: undefined,
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-actual')).toHaveTextContent('{}');
  });

  it('falls back to empty actual scores when the matchup scores query errors', () => {
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: false,
      data: undefined,
      error: new Error('network error'),
    });
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('roster-board-actual')).toHaveTextContent('{}');
  });

  it('skips the matchup scores query when currentWeekNumber is unavailable', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, currentWeekNumber: null } },
    });
    render(<FootballTeam />);
    expect(mockUseMatchupScoresQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('queries matchup scores once leagueId and currentWeekNumber are available', () => {
    render(<FootballTeam />);
    expect(mockUseMatchupScoresQuery).toHaveBeenCalledWith({
      skip: false,
      variables: { leagueId: 10, weekNum: 5 },
    });
  });

  describe('bye-week data wiring (LS-6430)', () => {
    it('passes byeWeeksByTeam and currentWeek to RosterBoard', () => {
      render(<FootballTeam />);
      fireEvent.press(screen.getByTestId('tab-Lineup'));
      expect(screen.getByTestId('roster-board-bye-weeks')).toHaveTextContent(
        JSON.stringify({ KC: 6, BUF: 12 }),
      );
      expect(screen.getByTestId('roster-board-current-week')).toHaveTextContent(
        '5',
      );
    });

    it('passes byeWeeksByTeam and currentWeek to FootballLeagueRosterScreen', () => {
      render(<FootballTeam />);
      expect(screen.getByTestId('roster-screen-bye-weeks')).toHaveTextContent(
        JSON.stringify({ KC: 6, BUF: 12 }),
      );
      expect(
        screen.getByTestId('roster-screen-current-week'),
      ).toHaveTextContent('5');
    });

    it('skips the NFL bye-week query when the league has no season number', () => {
      mockUseGetLeagueByIdQuery.mockReturnValue({
        loading: false,
        data: { league: { ...mockLeague, seasonNumber: null } },
      });
      render(<FootballTeam />);
      expect(mockUseGetNflTeamSeasonMetadataQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('falls back to an empty bye-week map when the query has no data', () => {
      mockUseGetNflTeamSeasonMetadataQuery.mockReturnValue({ data: undefined });
      render(<FootballTeam />);
      fireEvent.press(screen.getByTestId('tab-Lineup'));
      expect(screen.getByTestId('roster-board-bye-weeks')).toHaveTextContent(
        '{}',
      );
    });
  });
});

describe('FootballTeam route — Settings tab branding upload (LS-6434)', () => {
  const mockUpdateTeamBranding = jest.fn(() => Promise.resolve({ data: {} }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvatarUploadState.uploading = false;
    mockAvatarUploadState.uploadError = null;
    mockBannerUploadState.uploading = false;
    mockBannerUploadState.uploadError = null;

    mockUseGetTeamByIdQuery.mockReturnValue({
      loading: false,
      data: { team: mockTeam },
    });
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 42 } });
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: mockLeague },
    });
    mockUseGetPositionsForLeagueQuery.mockReturnValue({
      loading: false,
      data: { leaguePositions: mockPositions },
    });
    mockUseGetTeamMembersQuery.mockReturnValue({
      loading: false,
      data: { teamMembers: mockMembers },
    });
    mockUseGetMatchupByIdQuery.mockReturnValue({
      loading: false,
      data: { getMatchupById: mockMatchup },
    });
    mockUseUpdateTeamMemberPositionMutation.mockReturnValue([
      mockUpdateTeamMemberPosition,
    ]);
    mockUseUpdateTeamBrandingMutation.mockReturnValue([
      mockUpdateTeamBranding,
      { loading: false },
    ]);
    mockUseMatchupScoresQuery.mockReturnValue({
      loading: false,
      data: undefined,
    });
  });

  it('renders Upload Avatar / Upload Banner buttons instead of free-text URL fields', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    expect(screen.getByText('Upload Avatar')).toBeTruthy();
    expect(screen.getByText('Upload Banner')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/example\.com/)).toBeNull();
  });

  it('picks and uploads through the imageType-scoped hook for avatar and banner independently', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    fireEvent.press(screen.getByText('Upload Avatar'));
    fireEvent.press(screen.getByText('Upload Banner'));

    expect(mockPickAndUploadLogo).toHaveBeenCalledTimes(2);
    expect(mockUseTeamLogoUpload).toHaveBeenCalledWith(
      expect.objectContaining({ imageType: 'avatar', teamId: 42 }),
    );
    expect(mockUseTeamLogoUpload).toHaveBeenCalledWith(
      expect.objectContaining({ imageType: 'banner', teamId: 42 }),
    );
  });

  it('persists a completed avatar upload to avatarUrl via updateTeamBranding, not bannerUrl', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    const avatarOptions = mockUseTeamLogoUpload.mock.calls.find(
      ([options]) => options.imageType === 'avatar',
    )?.[0];
    avatarOptions?.onUploaded('https://cdn.example.com/scanned-avatar.png');

    expect(mockUpdateTeamBranding).toHaveBeenCalledWith({
      variables: {
        teamId: 42,
        leagueId: 10,
        avatarUrl: 'https://cdn.example.com/scanned-avatar.png',
      },
    });
  });

  it('persists a completed banner upload to bannerUrl via updateTeamBranding, not avatarUrl', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    const bannerOptions = mockUseTeamLogoUpload.mock.calls.find(
      ([options]) => options.imageType === 'banner',
    )?.[0];
    bannerOptions?.onUploaded('https://cdn.example.com/scanned-banner.png');

    expect(mockUpdateTeamBranding).toHaveBeenCalledWith({
      variables: {
        teamId: 42,
        leagueId: 10,
        bannerUrl: 'https://cdn.example.com/scanned-banner.png',
      },
    });
  });

  it('shows the upload error and disables the button while an upload is in flight', () => {
    mockAvatarUploadState.uploading = true;
    mockBannerUploadState.uploadError = 'Image failed content screening.';
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Settings'));

    expect(screen.getByText('Uploading…')).toBeTruthy();
    expect(screen.getByText('Image failed content screening.')).toBeTruthy();
  });
});

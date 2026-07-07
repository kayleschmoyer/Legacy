import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import BaseballTeam, { TeamIdHeader } from './[teamId]';

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

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    BRAND_NAVY_LIGHT: MOCK_BRAND_NAVY_LIGHT,
    UnifiedLoadingPanel: () => <View testID="loading-panel" />,
    TeamBrandingControl: () => <View testID="team-branding-control" />,
  };
});

jest.mock('../../../../common/scoring', () => ({
  applyMultiplierGroups: jest.fn(() => ({
    batting: {},
    fielding: {},
    pitching: {},
  })),
}));

jest.mock('../../../../common/models/Models', () => ({
  isBatter: jest.fn(() => false),
  isBattingSlot: jest.fn(() => false),
  isPitcher: jest.fn(() => false),
  isPitchingSlot: jest.fn(() => false),
  PositionSlot: { Dh: 'DH' },
}));

jest.mock('../../../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../../../common/utilities/RouteUtils', () => ({
  toIntId: (v: unknown) => (typeof v === 'string' ? parseInt(v, 10) : null),
}));

// Captures the projections prop from the most recent LineupEditor render.
let lastProjections: Record<number, number> | undefined;

jest.mock('../../../../features/roster/LineupEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LineupEditor: (props: {
      projections?: Record<number, number>;
      [key: string]: unknown;
    }) => {
      lastProjections = props.projections;
      return <View testID="lineup-editor" />;
    },
  };
});

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
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
const mockPositions = [{ id: 1, leagueId: 5, positionType: 'C' }];

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
const mockUseUpdateTeamMemberPositionMutation = jest.fn(() => [jest.fn()]);

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
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUseUpdateTeamMemberPositionMutation(...args),
}));

// ── Subscription mock ─────────────────────────────────────────────────────────

const mockUseSubscription = jest.fn(() => ({ isPremium: true }));

jest.mock('../../../../features/subscription/useSubscription', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BaseballTeam route — projection gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastProjections = undefined;

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
    mockUseUpdateTeamMemberPositionMutation.mockReturnValue([jest.fn()]);
  });

  it('passes empty projections to LineupEditor for free users on Lineup tab', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false });
    render(<BaseballTeam />);
    expect(screen.getByTestId('lineup-editor')).toBeTruthy();
    expect(lastProjections).toEqual({});
  });

  it('passes empty projections to LineupEditor for free users on Rotation tab', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false });
    render(<BaseballTeam />);
    fireEvent.press(screen.getByTestId('tab-Rotation'));
    expect(screen.getByTestId('lineup-editor')).toBeTruthy();
    expect(lastProjections).toEqual({});
  });

  it('passes empty projections for premium users too (matchup feature dormant — team=[] produces no stats)', () => {
    mockUseSubscription.mockReturnValue({ isPremium: true });
    render(<BaseballTeam />);
    expect(screen.getByTestId('lineup-editor')).toBeTruthy();
    // The gate opens for premium users but team=[] means hitters=[] → projections still {}
    expect(lastProjections).toEqual({});
  });
});

describe('BaseballTeam route — team identity header (LS-8313)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastProjections = undefined;

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
    mockUseUpdateTeamMemberPositionMutation.mockReturnValue([jest.fn()]);
    mockUseSubscription.mockReturnValue({ isPremium: true });
  });

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

  it('TeamIdHeader still renders the team name alongside the avatar/letter-fallback (AC5)', () => {
    render(<TeamIdHeader />);
    expect(screen.getByText('Test Team')).toBeTruthy();
    expect(screen.getByTestId('team-avatar-fallback')).toHaveTextContent('T');
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import FootballTeam from './[teamId]';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ teamId: '42' })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    UnifiedLoadingPanel: () => <View testID="loading-panel" />,
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
    const { View } = jest.requireActual<RNComponents>('react-native');
    return {
      FootballLeagueRosterScreen: ({
        teamId,
        defensiveFormat,
      }: {
        teamId: number;
        defensiveFormat?: string | null;
      }) => (
        <View testID={`roster-screen-${teamId}-${defensiveFormat ?? 'dst'}`} />
      ),
    };
  },
);

jest.mock('../../../../features/roster/LineupEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LineupEditor: () => <View testID="lineup-editor" />,
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
};

const mockPositions = [{ id: 1, leagueId: 10, positionType: 'QB' }];

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
const mockUseUpdateTeamMemberPositionMutation = jest.fn(() => [jest.fn()]);
const mockUseUpdateTeamBrandingMutation = jest.fn(() => [
  jest.fn(),
  { loading: false },
]);

jest.mock('../../../../api/db/graphql.generated', () => ({
  useGetTeamByIdQuery: (...args: unknown[]) => mockUseGetTeamByIdQuery(...args),
  useGetUserTeamIdQuery: (...args: unknown[]) =>
    mockUseGetUserTeamIdQuery(...args),
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockUseGetLeagueByIdQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockUseGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: (...args: unknown[]) =>
    mockUseGetTeamMembersQuery(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUseUpdateTeamMemberPositionMutation(...args),
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
    mockUseUpdateTeamMemberPositionMutation.mockReturnValue([jest.fn()]);
    mockUseUpdateTeamBrandingMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
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

  it('renders Roster and Lineup tabs for non-owner', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({ data: { userTeamId: 99 } });
    render(<FootballTeam />);
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('Lineup')).toBeTruthy();
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('renders Settings tab for owner', () => {
    render(<FootballTeam />);
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('Lineup')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('shows roster screen on Roster tab by default', () => {
    render(<FootballTeam />);
    expect(screen.getByTestId('roster-screen-42-dst')).toBeTruthy();
  });

  it('shows lineup editor when Lineup tab is selected', () => {
    render(<FootballTeam />);
    fireEvent.press(screen.getByTestId('tab-Lineup'));
    expect(screen.getByTestId('lineup-editor')).toBeTruthy();
  });

  it('passes defensiveFormat to FootballLeagueRosterScreen', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      loading: false,
      data: { league: { ...mockLeague, defensiveFormat: 'idp' } },
    });
    render(<FootballTeam />);
    expect(screen.getByTestId('roster-screen-42-idp')).toBeTruthy();
  });
});

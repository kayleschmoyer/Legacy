import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { FootballLeagueRosterScreen } from './FootballLeagueRosterScreen';
import * as graphqlLib from '../../../api/db/graphql.generated';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

const mockPlayer = {
  id: 1,
  firstName: 'Josh',
  lastName: 'Allen',
  eligiblePositions: ['QB'],
};

const mockMember = { id: 101, playerId: 1, player: mockPlayer };

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetTeamMembersQuery: jest.fn(() => ({
    data: { teamMembers: [mockMember] },
    loading: false,
    error: undefined,
  })),
}));

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Card: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    ScrollView: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
    Separator: () => <View testID="separator" />,
    Spinner: ({ testID }: { testID?: string; [key: string]: unknown }) => (
      <View testID={testID ?? 'spinner'} />
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

describe('FootballLeagueRosterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: { teamMembers: [mockMember] },
      loading: false,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
  });

  it('shows spinner while loading', () => {
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
    render(<FootballLeagueRosterScreen teamId={1} />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows loading text while loading', () => {
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
    render(<FootballLeagueRosterScreen teamId={1} />);
    expect(screen.getByText('Loading roster…')).toBeTruthy();
  });

  it('shows error message on fetch failure', () => {
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Query failed') as ReturnType<
        typeof graphqlLib.useGetTeamMembersQuery
      >['error'],
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
    render(<FootballLeagueRosterScreen teamId={1} />);
    expect(screen.getByText(/Failed to load roster\./)).toBeTruthy();
  });

  it('renders QB slot header in DST format', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
    // QB appears as slot label and as player position badge
    expect(screen.getAllByText('QB').length).toBeGreaterThan(0);
  });

  it('renders DST slot in DST format', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
    expect(screen.getAllByText('DST').length).toBeGreaterThan(0);
  });

  it('renders DL slot in IDP format', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="idp" />);
    expect(screen.getAllByText('DL').length).toBeGreaterThan(0);
  });

  it('does not render DST slot in IDP format', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="idp" />);
    expect(screen.queryByText('DST')).toBeNull();
  });

  it('renders player name in roster', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
    expect(screen.getByText('Josh Allen')).toBeTruthy();
  });
});

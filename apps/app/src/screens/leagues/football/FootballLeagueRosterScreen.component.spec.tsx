import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import * as graphqlLib from '@legacy-sports/graphql';
import { FootballLeagueRosterScreen } from './FootballLeagueRosterScreen';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

const mockPlayer = {
  id: 1,
  firstName: 'Josh',
  lastName: 'Allen',
  eligiblePositions: ['QB'],
};

const mockMember = { id: 101, playerId: 1, player: mockPlayer };

jest.mock('@legacy-sports/graphql', () => ({
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
    createTokens: (tokens: unknown) => tokens,
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
      error: new Error('Query failed'),
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

  describe('defensive format badge (LS-6453)', () => {
    it('shows a DST label when the league uses DST scoring', () => {
      render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
      expect(screen.getByTestId('roster-defensive-format-badge')).toBeTruthy();
      expect(screen.getByText(/DST League/)).toBeTruthy();
    });

    it('shows an IDP label when the league uses IDP scoring', () => {
      render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="idp" />);
      expect(screen.getByText(/IDP League/)).toBeTruthy();
    });

    it('defaults to the DST label when defensiveFormat is not provided', () => {
      render(<FootballLeagueRosterScreen teamId={1} />);
      expect(screen.getByText(/DST League/)).toBeTruthy();
    });
  });

  it('renders player name in roster', () => {
    render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
    expect(screen.getByText('Josh Allen')).toBeTruthy();
  });

  describe('bye-week badge (LS-6430)', () => {
    const byeMember = {
      id: 102,
      playerId: 2,
      player: {
        id: 2,
        firstName: 'Pat',
        lastName: 'Mahomes',
        eligiblePositions: ['QB'],
        nflTeam: 'KC',
      },
    };

    it('shows a BYE badge next to a roster member whose team is on bye this week', () => {
      jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
        data: { teamMembers: [byeMember] },
        loading: false,
        error: undefined,
      } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
      render(
        <FootballLeagueRosterScreen
          teamId={1}
          defensiveFormat="dst"
          byeWeeksByTeam={{ KC: 6 }}
          currentWeek={6}
        />,
      );
      expect(screen.getByText('BYE')).toBeTruthy();
    });

    it('does not show a BYE badge when the member team is not on bye this week', () => {
      jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
        data: { teamMembers: [byeMember] },
        loading: false,
        error: undefined,
      } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
      render(
        <FootballLeagueRosterScreen
          teamId={1}
          defensiveFormat="dst"
          byeWeeksByTeam={{ KC: 12 }}
          currentWeek={6}
        />,
      );
      expect(screen.queryByText('BYE')).toBeNull();
    });

    it('does not show a BYE badge when byeWeeksByTeam/currentWeek are not passed', () => {
      jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
        data: { teamMembers: [byeMember] },
        loading: false,
        error: undefined,
      } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);
      render(<FootballLeagueRosterScreen teamId={1} defensiveFormat="dst" />);
      expect(screen.queryByText('BYE')).toBeNull();
    });
  });

  it('groups a member by assigned positionId, not by first eligible position', () => {
    const wrInFlex = {
      id: 201,
      playerId: 2,
      positionId: 55,
      player: {
        id: 2,
        firstName: 'CeeDee',
        lastName: 'Lamb',
        eligiblePositions: ['WR'],
      },
    };
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: { teamMembers: [wrInFlex] },
      loading: false,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);

    render(
      <FootballLeagueRosterScreen
        teamId={1}
        defensiveFormat="dst"
        rosterSlots={[{ id: 55, leagueId: 1, positionType: 'FLEX' }]}
      />,
    );

    const flexCard = screen.getByTestId('flex-card');
    expect(within(flexCard).getByText('CeeDee Lamb')).toBeTruthy();
    const wrCard = screen.getByTestId('wr-card');
    expect(within(wrCard).queryByText('CeeDee Lamb')).toBeNull();
  });

  it('benches a member with positionId=null even when eligible at a starting slot', () => {
    const benchedQb = {
      id: 202,
      playerId: 3,
      positionId: null,
      player: {
        id: 3,
        firstName: 'Bench',
        lastName: 'Guy',
        eligiblePositions: ['QB'],
      },
    };
    jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
      data: { teamMembers: [benchedQb] },
      loading: false,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);

    render(
      <FootballLeagueRosterScreen
        teamId={1}
        defensiveFormat="dst"
        rosterSlots={[{ id: 9, leagueId: 1, positionType: 'QB' }]}
      />,
    );

    const bnCard = screen.getByTestId('bn-card');
    expect(within(bnCard).getByText('Bench Guy')).toBeTruthy();
    const qbCard = screen.getByTestId('qb-card');
    expect(within(qbCard).queryByText('Bench Guy')).toBeNull();
  });

  describe('multi-slot grouping by configured position (LS-6449)', () => {
    const qbAllen = {
      id: 301,
      playerId: 10,
      positionId: 21,
      player: {
        id: 10,
        firstName: 'Josh',
        lastName: 'Allen',
        eligiblePositions: ['QB'],
      },
    };
    const qbMahomes = {
      id: 302,
      playerId: 11,
      positionId: 20,
      player: {
        id: 11,
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB'],
      },
    };
    const twoQbSlots = [
      { id: 20, leagueId: 1, positionType: 'QB' },
      { id: 21, leagueId: 1, positionType: 'QB' },
    ];

    it('shows both QBs as filled in a 2-QB league even when their positionIds are mismatched to slot array order', () => {
      jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
        data: { teamMembers: [qbAllen, qbMahomes] },
        loading: false,
        error: undefined,
      } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);

      render(
        <FootballLeagueRosterScreen
          teamId={1}
          defensiveFormat="dst"
          rosterSlots={twoQbSlots}
        />,
      );

      const slotForMahomes = screen.getByTestId('qb-20-card');
      expect(within(slotForMahomes).getByText('Patrick Mahomes')).toBeTruthy();
      expect(within(slotForMahomes).queryByText('Empty slot')).toBeNull();

      const slotForAllen = screen.getByTestId('qb-21-card');
      expect(within(slotForAllen).getByText('Josh Allen')).toBeTruthy();
      expect(within(slotForAllen).queryByText('Empty slot')).toBeNull();
    });

    it('marks only the genuinely unfilled QB slot as Empty when just one of two QB slots has a member', () => {
      jest.mocked(graphqlLib.useGetTeamMembersQuery).mockReturnValue({
        data: { teamMembers: [qbMahomes] },
        loading: false,
        error: undefined,
      } as ReturnType<typeof graphqlLib.useGetTeamMembersQuery>);

      render(
        <FootballLeagueRosterScreen
          teamId={1}
          defensiveFormat="dst"
          rosterSlots={twoQbSlots}
        />,
      );

      const filledSlot = screen.getByTestId('qb-20-card');
      expect(within(filledSlot).getByText('Patrick Mahomes')).toBeTruthy();

      const emptySlot = screen.getByTestId('qb-21-card');
      expect(within(emptySlot).getByText('Empty slot')).toBeTruthy();
    });
  });
});

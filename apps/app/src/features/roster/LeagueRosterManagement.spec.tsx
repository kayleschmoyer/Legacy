import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { LeagueRosterManagement } from './LeagueRosterManagement';
import type {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components', () => ({
  ALLOWED_POSITIONS: {
    SP: ['SP'],
    RP: ['RP'],
    C: ['C'],
    '1B': ['1B'],
    '2B': ['2B'],
    SS: ['SS'],
    '3B': ['3B'],
    OF: ['LF', 'CF', 'RF', 'OF'],
    DH: ['DH'],
    IF: ['1B', '2B', 'SS', '3B'],
    XDH: [
      'SP',
      'RP',
      'C',
      '1B',
      '2B',
      'SS',
      '3B',
      'LF',
      'CF',
      'RF',
      'OF',
      'DH',
    ],
  },
  PITCHING_POSITIONS: new Set(['SP', 'RP']),
  getPositionDisplayName: (pos: string) => pos,
  getPlayerName: (member: {
    player?: { firstName?: string | null; lastName?: string | null } | null;
  }) =>
    `${member.player?.firstName ?? ''} ${member.player?.lastName ?? ''}`.trim() ||
    'Unknown',
}));

jest.mock('../scoring', () => ({
  useTeamMemberProjections: () => ({
    projections: {},
    loading: false,
    error: undefined,
  }),
}));

jest.mock('../../common/types/app-types', () => ({
  normalizeNumericIdentifier: (id: unknown) => id,
}));

jest.mock('tamagui', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) => <RNText onPress={disabled ? undefined : onPress}>{children}</RNText>,
    Card: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => <RNText onPress={onPress}>{children}</RNText>,
    H4: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <RNText>{children}</RNText>,
    H5: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <RNText>{children}</RNText>,
    ScrollView: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
    Separator: () => <View testID="separator" />,
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <RNText {...rest}>{children}</RNText>,
    XStack: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
    YStack: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
  };
});

// ── Test data ────────────────────────────────────────────────────────────────

const MOCK_POSITIONS: LeaguePositionFragment[] = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 10, positionType: 'SP' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 10, positionType: 'C' },
  { __typename: 'LeaguePosition', id: 3, leagueId: 10, positionType: 'SS' },
];

const MOCK_PLAYERS: TeamMemberFragment[] = [
  {
    __typename: 'TeamMember',
    id: 101,
    playerId: 201,
    positionId: 1,
    teamId: 50,
    leagueId: 10,
    onTradeBlock: false,
    player: {
      __typename: 'Player',
      id: 201,
      firstName: 'Clayton',
      lastName: 'Kershaw',
      brefId: 'kershcl01',
      eligiblePositions: ['SP'],
    },
  },
  {
    __typename: 'TeamMember',
    id: 102,
    playerId: 202,
    positionId: null,
    teamId: 50,
    leagueId: 10,
    onTradeBlock: false,
    player: {
      __typename: 'Player',
      id: 202,
      firstName: 'Mookie',
      lastName: 'Betts',
      brefId: 'bettsmo01',
      eligiblePositions: ['SS', '2B', 'RF'],
    },
  },
  {
    __typename: 'TeamMember',
    id: 103,
    playerId: 203,
    positionId: null,
    teamId: 50,
    leagueId: 10,
    onTradeBlock: false,
    player: {
      __typename: 'Player',
      id: 203,
      firstName: 'Shohei',
      lastName: 'Ohtani',
      brefId: 'ohtansh01',
      eligiblePositions: ['SP', 'DH'],
    },
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueRosterManagement', () => {
  const defaultProps = {
    positions: MOCK_POSITIONS,
    teamPlayers: MOCK_PLAYERS,
    onPlayerAssign: jest.fn(),
    onPlayerRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders position slots', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      // Position names may appear in multiple places (slots + player eligible positions)
      expect(screen.getAllByText('SP').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('C').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('SS').length).toBeGreaterThanOrEqual(1);
    });

    it('renders assigned player names', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      expect(screen.getByText('Clayton Kershaw')).toBeTruthy();
    });

    it('shows Empty label for unassigned positions', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      const emptyTexts = screen.getAllByText('Empty');
      expect(emptyTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('renders bench players', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      // Mookie Betts should be on bench (no positionId assigned to a matching position)
      expect(screen.getByText('Mookie Betts')).toBeTruthy();
    });

    it('renders dual-eligible player', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      // Ohtani has SP + DH = dual eligible, may appear in multiple pools
      expect(
        screen.getAllByText('Shohei Ohtani').length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('shows Remove button for assigned players', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      const removeButtons = screen.getAllByText('Remove');
      expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('interactions', () => {
    it('calls onPlayerRemove when Remove button is pressed', () => {
      render(<LeagueRosterManagement {...defaultProps} />);
      const removeButtons = screen.getAllByText('Remove');
      fireEvent.press(removeButtons[0]);
      expect(defaultProps.onPlayerRemove).toHaveBeenCalled();
    });
  });
});

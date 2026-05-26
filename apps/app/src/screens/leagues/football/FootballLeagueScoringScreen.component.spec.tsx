import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { FootballLeagueScoringScreen } from './FootballLeagueScoringScreen';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  configureNext: jest.fn(),
  Presets: { easeInEaseOut: {} },
}));

const mockStat = {
  id: 1,
  displayName: 'Passing Yards',
  group: 'passing',
  multiplier: 0.04,
  defaultMultiplier: 0.04,
  leagueMultiplier: null,
  description: null,
};

jest.mock('@legacy-sports/scoring', () => ({
  collectProfileStats: jest.fn(() => [mockStat]),
  createInitialValues: jest.fn(() => ({ 1: '0.04' })),
  createInitialErrors: jest.fn(() => ({ 1: null })),
  validateStat: jest.fn(() => null),
  valuesToUpdates: jest.fn(() => []),
  FOOTBALL_SCORING_GROUP_ORDER: [
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ],
  SCORING_GROUP_COPY: {
    passing: {
      title: 'Passing',
      description: 'Passing yards, TDs, and interceptions.',
    },
    rushing: {
      title: 'Rushing',
      description: 'Rushing yards, TDs, and fumbles.',
    },
    receiving: {
      title: 'Receiving',
      description: 'Receptions (PPR), receiving yards, and TDs.',
    },
    kicking: {
      title: 'Kicking',
      description: 'Field goals by distance, extra points, and misses.',
    },
    defense: {
      title: 'Defense / Special Teams (D/ST)',
      description: 'Sacks, turnovers, TDs.',
    },
    idp: {
      title: 'Individual Defensive Players (IDP)',
      description: 'DL, LB, DB tackles, sacks.',
    },
  },
}));

const mockUpdateScoring = jest.fn().mockResolvedValue({});
jest.mock('../../../api/db/graphql.generated', () => ({
  useUpdateLeagueScoringProfileMutation: jest.fn(() => [
    mockUpdateScoring,
    { loading: false },
  ]),
}));

jest.mock('tamagui', () => {
  const { View, Text, TextInput } = jest.requireActual<
    typeof import('react-native')
  >('react-native') as RNComponents & {
    TextInput: React.ComponentType<{ value?: string; testID?: string }>;
  };
  return {
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <Text testID={testID} onPress={disabled ? undefined : onPress}>
        {children}
      </Text>
    ),
    Card: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    Input: ({
      value,
      testID,
    }: {
      value?: string;
      testID?: string;
      [key: string]: unknown;
    }) => <TextInput value={value} testID={testID} />,
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

const baseProps = {
  leagueId: 10,
  profile: { id: 1, leagueId: 10 } as Parameters<
    typeof FootballLeagueScoringScreen
  >[0]['profile'],
  loading: false,
  error: null,
  onRefetch: jest.fn().mockResolvedValue(undefined),
};

describe('FootballLeagueScoringScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows spinner while loading', () => {
    render(<FootballLeagueScoringScreen {...baseProps} loading={true} />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows loading text while loading', () => {
    render(<FootballLeagueScoringScreen {...baseProps} loading={true} />);
    expect(screen.getByText('Loading scoring profile…')).toBeTruthy();
  });

  it('shows error message when error is provided', () => {
    render(
      <FootballLeagueScoringScreen
        {...baseProps}
        error={new Error('Network failure')}
      />,
    );
    expect(screen.getByText(/Failed to load scoring profile\./)).toBeTruthy();
  });

  it('renders passing group header for DST format', () => {
    render(
      <FootballLeagueScoringScreen {...baseProps} defensiveFormat="dst" />,
    );
    expect(screen.getByText('Passing')).toBeTruthy();
  });

  it('renders defense group when defensiveFormat is dst', () => {
    const scoringLib = jest.requireMock<
      typeof import('@legacy-sports/scoring')
    >('@legacy-sports/scoring');
    jest
      .mocked(scoringLib.collectProfileStats)
      .mockReturnValue([
        { ...mockStat, id: 2, displayName: 'Sacks', group: 'defense' },
      ]);
    render(
      <FootballLeagueScoringScreen {...baseProps} defensiveFormat="dst" />,
    );
    expect(screen.getByText('Defense / Special Teams (D/ST)')).toBeTruthy();
  });

  it('renders IDP group header when defensiveFormat is idp', () => {
    const scoringLib = jest.requireMock<
      typeof import('@legacy-sports/scoring')
    >('@legacy-sports/scoring');
    jest
      .mocked(scoringLib.collectProfileStats)
      .mockReturnValue([
        { ...mockStat, id: 3, displayName: 'Tackles', group: 'idp' },
      ]);
    render(
      <FootballLeagueScoringScreen {...baseProps} defensiveFormat="idp" />,
    );
    expect(screen.getByText('Individual Defensive Players (IDP)')).toBeTruthy();
  });

  it('renders Save Changes button', () => {
    render(<FootballLeagueScoringScreen {...baseProps} />);
    expect(screen.getByText('Save Changes')).toBeTruthy();
  });
});

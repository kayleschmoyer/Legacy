import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNTextComponent } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { MatchupStatus } from '@legacy-sports/graphql';
import type { AppMatchupFragment } from '@legacy-sports/graphql';
import { MatchupList } from './MatchupList';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@tamagui/lucide-icons', () => ({
  Activity: () => null,
  CheckCircle: () => null,
  Clock: () => null,
  XCircle: () => null,
}));

jest.mock('tamagui', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    styled: (Component: unknown) => Component,
    Card: Object.assign(
      ({
        children,
        onPress,
      }: {
        children: React.ReactNode;
        onPress?: () => void;
        [key: string]: unknown;
      }) => (
        <RNText onPress={onPress} testID="matchup-card">
          {children}
        </RNText>
      ),
      {
        Header: ({
          children,
        }: {
          children: React.ReactNode;
          [key: string]: unknown;
        }) => <View>{children}</View>,
      },
    ),
    H4: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <RNText>{children}</RNText>,
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

const MOCK_MATCHUPS: AppMatchupFragment[] = [
  {
    __typename: 'Matchup',
    id: '1',
    weekNumber: 1,
    leagueId: 10,
    team1Id: 1,
    team2Id: 2,
    team1Score: 90.0,
    team2Score: 85.0,
    status: MatchupStatus.Completed,
    gamesPerMatchup: 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 7,
    startTime: null,
    endTime: null,
    scoringChangeLog: [],
  },
  {
    __typename: 'Matchup',
    id: '2',
    weekNumber: 2,
    leagueId: 10,
    team1Id: 3,
    team2Id: 4,
    team1Score: 70.5,
    team2Score: 65.2,
    status: MatchupStatus.InProgress,
    gamesPerMatchup: 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 3,
    startTime: null,
    endTime: null,
    scoringChangeLog: [],
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MatchupList', () => {
  it('shows loading message when loading is true', () => {
    render(<MatchupList matchups={[]} loading={true} />);
    expect(screen.getByText('Loading matchups...')).toBeTruthy();
  });

  it('shows default empty message when matchups array is empty', () => {
    render(<MatchupList matchups={[]} />);
    expect(screen.getByText('No matchups found')).toBeTruthy();
  });

  it('shows custom empty message when provided', () => {
    render(<MatchupList matchups={[]} emptyMessage="No games this week" />);
    expect(screen.getByText('No games this week')).toBeTruthy();
  });

  it('renders matchup cards for each matchup', () => {
    render(<MatchupList matchups={MOCK_MATCHUPS} />);
    const cards = screen.getAllByTestId('matchup-card');
    expect(cards).toHaveLength(2);
  });

  it('displays week numbers for matchups', () => {
    render(<MatchupList matchups={MOCK_MATCHUPS} />);
    expect(screen.getByText('Week 1')).toBeTruthy();
    expect(screen.getByText('Week 2')).toBeTruthy();
  });

  it('displays scores for matchups', () => {
    render(<MatchupList matchups={MOCK_MATCHUPS} />);
    expect(screen.getByText('90.00')).toBeTruthy();
    expect(screen.getByText('85.00')).toBeTruthy();
  });

  it('displays a status badge per matchup (LS-6320)', () => {
    render(<MatchupList matchups={MOCK_MATCHUPS} />);
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('calls onMatchupPress with the correct matchup when pressed', () => {
    const onMatchupPress = jest.fn();
    render(
      <MatchupList matchups={MOCK_MATCHUPS} onMatchupPress={onMatchupPress} />,
    );
    const cards = screen.getAllByTestId('matchup-card');
    fireEvent.press(cards[0]);
    expect(onMatchupPress).toHaveBeenCalledWith(MOCK_MATCHUPS[0]);
  });

  it('renders listHeaderComponent inside the list instead of requiring an outer wrapper (LS-6319)', () => {
    render(
      <MatchupList
        matchups={MOCK_MATCHUPS}
        listHeaderComponent={<RNTextComponent>Week Selector</RNTextComponent>}
      />,
    );
    expect(screen.getByText('Week Selector')).toBeTruthy();
  });
});

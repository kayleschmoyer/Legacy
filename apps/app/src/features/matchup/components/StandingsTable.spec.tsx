import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { StandingsTable } from './StandingsTable';
import type { TeamStanding } from '../../../api/db/graphql.generated';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    Card: Object.assign(
      ({ children }: { children: React.ReactNode; [key: string]: unknown }) => (
        <View>{children}</View>
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

const MOCK_STANDINGS: TeamStanding[] = [
  {
    __typename: 'TeamStanding',
    teamId: '1',
    teamName: 'Sluggers',
    wins: 8,
    losses: 2,
    ties: 0,
    winPercentage: 0.8,
    pointsFor: 950.5,
    pointsAgainst: 820.3,
    rank: 1,
    avatarUrl: null,
    primaryColor: '#1B3A5C',
    secondaryColor: null,
    divisionId: null,
    totalMatchups: 10,
    averagePointsFor: 95.05,
    averagePointsAgainst: 82.03,
  },
  {
    __typename: 'TeamStanding',
    teamId: '2',
    teamName: 'Home Runners',
    wins: 6,
    losses: 4,
    ties: 0,
    winPercentage: 0.6,
    pointsFor: 880.2,
    pointsAgainst: 850.1,
    rank: 2,
    avatarUrl: null,
    primaryColor: '#FF5733',
    secondaryColor: null,
    divisionId: null,
    totalMatchups: 10,
    averagePointsFor: 88.02,
    averagePointsAgainst: 85.01,
  },
  {
    __typename: 'TeamStanding',
    teamId: '3',
    teamName: 'The Underdogs',
    wins: 3,
    losses: 7,
    ties: 0,
    winPercentage: 0.3,
    pointsFor: 700.0,
    pointsAgainst: 900.0,
    rank: 7,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    totalMatchups: 10,
    averagePointsFor: 70.0,
    averagePointsAgainst: 90.0,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StandingsTable', () => {
  it('shows loading message when loading is true', () => {
    render(<StandingsTable standings={[]} loading={true} />);
    expect(screen.getByText('Loading standings...')).toBeTruthy();
  });

  it('shows empty message when standings array is empty', () => {
    render(<StandingsTable standings={[]} />);
    expect(screen.getByText('No standings data available')).toBeTruthy();
  });

  it('shows the Standings heading for empty state', () => {
    render(<StandingsTable standings={[]} />);
    expect(screen.getByText('Standings')).toBeTruthy();
  });

  it('renders League Standings header with data', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('League Standings')).toBeTruthy();
  });

  it('renders column headers', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Win %')).toBeTruthy();
    expect(screen.getByText('PF')).toBeTruthy();
    expect(screen.getByText('PA')).toBeTruthy();
    // W, L, T, # may match other content; verify at least one exists
    expect(screen.getAllByText('W').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('L').length).toBeGreaterThanOrEqual(1);
  });

  it('renders team names', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('Sluggers')).toBeTruthy();
    expect(screen.getByText('Home Runners')).toBeTruthy();
    expect(screen.getByText('The Underdogs')).toBeTruthy();
  });

  it('renders win/loss records', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    // Numbers may appear in rank and record columns; verify they exist
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('renders win percentages', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('0.800')).toBeTruthy();
    expect(screen.getByText('0.600')).toBeTruthy();
    expect(screen.getByText('0.300')).toBeTruthy();
  });

  it('renders points for and against', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('950.5')).toBeTruthy();
    expect(screen.getByText('820.3')).toBeTruthy();
  });

  it('renders team avatar initials when no avatar URL', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    // S = Sluggers initial, H = Home Runners initial
    expect(screen.getByText('S')).toBeTruthy();
    expect(screen.getByText('H')).toBeTruthy();
    // T overlaps with column header, so use getAllByText
    expect(screen.getAllByText('T').length).toBeGreaterThanOrEqual(1);
  });

  it('renders rank numbers', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText('1')).toBeTruthy();
    // 2 and 3 exist in standings rows
  });

  it('renders legend items', () => {
    render(<StandingsTable standings={MOCK_STANDINGS} />);
    expect(screen.getByText(/1st Place/)).toBeTruthy();
    expect(screen.getByText(/Playoff Position/)).toBeTruthy();
  });
});

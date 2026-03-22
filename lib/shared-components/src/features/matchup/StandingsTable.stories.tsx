import type { Meta, StoryObj } from '@storybook/react';
import { StandingsTable } from './StandingsTable';

type StandingRecord = React.ComponentProps<
  typeof StandingsTable
>['standings'][0];

function makeTeam(
  overrides: Partial<StandingRecord> & { teamId: string; teamName: string },
): StandingRecord {
  return {
    __typename: 'TeamStanding' as const,
    wins: 0,
    losses: 0,
    ties: 0,
    winPercentage: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    ...overrides,
  };
}

const mockStandings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 10,
    losses: 4,
    winPercentage: 0.714,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
  }),
  makeTeam({
    teamId: '2',
    teamName: 'Lightning',
    wins: 9,
    losses: 5,
    winPercentage: 0.643,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
  }),
  makeTeam({
    teamId: '3',
    teamName: 'Avalanche',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1120.8,
    pointsAgainst: 1090.1,
  }),
  makeTeam({
    teamId: '4',
    teamName: 'Cyclones',
    wins: 7,
    losses: 7,
    winPercentage: 0.5,
    pointsFor: 1050.0,
    pointsAgainst: 1060.0,
  }),
  makeTeam({
    teamId: '5',
    teamName: 'Blaze',
    wins: 5,
    losses: 9,
    winPercentage: 0.357,
    pointsFor: 980.4,
    pointsAgainst: 1150.3,
  }),
  makeTeam({
    teamId: '6',
    teamName: 'Frost',
    wins: 3,
    losses: 11,
    winPercentage: 0.214,
    pointsFor: 870.6,
    pointsAgainst: 1210.0,
  }),
];

const divisionStandings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 10,
    losses: 4,
    winPercentage: 0.714,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
    divisionId: 1,
  }),
  makeTeam({
    teamId: '2',
    teamName: 'Lightning',
    wins: 9,
    losses: 5,
    winPercentage: 0.643,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
    divisionId: 1,
  }),
  makeTeam({
    teamId: '3',
    teamName: 'Avalanche',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1120.8,
    pointsAgainst: 1090.1,
    divisionId: 1,
  }),
  makeTeam({
    teamId: '4',
    teamName: 'Cyclones',
    wins: 7,
    losses: 7,
    winPercentage: 0.5,
    pointsFor: 1050.0,
    pointsAgainst: 1060.0,
    divisionId: 2,
  }),
  makeTeam({
    teamId: '5',
    teamName: 'Blaze',
    wins: 5,
    losses: 9,
    winPercentage: 0.357,
    pointsFor: 980.4,
    pointsAgainst: 1150.3,
    divisionId: 2,
  }),
  makeTeam({
    teamId: '6',
    teamName: 'Frost',
    wins: 3,
    losses: 11,
    winPercentage: 0.214,
    pointsFor: 870.6,
    pointsAgainst: 1210.0,
    divisionId: 2,
  }),
];

const largeLeagueStandings: StandingRecord[] = Array.from(
  { length: 16 },
  (_, i) => {
    const wins = Math.max(0, 14 - i);
    const losses = i;
    return makeTeam({
      teamId: String(i + 1),
      teamName: `Team ${String.fromCharCode(65 + i)}`,
      wins,
      losses,
      winPercentage: wins / (wins + losses || 1),
      pointsFor: 1400 - i * 50,
      pointsAgainst: 900 + i * 40,
    });
  },
);

const tiebreakerStandings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
  }),
  makeTeam({
    teamId: '2',
    teamName: 'Lightning',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
  }),
  makeTeam({
    teamId: '3',
    teamName: 'Avalanche',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1120.8,
    pointsAgainst: 1090.1,
  }),
  makeTeam({
    teamId: '4',
    teamName: 'Cyclones',
    wins: 6,
    losses: 8,
    winPercentage: 0.429,
    pointsFor: 1050.0,
    pointsAgainst: 1060.0,
  }),
  makeTeam({
    teamId: '5',
    teamName: 'Blaze',
    wins: 6,
    losses: 8,
    winPercentage: 0.429,
    pointsFor: 980.4,
    pointsAgainst: 1150.3,
  }),
];

const meta: Meta<typeof StandingsTable> = {
  title: 'Features/Matchup/StandingsTable',
  component: StandingsTable,
  parameters: {
    docs: {
      description: {
        component:
          'Sortable league standings table with support for division grouping, responsive columns, and loading/error/empty states.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    standings: mockStandings,
  },
};

export const Loading: Story = {
  args: {
    standings: [],
    loading: true,
  },
};

export const Error: Story = {
  args: {
    standings: [],
    error: new globalThis.Error('Failed to fetch standings'),
  },
};

export const Empty: Story = {
  args: {
    standings: [],
  },
};

export const WithDivisions: Story = {
  args: {
    standings: divisionStandings,
  },
};

export const LargeLeague: Story = {
  args: {
    standings: largeLeagueStandings,
  },
};

export const TiebreakerScenario: Story = {
  args: {
    standings: tiebreakerStandings,
  },
};

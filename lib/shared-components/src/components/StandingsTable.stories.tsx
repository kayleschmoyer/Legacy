import type { Meta, StoryObj } from '@storybook/react';
import { StandingsTable } from './StandingsTable';

const meta: Meta<typeof StandingsTable> = {
  title: 'Components/StandingsTable',
  component: StandingsTable,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Cooperstown Society — Week 14',
    rows: [
      {
        rank: 1,
        teamAbbr: 'NYY',
        teamName: 'Bronx Bombers',
        wins: 11,
        losses: 3,
        streak: 'W4',
      },
      {
        rank: 2,
        teamAbbr: 'BRK',
        teamName: 'Brooklyn Bridegrooms',
        wins: 10,
        losses: 4,
        gamesBack: 1,
        streak: 'W2',
      },
      {
        rank: 3,
        teamAbbr: 'BOS',
        teamName: 'Fenway Faithful',
        wins: 9,
        losses: 5,
        gamesBack: 2,
        streak: 'L1',
      },
      {
        rank: 4,
        teamAbbr: 'CHC',
        teamName: 'Wrigley Wonders',
        wins: 8,
        losses: 6,
        gamesBack: 3,
        streak: 'W1',
      },
      {
        rank: 5,
        teamAbbr: 'PHI',
        teamName: 'Philly Phantoms',
        wins: 6,
        losses: 8,
        gamesBack: 5,
        streak: 'L3',
      },
      {
        rank: 6,
        teamAbbr: 'CIN',
        teamName: 'Reds Stockings',
        wins: 5,
        losses: 9,
        gamesBack: 6,
        streak: 'L2',
      },
    ],
  },
};

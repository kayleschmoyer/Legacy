import type { Meta, StoryObj } from '@storybook/react';
import { StandingsTable } from './StandingsTable';

const meta: Meta<typeof StandingsTable> = {
  title: 'Components/StandingsTable',
  component: StandingsTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'StandingsTable · league of 12 · Week 14/22',
    rows: [
      {
        rank: 1,
        teamAbbr: 'CS',
        teamName: 'Cooperstown Society',
        wins: 10,
        losses: 2,
        ties: 0,
        pct: '.833',
        pf: 1548.2,
        pa: 1221.4,
        streak: 'W4',
      },
      {
        rank: 2,
        teamAbbr: 'DB',
        teamName: 'Dead Ball Dynasty',
        wins: 9,
        losses: 3,
        ties: 0,
        pct: '.750',
        pf: 1492.8,
        pa: 1288.7,
        streak: 'W2',
      },
      {
        rank: 3,
        teamAbbr: 'IH',
        teamName: 'Iron Horse',
        wins: 8,
        losses: 4,
        ties: 0,
        pct: '.667',
        pf: 1432.1,
        pa: 1310.5,
        streak: 'W1',
      },
      {
        rank: 4,
        teamAbbr: 'NL',
        teamName: 'Negro League Stars',
        wins: 7,
        losses: 5,
        ties: 0,
        pct: '.583',
        pf: 1401.0,
        pa: 1355.2,
        streak: 'L1',
      },
      {
        rank: 5,
        teamAbbr: 'SE',
        teamName: 'Steroid Era All-Stars',
        wins: 7,
        losses: 5,
        ties: 0,
        pct: '.583',
        pf: 1389.5,
        pa: 1360.1,
        streak: 'W1',
      },
      {
        rank: 6,
        teamAbbr: 'BB',
        teamName: 'Brooklyn Bridegrooms',
        wins: 5,
        losses: 7,
        ties: 0,
        pct: '.417',
        pf: 1288.4,
        pa: 1401.9,
        streak: 'L3',
      },
      {
        rank: 7,
        teamAbbr: 'RC',
        teamName: 'Rocky Mountain Roughs',
        wins: 4,
        losses: 7,
        ties: 1,
        pct: '.375',
        pf: 1251.8,
        pa: 1422.7,
        streak: 'L2',
      },
      {
        rank: 8,
        teamAbbr: 'SC',
        teamName: 'Sandlot Club',
        wins: 3,
        losses: 9,
        ties: 0,
        pct: '.250',
        pf: 1180.6,
        pa: 1510.4,
        streak: 'L5',
        onBye: true,
      },
    ],
  },
};

export const NoLabel: Story = {
  args: {
    rows: Default.args?.rows ?? [],
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { Table } from './Table';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const StatsTable: Story = {
  args: {
    title: 'All-Time Season OPS Leaders',
    columns: [
      { key: 'player', label: 'Player' },
      { key: 'team', label: 'Team' },
      { key: 'pa', label: 'PA', numeric: true },
      { key: 'avg', label: 'AVG', numeric: true },
      { key: 'hr', label: 'HR', numeric: true },
      { key: 'ops', label: 'OPS', numeric: true, sorted: true },
      { key: 'war', label: 'WAR', numeric: true },
    ],
    rows: [
      [
        'Barry Bonds',
        'SF · 2001',
        664,
        '.328',
        73,
        { value: '1.379', lead: true },
        11.8,
      ],
      [
        'Babe Ruth',
        'NYY · 1923',
        697,
        '.393',
        41,
        { value: '1.309', lead: true },
        14.1,
      ],
      [
        'Ty Cobb',
        'DET · 1911',
        684,
        '.420',
        8,
        { value: '1.088', lead: true },
        10.5,
      ],
      [
        'Lou Gehrig',
        'NYY · 1927',
        717,
        '.373',
        47,
        { value: '1.240', lead: true },
        11.8,
      ],
      [
        'Rogers Hornsby',
        'STL · 1924',
        640,
        '.424',
        25,
        { value: '1.203', lead: true },
        12.1,
      ],
    ],
  },
};

export const Simple: Story = {
  args: {
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'pos', label: 'POS' },
      { key: 'pts', label: 'Pts', numeric: true, sorted: true },
      { key: 'proj', label: 'Proj', numeric: true },
    ],
    rows: [
      ['Mike Trout', 'CF', 42.5, 38.2],
      ['Mookie Betts', 'RF', 38.1, 40.0],
      ['Freddie Freeman', '1B', 35.8, 34.5],
      ['Yordan Alvarez', 'DH', 33.2, 36.1],
    ],
  },
};

export const NoTitle: Story = {
  args: {
    columns: [
      { key: 'team', label: 'Team' },
      { key: 'w', label: 'W', numeric: true },
      { key: 'l', label: 'L', numeric: true },
      { key: 'pct', label: 'PCT', numeric: true, sorted: true },
      { key: 'gb', label: 'GB', numeric: true },
    ],
    rows: [
      ['NYY', 95, 67, '.586', '—'],
      ['BOS', 89, 73, '.549', 6],
      ['TOR', 87, 75, '.537', 8],
      ['BAL', 83, 79, '.512', 12],
      ['TB', 80, 82, '.494', 15],
    ],
  },
};

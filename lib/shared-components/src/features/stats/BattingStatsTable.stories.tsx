import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { BattingStatsData, BattingStatsTable } from './BattingStatsTable';

const sampleStats: BattingStatsData[] = [
  {
    player: { name: 'Mike Trout' },
    g: 119,
    pa: 507,
    ab: 438,
    r: 85,
    h: 132,
    doubles: 27,
    triples: 3,
    hr: 35,
    rbi: 90,
    sb: 11,
    cs: 3,
    bb: 62,
    so: 119,
    tb: 270,
    gidp: 8,
    hbp: 5,
    sh: 0,
    ibb: 7,
  },
  {
    player: { name: 'Shohei Ohtani' },
    g: 159,
    pa: 666,
    ab: 599,
    r: 103,
    h: 176,
    doubles: 26,
    triples: 8,
    hr: 44,
    rbi: 95,
    sb: 20,
    cs: 6,
    bb: 55,
    so: 143,
    tb: 350,
    gidp: 10,
    hbp: 8,
    sh: 0,
    ibb: 2,
  },
  {
    player: { name: 'Mookie Betts' },
    g: 152,
    pa: 640,
    ab: 570,
    r: 117,
    h: 179,
    doubles: 40,
    triples: 2,
    hr: 39,
    rbi: 107,
    sb: 14,
    cs: 4,
    bb: 60,
    so: 98,
    tb: 340,
    gidp: 12,
    hbp: 7,
    sh: 1,
    ibb: 5,
  },
];

const meta: Meta<typeof BattingStatsTable> = {
  title: 'Features/Stats/BattingStatsTable',
  component: BattingStatsTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Wrapper around StatsTable that transforms batting data and defines column layout for standard batting statistics.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  args: {
    stats: sampleStats,
    title: 'Batting Statistics',
  },
};

export const EmptyState: Story = {
  args: {
    stats: [],
    title: 'Batting Statistics',
  },
};

export const CustomTitle: Story = {
  args: {
    stats: sampleStats,
    title: '2024 Season Batting Leaders',
  },
};

export const WithPlayerPress: Story = {
  args: {
    stats: sampleStats,
    title: 'Batting Statistics',
    onPlayerPress: fn(),
  },
};

export const WithMaxHeight: Story = {
  args: {
    stats: sampleStats,
    title: 'Batting Statistics',
    maxHeight: 200,
  },
};

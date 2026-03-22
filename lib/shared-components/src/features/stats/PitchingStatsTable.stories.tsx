import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { PitchingStatsData } from './PitchingStatsTable';
import { PitchingStatsTable } from './PitchingStatsTable';

const samplePitchingStats: PitchingStatsData[] = [
  {
    player: { name: 'Gerrit Cole' },
    w: 15,
    l: 4,
    era: 2.63,
    g: 33,
    gs: 33,
    cg: 2,
    sho: 1,
    sv: 0,
    ip: 209,
    h: 153,
    r: 65,
    er: 61,
    hr: 20,
    bb: 48,
    ibb: 2,
    so: 222,
    hbp: 4,
    bk: 0,
    wp: 3,
    bf: 835,
  },
  {
    player: { name: 'Spencer Strider' },
    w: 20,
    l: 5,
    era: 3.86,
    g: 32,
    gs: 32,
    cg: 0,
    sho: 0,
    sv: 0,
    ip: 186.2,
    h: 139,
    r: 82,
    er: 80,
    hr: 22,
    bb: 53,
    ibb: 1,
    so: 281,
    hbp: 7,
    bk: 1,
    wp: 5,
    bf: 775,
  },
  {
    player: { name: 'Zack Wheeler' },
    w: 12,
    l: 6,
    era: 3.07,
    g: 32,
    gs: 32,
    cg: 3,
    sho: 2,
    sv: 0,
    ip: 192,
    h: 155,
    r: 70,
    er: 66,
    hr: 18,
    bb: 36,
    ibb: 0,
    so: 212,
    hbp: 3,
    bk: 0,
    wp: 2,
    bf: 780,
  },
];

const meta: Meta<typeof PitchingStatsTable> = {
  title: 'Features/Stats/PitchingStatsTable',
  component: PitchingStatsTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Wrapper around StatsTable that transforms pitching data and defines column layout for standard pitching statistics.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  args: {
    stats: samplePitchingStats,
    title: 'Pitching Statistics',
  },
};

export const EmptyState: Story = {
  args: {
    stats: [],
    title: 'Pitching Statistics',
  },
};

export const CustomTitle: Story = {
  args: {
    stats: samplePitchingStats,
    title: '2024 Pitching Leaders',
  },
};

export const WithPlayerPress: Story = {
  args: {
    stats: samplePitchingStats,
    title: 'Pitching Statistics',
    onPlayerPress: fn(),
  },
};

export const WithMaxHeight: Story = {
  args: {
    stats: samplePitchingStats,
    title: 'Pitching Statistics',
    maxHeight: 200,
  },
};

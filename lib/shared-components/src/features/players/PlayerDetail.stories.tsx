import type { Meta, StoryObj } from '@storybook/react';
import { PlayerDetail, PlayerDetailData } from './PlayerDetail';

const batter: PlayerDetailData = {
  id: 1,
  name: 'Babe Ruth',
  position: 'OF',
  team: 'New York Yankees',
  battingAvg: 0.342,
  homeRuns: 714,
  rbi: 2213,
  runs: 2174,
  hits: 2873,
  strikeouts: 1330,
  walks: 2062,
  obp: 0.474,
  slg: 0.69,
};

const pitcher: PlayerDetailData = {
  id: 3,
  name: 'Sandy Koufax',
  position: 'SP',
  team: 'Los Angeles Dodgers',
  era: 2.76,
  wins: 165,
  losses: 87,
  saves: 9,
  strikeouts: 2396,
};

const meta: Meta<typeof PlayerDetail> = {
  title: 'Features/Players/PlayerDetail',
  component: PlayerDetail,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Player stat detail view showing batting and pitching sections with stat rows. Supports loading and error states.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BatterProfile: Story = {
  args: {
    player: batter,
  },
};

export const PitcherProfile: Story = {
  args: {
    player: pitcher,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const ErrorState: Story = {
  args: {
    error: 'Failed to load player details. Please try again.',
  },
};

export const NoPlayer: Story = {
  args: {},
};

export const MinimalStats: Story = {
  args: {
    player: {
      id: 10,
      name: 'Rookie Player',
      position: 'SS',
      team: 'Tampa Bay Rays',
      battingAvg: 0.245,
      homeRuns: 3,
      rbi: 12,
    },
  },
};

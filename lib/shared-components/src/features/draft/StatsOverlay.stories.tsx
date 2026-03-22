import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { StatsOverlay } from './StatsOverlay';
import type { Player } from './PlayerCard';

const mockPlayer: Player = {
  id: '1',
  name: 'Mike Trout',
  position: 'CF',
  team: 'LAA',
  adp: 1,
  rank: 1,
  ownership: 95,
  trending: 'up',
  injury: 'healthy',
  stats: { AVG: 0.283, HR: 40 },
  faabValue: 50,
  isWatched: false,
};

const meta: Meta<typeof StatsOverlay> = {
  title: 'Features/Draft/StatsOverlay',
  component: StatsOverlay,
  parameters: {
    docs: {
      description: {
        component:
          'Overlay panel displaying detailed player statistics with a close button.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPlayer: Story = {
  args: {
    onClose: fn(),
    player: mockPlayer,
  },
};

export const NoPlayer: Story = {
  args: {
    onClose: fn(),
    player: null,
  },
};

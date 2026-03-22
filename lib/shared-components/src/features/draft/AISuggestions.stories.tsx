import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { AISuggestions } from './AISuggestions';
import type { Player } from './PlayerCard';

const mockPlayers: Player[] = [
  {
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
  },
  {
    id: '2',
    name: 'Shohei Ohtani',
    position: 'DH',
    team: 'LAD',
    adp: 2,
    rank: 2,
    ownership: 99,
    trending: 'up',
    injury: 'healthy',
    stats: { AVG: 0.304, HR: 54 },
    faabValue: 100,
    isWatched: true,
  },
  {
    id: '3',
    name: 'Mookie Betts',
    position: 'RF',
    team: 'LAD',
    adp: 3,
    rank: 3,
    ownership: 90,
    trending: 'stable',
    injury: 'healthy',
    stats: { AVG: 0.307, HR: 39 },
    faabValue: 45,
    isWatched: false,
  },
];

const meta: Meta<typeof AISuggestions> = {
  title: 'Features/Draft/AISuggestions',
  component: AISuggestions,
  parameters: {
    docs: {
      description: {
        component:
          'AI-powered player suggestion list with pick buttons for each suggested player during a draft.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    suggestions: mockPlayers,
    onPick: fn(),
  },
};

export const Empty: Story = {
  args: {
    suggestions: [],
    onPick: fn(),
  },
};

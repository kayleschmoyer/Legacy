import type { Meta, StoryObj } from '@storybook/react';
import { GamesRemaining } from './GamesRemaining';

const meta: Meta<typeof GamesRemaining> = {
  title: 'Features/Matchup/GamesRemaining',
  component: GamesRemaining,
  parameters: {
    docs: {
      description: {
        component:
          'Shows game progress with dots (completed/current/remaining), a progress bar, and a status badge. Compact mode shows a dot and text summary.',
      },
    },
  },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: { gamesRemaining: 4, totalGames: 7 },
};

export const AllComplete: Story = {
  args: { gamesRemaining: 0, totalGames: 7 },
};

export const JustStarted: Story = {
  args: { gamesRemaining: 7, totalGames: 7 },
};

export const Compact: Story = {
  args: { compact: true, gamesRemaining: 3, totalGames: 7 },
};

export const CompactComplete: Story = {
  args: { compact: true, gamesRemaining: 0, totalGames: 7 },
};

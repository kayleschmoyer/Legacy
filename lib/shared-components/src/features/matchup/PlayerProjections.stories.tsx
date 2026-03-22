import type { Meta, StoryObj } from '@storybook/react';

import type { PlayerProjection } from './PlayerProjections';
import { PlayerProjections } from './PlayerProjections';

const mockProjections: PlayerProjection[] = [
  {
    playerId: 1,
    playerName: 'Mike Trout',
    matchupProjection: 12.5,
    careerProjection: 10.2,
    selectedGamesCount: 4,
  },
  {
    playerId: 2,
    playerName: 'Mookie Betts',
    matchupProjection: 11.8,
    careerProjection: 9.7,
    selectedGamesCount: 3,
  },
  {
    playerId: 3,
    playerName: 'Aaron Judge',
    matchupProjection: 14.2,
    careerProjection: 11.5,
    selectedGamesCount: 5,
  },
  {
    playerId: 4,
    playerName: 'Shohei Ohtani',
    matchupProjection: 13.1,
    careerProjection: 12.0,
    selectedGamesCount: 4,
  },
];

const meta: Meta<typeof PlayerProjections> = {
  title: 'Features/Matchup/PlayerProjections',
  component: PlayerProjections,
  parameters: {
    docs: {
      description: {
        component:
          'Displays matchup and career projections in a compact table-style card. Shows loading, error, and empty states.',
      },
    },
  },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { projections: mockProjections, gamesRemaining: 3 },
};

export const Loading: Story = {
  args: { projections: [], gamesRemaining: 0, loading: true },
};

export const Error: Story = {
  args: {
    projections: [],
    gamesRemaining: 0,
    error: new globalThis.Error('Failed to load projections'),
  },
};

export const Empty: Story = {
  args: { projections: [], gamesRemaining: 0 },
};

export const AllGamesComplete: Story = {
  args: { projections: mockProjections, gamesRemaining: 0 },
};

import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { GameCard } from './GameCard';
import type { ScoreboardGame } from './types';

const meta: Meta<typeof GameCard> = {
  title: 'Components/Scoreboard/GameCard',
  component: GameCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Single MLB game card. Renders status-aware layout for live, final, and upcoming games. Tap to expand the linescore.',
      },
    },
  },
  decorators: [
    (Story) => (
      <YStack maxWidth={420}>
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const live: ScoreboardGame = {
  gamePk: 1,
  status: 'Live',
  inning: 7,
  inningHalf: 'Top',
  outs: 1,
  awayTeam: {
    teamName: 'Yankees',
    abbreviation: 'NYY',
    runs: 4,
    hits: 8,
    errors: 0,
    linescoreInnings: [1, 0, 0, 2, 0, 0, 1],
  },
  homeTeam: {
    teamName: 'Red Sox',
    abbreviation: 'BOS',
    runs: 3,
    hits: 7,
    errors: 1,
    linescoreInnings: [0, 1, 0, 0, 0, 2, 0],
  },
};

const final: ScoreboardGame = {
  gamePk: 7,
  status: 'Final',
  awayTeam: {
    teamName: 'Astros',
    abbreviation: 'HOU',
    runs: 7,
    hits: 12,
    errors: 1,
    linescoreInnings: [2, 0, 3, 0, 0, 0, 1, 1, 0],
  },
  homeTeam: {
    teamName: 'Mariners',
    abbreviation: 'SEA',
    runs: 2,
    hits: 5,
    errors: 2,
    linescoreInnings: [0, 0, 1, 0, 1, 0, 0, 0, 0],
  },
};

const upcoming: ScoreboardGame = {
  gamePk: 4,
  // Documented API status — see ScoreboardGame.status in the schema.
  status: 'Preview',
  startTime: '2025-04-18T19:05:00.000Z',
  awayTeam: {
    teamName: 'Braves',
    abbreviation: 'ATL',
    runs: 0,
    hits: 0,
    errors: 0,
  },
  homeTeam: {
    teamName: 'Mets',
    abbreviation: 'NYM',
    runs: 0,
    hits: 0,
    errors: 0,
  },
};

export const Live: Story = { args: { game: live } };
export const LiveExpanded: Story = {
  args: { game: live, defaultExpanded: true },
};
export const Final: Story = { args: { game: final } };
export const Upcoming: Story = { args: { game: upcoming } };

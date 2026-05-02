import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { MatchupCard } from './MatchupCard';

const meta: Meta<typeof MatchupCard> = {
  title: 'Components/MatchupCard',
  component: MatchupCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  args: {
    status: 'live',
    subtitle: 'Week 14 · Top 6th',
    away: {
      abbr: 'NYY',
      name: 'Bronx Bombers',
      score: 87.4,
      winProbability: 38,
    },
    home: {
      abbr: 'BOS',
      name: 'Fenway Faithful',
      score: 102.6,
      winProbability: 62,
    },
  },
};

export const Final: Story = {
  args: {
    status: 'final',
    subtitle: 'Week 13 · Final',
    away: { abbr: 'BRK', name: 'Brooklyn Bridegrooms', score: 110.2 },
    home: { abbr: 'PHI', name: 'Philly Phantoms', score: 98.5 },
  },
};

export const Pre: Story = {
  args: {
    status: 'pre',
    subtitle: 'Sat 1:05 PM',
    away: { abbr: 'CIN', name: 'Reds Stockings', score: 0 },
    home: { abbr: 'CHI', name: 'White Stockings', score: 0 },
  },
};

export const Stack: Story = {
  render: () => (
    <YStack gap="$3" width={420}>
      <MatchupCard
        status="live"
        subtitle="Top 7th"
        away={{
          abbr: 'NYY',
          name: 'Bronx Bombers',
          score: 87.4,
          winProbability: 38,
        }}
        home={{
          abbr: 'BOS',
          name: 'Fenway Faithful',
          score: 102.6,
          winProbability: 62,
        }}
      />
      <MatchupCard
        status="final"
        subtitle="Final"
        away={{ abbr: 'BRK', name: 'Brooklyn Bridegrooms', score: 110.2 }}
        home={{ abbr: 'PHI', name: 'Philly Phantoms', score: 98.5 }}
      />
    </YStack>
  ),
};

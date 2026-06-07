import type { Meta, StoryObj } from '@storybook/react';
import { XStack } from 'tamagui';
import { LeagueCard } from './LeagueCard';

const meta: Meta<typeof LeagueCard> = {
  title: 'Components/LeagueCard',
  component: LeagueCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {
  args: {
    league: {
      id: 1,
      name: 'Dead Ball Dynasty',
      maxRosterSize: 25,
      currentWeekNumber: 14,
      draftStatus: 'completed',
    },
  },
};

export const DraftInProgress: Story = {
  args: {
    league: {
      id: 2,
      name: 'Brooklyn Bridegrooms',
      maxRosterSize: 22,
      draftStatus: 'in-progress',
    },
  },
};

export const Queued: Story = {
  args: {
    league: {
      id: 3,
      name: 'Cooperstown Society',
      maxRosterSize: 30,
      draftStatus: 'queued',
    },
  },
};

export const PreDraft: Story = {
  args: {
    league: {
      id: 4,
      name: 'Negro Leagues Stars',
      maxRosterSize: 25,
      draftStatus: 'not-started',
    },
  },
};

export const Grid: Story = {
  render: () => (
    <XStack gap="$3" flexWrap="wrap" maxWidth={760}>
      <LeagueCard
        league={{
          id: 1,
          name: 'Dead Ball Dynasty',
          maxRosterSize: 25,
          currentWeekNumber: 14,
          draftStatus: 'completed',
        }}
      />
      <LeagueCard
        league={{
          id: 2,
          name: 'Brooklyn Bridegrooms',
          maxRosterSize: 22,
          draftStatus: 'in-progress',
        }}
      />
    </XStack>
  ),
};

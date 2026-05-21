import type { Meta, StoryObj } from '@storybook/react';
import { fixtureFootballPlayers } from '@legacy-sports/test-fixtures';
import { FootballMockPoolPreview } from './FootballMockPoolPreview';

const meta: Meta<typeof FootballMockPoolPreview> = {
  title: 'Features/Draft/FootballMockPoolPreview',
  component: FootballMockPoolPreview,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Preview of the football mock player pool sourced from `@legacy-sports/test-fixtures`. ' +
          'Shown in `MockDraftPage` behind the `football-mock-players` GrowthBook flag while the ' +
          'sport-aware draft engine is being built (LS-4657 → LS-4665).',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof FootballMockPoolPreview>;

/** Default — the full ~250-player pool grouped by position with top 3 per group. */
export const Default: Story = {
  args: {
    pool: fixtureFootballPlayers,
  },
};

/** Show more entries per position (top 5) — useful for spot-checking the long tail. */
export const TopFivePerPosition: Story = {
  args: {
    pool: fixtureFootballPlayers,
    topPerPosition: 5,
  },
};

/** A small hand-picked pool — verifies the component renders sparse inputs sanely. */
export const TinyPool: Story = {
  args: {
    pool: [
      {
        id: 1,
        firstName: 'Patrick',
        lastName: 'Mahomes',
        position: 'QB',
        team: 'KC',
        fpg: 24.5,
        ownershipPct: 99.2,
        byeWeek: 10,
      },
      {
        id: 2,
        firstName: 'Christian',
        lastName: 'McCaffrey',
        position: 'RB',
        team: 'SF',
        fpg: 23.8,
        ownershipPct: 99.0,
        byeWeek: 9,
      },
      {
        id: 3,
        firstName: 'Tyreek',
        lastName: 'Hill',
        position: 'WR',
        team: 'MIA',
        fpg: 21.2,
        ownershipPct: 98.4,
        byeWeek: 6,
      },
    ],
    topPerPosition: 3,
  },
};

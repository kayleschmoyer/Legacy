import type { Meta, StoryObj } from '@storybook/react';
import { MockedProvider } from '@apollo/client/testing/react';
import { LeagueActivityFeed } from './LeagueActivityFeed';
import { GetLeagueActivity } from '../../api/db/graphql.generated';

const activityMock = {
  request: {
    query: GetLeagueActivity,
    variables: { leagueId: 1, limit: 20 },
  },
  result: {
    data: {
      leagueActivity: [
        {
          id: 1,
          leagueId: 1,
          teamId: 1,
          actorUserId: 100,
          actorUsername: 'brad',
          eventType: 'TRADE_COMPLETED',
          payload: null,
          occurredAt: new Date().toISOString(),
        },
        {
          id: 2,
          leagueId: 1,
          teamId: 2,
          actorUserId: 101,
          actorUsername: 'alex',
          eventType: 'WAIVER_CLAIM',
          payload: null,
          occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        {
          id: 3,
          leagueId: 1,
          teamId: 3,
          actorUserId: 102,
          actorUsername: 'sam',
          eventType: 'DRAFT_PICK',
          payload: null,
          occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ],
    },
  },
};

const meta: Meta<typeof LeagueActivityFeed> = {
  title: 'Features/Leagues/LeagueActivityFeed',
  component: LeagueActivityFeed,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[activityMock]}>
        <div style={{ maxWidth: 500, padding: 20 }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cross-platform activity timeline for a league showing recent trades, waiver claims, draft picks, lineup changes, and other events with type badges and relative timestamps.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    leagueId: 1,
  },
};

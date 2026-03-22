import type { Meta, StoryObj } from '@storybook/react';
import { MockedProvider } from '@apollo/client/testing/react';
import { LeagueTradeBlock } from './LeagueTradeBlock';
import { GetLeagueTradeBlock } from '../../api/db/graphql.generated';

const tradeBlockMock = {
  request: {
    query: GetLeagueTradeBlock,
    variables: { leagueId: 1 },
  },
  result: {
    data: {
      leagueTradeBlock: [
        {
          id: 1,
          teamId: 1,
          playerId: 10,
          player: { firstName: 'Mike', lastName: 'Trout' },
        },
        {
          id: 2,
          teamId: 2,
          playerId: 20,
          player: { firstName: 'Shohei', lastName: 'Ohtani' },
        },
        {
          id: 3,
          teamId: 1,
          playerId: 30,
          player: { firstName: 'Mookie', lastName: 'Betts' },
        },
      ],
    },
  },
};

const meta: Meta<typeof LeagueTradeBlock> = {
  title: 'Features/Matchup/LeagueTradeBlock',
  component: LeagueTradeBlock,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[tradeBlockMock]}>
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
          'Displays all players listed on the trade block across every team in a league. Own-team players show a Remove button; others show an AVAILABLE badge.',
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
    userTeamId: 1,
  },
};

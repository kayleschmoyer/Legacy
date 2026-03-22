import type { Meta, StoryObj } from '@storybook/react';
import { MockedProvider } from '@apollo/client/testing/react';
import { MatchupRecapPanel } from './MatchupRecapPanel';
import { GetMatchupRecap } from '../../api/db/graphql.generated';

const matchupRecapMock = {
  request: {
    query: GetMatchupRecap,
    variables: { id: 1 },
  },
  result: {
    data: {
      getMatchupById: {
        id: 1,
        weekNumber: 12,
        status: 'completed',
        team1Id: 1,
        team2Id: 2,
        team1Score: 412.5,
        team2Score: 298.3,
        recap: {
          headline: 'Thunder Crush Eagles in Week 12 Blowout',
          narrative:
            'In a dominant display of power hitting, the Thunder dismantled the Eagles with a 114-point margin of victory.',
          highlights: [
            'Mike Trout: 3 HR, 7 RBI, 1.200 OPS',
            'Shohei Ohtani: 12 K, 0 ER over 7 IP',
          ],
          matchupType: 'blowout',
        },
      },
    },
  },
};

const meta: Meta<typeof MatchupRecapPanel> = {
  title: 'Features/Matchup/MatchupRecapPanel',
  component: MatchupRecapPanel,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[matchupRecapMock]}>
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
          'Displays a narrative recap for a completed matchup including headline, narrative paragraph, highlights, and matchup-type badges (BLOWOUT / CLOSE GAME).',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    matchupId: 1,
  },
};

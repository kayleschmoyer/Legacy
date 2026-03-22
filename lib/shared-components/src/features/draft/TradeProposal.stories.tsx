import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { TradeProposal } from './TradeProposal';

const meta: Meta<typeof TradeProposal> = {
  title: 'Features/Draft/TradeProposal',
  component: TradeProposal,
  parameters: {
    docs: {
      description: {
        component:
          'Trade proposal interface for initiating and reviewing trades between teams in a league.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClose: fn(),
    leagueId: 'league-123',
    teamId: 'team-456',
  },
};

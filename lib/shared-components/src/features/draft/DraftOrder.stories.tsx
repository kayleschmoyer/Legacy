import type { Meta, StoryObj } from '@storybook/react';
import { DraftOrder } from './DraftOrder';

const mockTeams = [
  { id: 't1', name: 'Team Alpha' },
  { id: 't2', name: 'Team Beta' },
  { id: 't3', name: 'Team Gamma' },
  { id: 't4', name: 'Team Delta' },
  { id: 't5', name: 'Team Epsilon' },
  { id: 't6', name: 'Team Zeta' },
  { id: 't7', name: 'Team Eta' },
  { id: 't8', name: 'Team Theta' },
];

const largeLeagueTeams = [
  ...mockTeams,
  { id: 't9', name: 'Team Iota' },
  { id: 't10', name: 'Team Kappa' },
  { id: 't11', name: 'Team Lambda' },
  { id: 't12', name: 'Team Mu' },
  { id: 't13', name: 'Team Nu' },
  { id: 't14', name: 'Team Xi' },
];

const meta: Meta<typeof DraftOrder> = {
  title: 'Features/Draft/DraftOrder',
  component: DraftOrder,
  parameters: {
    docs: {
      description: {
        component:
          'Displays the draft order with team names and highlights the team currently on the clock.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    order: mockTeams,
    currentPick: 1,
  },
};

export const MidDraft: Story = {
  args: {
    order: mockTeams,
    currentPick: 4,
  },
};

export const LastPick: Story = {
  args: {
    order: mockTeams,
    currentPick: 8,
  },
};

export const LargeLeague: Story = {
  args: {
    order: largeLeagueTeams,
    currentPick: 7,
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { MockedProvider } from '@apollo/client/testing';
import { PlayerCard } from './PlayerCard';

const mockPlayer = {
  __typename: 'Player' as const,
  id: 1,
  name: 'Mike Trout',
  brefId: 'troutmi01',
};

const meta: Meta<typeof PlayerCard> = {
  title: 'Features/Players/PlayerCard',
  component: PlayerCard,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]}>
        <div style={{ maxWidth: 400, padding: 20 }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlayerClick: { action: 'clicked' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    player: mockPlayer,
    onPlayerClick: action('player-clicked'),
  },
};

export const WithoutClickHandler: Story = {
  args: {
    player: mockPlayer,
  },
};

export const LongName: Story = {
  args: {
    player: {
      ...mockPlayer,
      name: 'Francisco Guillermo Rodriguez Martinez',
    },
    onPlayerClick: action('player-clicked'),
  },
};

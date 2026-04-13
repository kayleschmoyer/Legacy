import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { CreateLeagueModal } from './CreateLeagueModal';

const meta: Meta<typeof CreateLeagueModal> = {
  title: 'Features/Leagues/CreateLeagueModal',
  component: CreateLeagueModal,
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog for creating a new fantasy league with sport, team count, draft, and scheduling configuration.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    visible: true,
    onClose: fn(),
    onSubmit: fn(),
  },
};

export const Loading: Story = {
  args: {
    visible: true,
    onClose: fn(),
    onSubmit: fn(),
    loading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Loading state with disabled inputs and "Creating..." button text.',
      },
    },
  },
};

export const WithError: Story = {
  args: {
    visible: true,
    onClose: fn(),
    onSubmit: fn(),
    error: 'Failed to create league',
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state showing an inline error banner.',
      },
    },
  },
};

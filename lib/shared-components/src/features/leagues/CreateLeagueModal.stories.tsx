import React, { useEffect } from 'react';
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
  decorators: [
    (Story) => {
      // Suppress window.alert in Storybook — the component calls alert() on
      // web when the error prop is set.
      useEffect(() => {
        const original = window.alert;
        window.alert = fn() as typeof window.alert;
        return () => {
          window.alert = original;
        };
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        story: 'Error state that triggers an alert with the error message.',
      },
    },
  },
};

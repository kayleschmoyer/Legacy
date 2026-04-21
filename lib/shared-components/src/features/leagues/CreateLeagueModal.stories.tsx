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
          'Multi-step modal wizard for creating a new fantasy league. Baseball: Basics, Roster, Era, Draft, Waivers (5 steps). Other sports: Basics, Roster, Draft, Waivers (4 steps — Era is baseball-only). Horizontal stepper across the top with progress tracking and scorecard summary.',
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
    sport: 'baseball',
    onClose: fn(),
    onSubmit: fn(),
  },
};

export const Premium: Story = {
  args: {
    visible: true,
    sport: 'baseball',
    onClose: fn(),
    onSubmit: fn(),
    isPremium: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Premium user — all era options and FAAB/salary cap are unlocked.',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    visible: true,
    sport: 'baseball',
    onClose: fn(),
    onSubmit: fn(),
    loading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Submission in flight — all inputs and nav buttons are disabled.',
      },
    },
  },
};

export const WithError: Story = {
  args: {
    visible: true,
    sport: 'baseball',
    onClose: fn(),
    onSubmit: fn(),
    error:
      'The commissioner service did not respond. Your settings are preserved — try again.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Server error banner displayed above the step body.',
      },
    },
  },
};

export const Football: Story = {
  args: {
    visible: true,
    sport: 'football',
    onClose: fn(),
    onSubmit: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Non-baseball sport — Era step is omitted; wizard has 4 steps instead of 5.',
      },
    },
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DraftTimer } from './DraftTimer';

const meta: Meta<typeof DraftTimer> = {
  title: 'Features/Draft/DraftTimer',
  component: DraftTimer,
  parameters: {
    docs: {
      description: {
        component:
          'Draft timer component displaying pick number and speed controls for adjusting draft pace.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    sport: 'baseball',
    currentPick: 1,
    speed: 30,
    onSpeedChange: fn(),
  },
};

export const FastSpeed: Story = {
  args: {
    sport: 'baseball',
    currentPick: 1,
    speed: 10,
    onSpeedChange: fn(),
  },
};

export const SlowSpeed: Story = {
  args: {
    sport: 'baseball',
    currentPick: 1,
    speed: 60,
    onSpeedChange: fn(),
  },
};

export const LaterPick: Story = {
  args: {
    sport: 'baseball',
    currentPick: 15,
    speed: 30,
    onSpeedChange: fn(),
  },
};

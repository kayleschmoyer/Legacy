import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { DraftClockRing } from './DraftClockRing';

const meta: Meta<typeof DraftClockRing> = {
  title: 'Features/EliteDraft/DraftClockRing',
  component: DraftClockRing,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <YStack padding="$4" backgroundColor="$background">
        <Story />
      </YStack>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Calm: Story = {
  args: { secondsRemaining: 75, totalSeconds: 120 },
};

export const Warning: Story = {
  args: { secondsRemaining: 25, totalSeconds: 120 },
};

export const Danger: Story = {
  args: { secondsRemaining: 8, totalSeconds: 120, emphasize: true },
};

export const Paused: Story = {
  args: { secondsRemaining: 60, totalSeconds: 120, paused: true },
};

export const Untimed: Story = {
  args: { secondsRemaining: 60, totalSeconds: 120, untimed: true },
};

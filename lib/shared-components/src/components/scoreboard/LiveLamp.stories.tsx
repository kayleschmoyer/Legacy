import type { Meta, StoryObj } from '@storybook/react';
import { XStack } from 'tamagui';
import { LiveLamp } from './LiveLamp';

const meta: Meta<typeof LiveLamp> = {
  title: 'Components/Scoreboard/LiveLamp',
  component: LiveLamp,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <XStack gap="$3" alignItems="center">
        <Story />
      </XStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = { args: { size: 8 } };
export const Pulsing: Story = { args: { size: 8, pulse: true } };
export const PulsingWithGlow: Story = {
  args: { size: 10, pulse: true, glow: true },
};

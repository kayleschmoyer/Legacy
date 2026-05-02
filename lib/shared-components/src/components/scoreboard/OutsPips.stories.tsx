import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { OutsPips } from './OutsPips';

const meta: Meta<typeof OutsPips> = {
  title: 'Components/Scoreboard/OutsPips',
  component: OutsPips,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <YStack gap="$2">
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NoOuts: Story = { args: { outs: 0 } };
export const OneOut: Story = { args: { outs: 1 } };
export const TwoOuts: Story = { args: { outs: 2 } };
export const ThreeOuts: Story = { args: { outs: 3 } };

import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import { Separator } from './Separator';

const meta: Meta<typeof Separator> = {
  title: 'Components/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <YStack gap="$3" width={360}>
      <Text fontFamily="$body" color="$color">
        League Settings
      </Text>
      <Separator />
      <Text fontFamily="$body" color="$textMuted">
        Section after rule
      </Text>
    </YStack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <XStack gap="$3" height={48} alignItems="center">
      <Text fontFamily="$body" color="$color">
        12 teams
      </Text>
      <Separator vertical />
      <Text fontFamily="$body" color="$color">
        Week 14/22
      </Text>
      <Separator vertical />
      <Text fontFamily="$body" color="$color">
        Live
      </Text>
    </XStack>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <YStack width={360} gap="$3">
      <Separator label="OR" />
      <Separator label="Mid-game" />
    </YStack>
  ),
};

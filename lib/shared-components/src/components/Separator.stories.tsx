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
        Roster: Active
      </Text>
      <Separator />
      <Text fontFamily="$body" color="$textMuted">
        12 players · 4 P · 2 C · 4 IF · 2 OF
      </Text>
    </YStack>
  ),
};

export const Variants: Story = {
  render: () => (
    <YStack gap="$5" width={360}>
      <YStack gap="$2">
        <Text fontFamily="$body" fontSize={11} color="$textMuted">
          Strong — section breaks · table headers
        </Text>
        <Separator variant="strong" />
      </YStack>
      <YStack gap="$2">
        <Text fontFamily="$body" fontSize={11} color="$textMuted">
          Default — card subdivisions · list rows
        </Text>
        <Separator variant="default" />
      </YStack>
      <YStack gap="$2">
        <Text fontFamily="$body" fontSize={11} color="$textMuted">
          Subtle — tight density · stat rows
        </Text>
        <Separator variant="subtle" />
      </YStack>
    </YStack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <XStack gap="$3" height={48} alignItems="center">
      <Text fontFamily="$body" color="$color">
        12 Teams
      </Text>
      <Separator vertical />
      <Text fontFamily="$body" color="$color">
        Week 14/22
      </Text>
      <Separator vertical />
      <Text fontFamily="$body" color="$color">
        ·LIVE
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

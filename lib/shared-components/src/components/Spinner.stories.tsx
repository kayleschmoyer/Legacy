import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import { Skeleton, SkeletonRow, Spinner } from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Components/Spinner',
  component: Spinner,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: 'Loading the dugout…' } };

export const Sizes: Story = {
  render: () => (
    <XStack gap="$5" alignItems="center">
      <Spinner size="small" />
      <Spinner size="large" />
      <Spinner size="large" color="$brandSeamRed" />
    </XStack>
  ),
};

export const Skeletons: Story = {
  render: () => (
    <YStack gap="$3" width={360}>
      <Text
        fontFamily="$heading"
        letterSpacing={1.2}
        fontSize={11}
        color="$textMuted"
      >
        SKELETON BARS
      </Text>
      <Skeleton width="80%" />
      <Skeleton width="60%" />
      <Skeleton width="100%" height={48} radius={12} />
      <Text
        fontFamily="$heading"
        letterSpacing={1.2}
        fontSize={11}
        color="$textMuted"
      >
        SKELETON ROWS
      </Text>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </YStack>
  ),
};

export const FullPage: Story = {
  render: () => (
    <YStack width={420} height={260} backgroundColor="$bg" borderRadius={16}>
      <Spinner fullPage label="Drafting Babe Ruth…" />
    </YStack>
  ),
};

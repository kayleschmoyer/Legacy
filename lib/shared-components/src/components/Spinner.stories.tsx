import type { Meta, StoryObj } from '@storybook/react';
import { Text, YStack } from 'tamagui';
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
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};

export const ColorVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <Spinner size="md" />
      <Spinner size="md" color="$brandSeamRed" />
      <Spinner size="md" color="#4aae7c" />
    </div>
  ),
};

export const LoadingPanelDefault: Story = {
  render: () => (
    <div
      style={{
        background: '#111B2F',
        border: '1px solid #1F2D48',
        borderRadius: 16,
        padding: 24,
        minHeight: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spinner size="lg" label="Loading roster…" />
    </div>
  ),
};

export const LoadingPanelInline: Story = {
  render: () => (
    <div
      style={{
        background: '#111B2F',
        border: '1px solid #1F2D48',
        borderRadius: 16,
        padding: 24,
        minHeight: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spinner size="md" label="Pulling latest stats" inline />
    </div>
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

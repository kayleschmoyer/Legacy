import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import { Chip, PositionChip } from './Chip';

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: 'Filter' } };

export const Tones: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap" maxWidth={520}>
      <Chip label="Neutral" tone="neutral" />
      <Chip label="Navy" tone="navy" />
      <Chip label="Gold" tone="gold" />
      <Chip label="Seam" tone="seam" />
      <Chip label="Success" tone="success" />
      <Chip label="Warning" tone="warning" />
      <Chip label="Info" tone="info" />
    </XStack>
  ),
};

export const Positions: Story = {
  render: () => (
    <YStack gap="$3" alignItems="flex-start">
      <Text
        fontFamily="$heading"
        letterSpacing={1.2}
        fontSize={11}
        color="$textMuted"
      >
        POSITION CHIPS
      </Text>
      <XStack gap="$2">
        <PositionChip position="P" />
        <PositionChip position="C" />
        <PositionChip position="IF" />
        <PositionChip position="OF" />
        <PositionChip position="U" />
      </XStack>
    </YStack>
  ),
};

export const Filters: Story = {
  render: () => (
    <XStack gap="$2">
      <Chip label="All Eras" tone="neutral" selected />
      <Chip label="Dead Ball" tone="neutral" />
      <Chip label="Live Ball" tone="neutral" />
      <Chip label="Negro Leagues" tone="neutral" />
      <Chip label="Modern" tone="neutral" />
    </XStack>
  ),
};

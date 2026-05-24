import type { Meta, StoryObj } from '@storybook/react';
import { XStack, YStack } from 'tamagui';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A small pill that shows a status label with colour coding. Uses Big Shoulders Display for scoreboard-style legibility. Includes xs/sm/md sizes and optional dot indicators for live states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'info',
        'success',
        'warning',
        'error',
        'neutral',
        'accent',
        'draftLive',
        'preDraft',
        'live',
        'final',
        'active',
        'comingSoon',
      ],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
    label: { control: 'text' },
    fontSize: { control: { type: 'number', min: 8, max: 20 } },
    backgroundColor: { control: 'color' },
    color: { control: 'color' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Neutral',
    variant: 'neutral',
  },
};

export const Info: Story = {
  args: {
    label: 'Info',
    variant: 'info',
  },
};

export const Success: Story = {
  args: {
    label: 'Active',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    label: 'Coming Soon',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    label: 'Error',
    variant: 'error',
  },
};

export const Accent: Story = {
  args: {
    label: 'Premium',
    variant: 'accent',
  },
};

export const CustomColors: Story = {
  args: {
    label: 'Custom',
    backgroundColor: '#e0d4ff',
    color: '#6b21a8',
  },
};

export const AllVariants: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap">
      <StatusBadge label="Info" variant="info" />
      <StatusBadge label="Active" variant="success" />
      <StatusBadge label="Coming Soon" variant="warning" />
      <StatusBadge label="Error" variant="error" />
      <StatusBadge label="Final" variant="neutral" />
      <StatusBadge label="Premium" variant="accent" />
    </XStack>
  ),
};

export const WithDotIndicators: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap">
      <StatusBadge label="Draft Live" variant="draftLive" />
      <StatusBadge label="Pre-Draft" variant="preDraft" />
    </XStack>
  ),
};

export const ProductStates: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap">
      <StatusBadge label="Draft Live" variant="draftLive" />
      <StatusBadge label="Pre-Draft" variant="preDraft" />
      <StatusBadge label="Live" variant="live" />
      <StatusBadge label="Final" variant="final" />
      <StatusBadge label="Active" variant="active" />
      <StatusBadge label="Coming Soon" variant="comingSoon" />
    </XStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$3">
      <XStack gap="$2" alignItems="center">
        <StatusBadge label="XS" variant="info" size="xs" />
        <StatusBadge label="SM" variant="info" size="sm" />
        <StatusBadge label="MD" variant="info" size="md" />
      </XStack>
    </YStack>
  ),
};

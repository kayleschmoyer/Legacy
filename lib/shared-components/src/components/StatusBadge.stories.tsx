import type { Meta, StoryObj } from '@storybook/react';
import { XStack } from 'tamagui';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A small pill that shows a status label with colour coding. Used for draft status, matchup status, and other indicators.',
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
    label: 'Draft',
    variant: 'neutral',
  },
};

export const Info: Story = {
  args: {
    label: 'Scheduled',
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
    label: 'Pending',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    label: 'Eliminated',
    variant: 'error',
  },
};

export const Accent: Story = {
  args: {
    label: 'Featured',
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
      <StatusBadge label="Success" variant="success" />
      <StatusBadge label="Warning" variant="warning" />
      <StatusBadge label="Error" variant="error" />
      <StatusBadge label="Neutral" variant="neutral" />
      <StatusBadge label="Accent" variant="accent" />
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

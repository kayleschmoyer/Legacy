import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Button, Text } from 'tamagui';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A centered placeholder shown when a list or section has no data.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'No standings yet',
  },
};

export const WithDescription: Story = {
  args: {
    title: 'No players found',
    description:
      'Try adjusting your search filters or check back later for updated rosters.',
  },
};

export const WithIcon: Story = {
  args: {
    title: 'No trades available',
    description: 'Check back during the trade window.',
    icon: (
      <Text fontSize="$6" color="$gray9">
        --
      </Text>
    ),
  },
};

export const WithAction: Story = {
  args: {
    title: 'No leagues joined',
    description: 'Create or join a league to get started.',
    action: (
      <Button size="$3" onPress={fn()}>
        <Text fontSize="$2" fontWeight="600">
          Create League
        </Text>
      </Button>
    ),
  },
};

export const FullFeatured: Story = {
  args: {
    title: 'No draft picks yet',
    description: 'The draft has not started. You will see your picks here.',
    icon: (
      <Text fontSize="$6" color="$gray9">
        +
      </Text>
    ),
    action: (
      <Button size="$3" onPress={fn()}>
        <Text fontSize="$2" fontWeight="600">
          View Draft Board
        </Text>
      </Button>
    ),
  },
};

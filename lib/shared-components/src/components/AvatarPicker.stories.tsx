import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { AvatarPicker } from './AvatarPicker';

const meta: Meta<typeof AvatarPicker> = {
  title: 'Components/AvatarPicker',
  component: AvatarPicker,
  parameters: {
    docs: {
      description: {
        component:
          'Lets users pick an avatar from curated presets or enter a custom URL. Supports user and team variants.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSelect: fn(),
    variant: 'user',
  },
};

export const TeamVariant: Story = {
  args: {
    variant: 'team',
    onSelect: fn(),
  },
};

export const WithCurrentUrl: Story = {
  args: {
    currentUrl: '/presets/avatar-default.png',
    onSelect: fn(),
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    onSelect: fn(),
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { XStack } from 'tamagui';
import { AvatarImage } from './AvatarImage';

const meta: Meta<typeof AvatarImage> = {
  title: 'Components/AvatarImage',
  component: AvatarImage,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Displays a user or team avatar. Shows the image URL when provided; falls back to a colored circle with the first letter of the username.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: { control: { type: 'number', min: 16, max: 128 } },
    url: { control: 'text' },
    username: { control: 'text' },
    borderRadius: { control: { type: 'number', min: 0, max: 64 } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInitials: Story = {
  args: {
    username: 'Brad',
    size: 48,
  },
};

export const WithImage: Story = {
  args: {
    url: 'https://placehold.co/96x96/2563eb/white?text=BK',
    username: 'Brad Krupa',
    size: 48,
  },
};

export const NoUsername: Story = {
  args: {
    size: 48,
  },
};

export const SmallSize: Story = {
  args: {
    username: 'Alice',
    size: 24,
  },
};

export const LargeSize: Story = {
  args: {
    username: 'Zach',
    size: 96,
  },
};

export const SquareBorderRadius: Story = {
  args: {
    username: 'Mike',
    size: 48,
    borderRadius: 8,
  },
};

export const MultipleUsers: Story = {
  render: () => (
    <XStack gap="$2" alignItems="center">
      <AvatarImage username="Alice" size={40} />
      <AvatarImage username="Bob" size={40} />
      <AvatarImage username="Charlie" size={40} />
      <AvatarImage username="Diana" size={40} />
      <AvatarImage username="Eve" size={40} />
    </XStack>
  ),
};

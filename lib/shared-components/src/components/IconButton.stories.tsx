import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { IconButton } from '../IconButton';
import { XStack } from '../Layout';

const meta: Meta<typeof IconButton> = {
  title: 'Components/IconButton',
  component: IconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A square icon button with five brand-aligned variants and three sizes. Optionally accepts an inline label.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onPress: { action: 'pressed' },
    icon: {
      control: 'select',
      options: [
        'home',
        'search',
        'settings',
        'user',
        'star',
        'heart',
        'edit',
        'delete',
        'plus',
        'check',
      ],
      description: 'Icon to display in the button',
    },
    label: {
      control: 'text',
      description: 'Optional inline label displayed beside the icon',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the icon button',
    },
    variant: {
      control: 'select',
      options: ['default', 'primary', 'seam', 'gold', 'ghost'],
      description: 'Visual variant style',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: 'home',
    onPress: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    await expect(button).toBeInTheDocument();

    await userEvent.click(button);

    await expect(args.onPress).toHaveBeenCalled();
  },
  tags: ['test'],
};

export const WithLabel: Story = {
  args: {
    icon: 'plus',
    label: 'Add Player',
    onPress: fn(),
  },
};

export const Primary: Story = {
  args: {
    icon: 'star',
    variant: 'primary',
    onPress: fn(),
  },
};

export const Seam: Story = {
  args: {
    icon: 'delete',
    variant: 'seam',
    onPress: fn(),
  },
};

export const Gold: Story = {
  args: {
    icon: 'star',
    variant: 'gold',
    onPress: fn(),
  },
};

export const Ghost: Story = {
  args: {
    icon: 'check',
    variant: 'ghost',
    onPress: fn(),
  },
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <IconButton icon="user" size="sm" onPress={fn()} />
      <IconButton icon="user" size="md" onPress={fn()} />
      <IconButton icon="user" size="lg" onPress={fn()} />
    </XStack>
  ),
};

export const Variants: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <IconButton icon="settings" variant="default" onPress={fn()} />
      <IconButton icon="star" variant="primary" onPress={fn()} />
      <IconButton icon="delete" variant="seam" onPress={fn()} />
      <IconButton icon="star" variant="gold" onPress={fn()} />
      <IconButton icon="check" variant="ghost" onPress={fn()} />
    </XStack>
  ),
};

export const LabeledVariants: Story = {
  render: () => (
    <XStack gap="$3" alignItems="center">
      <IconButton
        icon="plus"
        label="Add Player"
        variant="default"
        onPress={fn()}
      />
      <IconButton icon="star" label="Export" variant="primary" onPress={fn()} />
    </XStack>
  ),
};

export const Disabled: Story = {
  args: {
    icon: 'settings',
    variant: 'primary',
    disabled: true,
    onPress: fn(),
  },
};

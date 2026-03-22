import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { IconButton } from '../IconButton';
import { XStack, YStack } from '../Layout';

const meta: Meta<typeof IconButton> = {
  title: 'Components/IconButton',
  component: IconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'An animated icon button component with hover effects and gradient shadows, similar to modern mobile interfaces.',
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
      description: 'Optional text label below the icon',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the icon button',
    },
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'accent'],
      description: 'Visual variant style',
    },
    colorScheme: {
      control: 'select',
      options: ['blue', 'purple', 'green', 'red', 'gold'],
      description: 'Color scheme for gradient effects',
    },
    showGradient: {
      control: 'boolean',
      description: 'Whether to show gradient shadow effects on hover',
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
    label: 'Home',
    onPress: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    // Test that button is rendered
    await expect(button).toBeInTheDocument();

    // Test button click
    await userEvent.click(button);

    // Verify the onPress function was called
    await expect(args.onPress).toHaveBeenCalled();
  },
  tags: ['test'],
};

export const WithoutLabel: Story = {
  args: {
    icon: 'search',
    onPress: fn(),
  },
};

export const Primary: Story = {
  args: {
    icon: 'star',
    label: 'Favorites',
    variant: 'primary',
    onPress: fn(),
  },
};

export const Secondary: Story = {
  args: {
    icon: 'settings',
    label: 'Settings',
    variant: 'secondary',
    colorScheme: 'purple',
    onPress: fn(),
  },
};

export const Accent: Story = {
  args: {
    icon: 'check',
    label: 'Complete',
    variant: 'accent',
    colorScheme: 'green',
    onPress: fn(),
  },
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <IconButton icon="user" label="Small" size="sm" onPress={fn()} />
      <IconButton icon="user" label="Medium" size="md" onPress={fn()} />
      <IconButton icon="user" label="Large" size="lg" onPress={fn()} />
    </XStack>
  ),
};

export const Variants: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <IconButton
        icon="home"
        label="Default"
        variant="default"
        onPress={fn()}
      />
      <IconButton
        icon="star"
        label="Primary"
        variant="primary"
        onPress={fn()}
      />
      <IconButton
        icon="settings"
        label="Secondary"
        variant="secondary"
        onPress={fn()}
      />
      <IconButton icon="check" label="Accent" variant="accent" onPress={fn()} />
    </XStack>
  ),
};

export const ColorSchemes: Story = {
  render: () => (
    <YStack gap="$4" alignItems="center">
      <XStack gap="$4" alignItems="center">
        <IconButton
          icon="heart"
          label="Blue"
          variant="primary"
          colorScheme="blue"
          onPress={fn()}
        />
        <IconButton
          icon="star"
          label="Purple"
          variant="secondary"
          colorScheme="purple"
          onPress={fn()}
        />
        <IconButton
          icon="check"
          label="Green"
          variant="accent"
          colorScheme="green"
          onPress={fn()}
        />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <IconButton
          icon="delete"
          label="Red"
          variant="primary"
          colorScheme="red"
          onPress={fn()}
        />
        <IconButton
          icon="star"
          label="Gold"
          variant="primary"
          colorScheme="gold"
          onPress={fn()}
        />
      </XStack>
    </YStack>
  ),
};

export const WithoutGradient: Story = {
  args: {
    icon: 'edit',
    label: 'Edit',
    showGradient: false,
    onPress: fn(),
  },
};

export const Disabled: Story = {
  args: {
    icon: 'delete',
    label: 'Delete',
    variant: 'primary',
    colorScheme: 'red',
    disabled: true,
    onPress: fn(),
  },
};

export const NavigationBar: Story = {
  name: 'Navigation Bar Example',
  render: () => (
    <XStack
      gap="$6"
      alignItems="center"
      justifyContent="center"
      padding="$4"
      backgroundColor="$color1"
      borderRadius="$4"
    >
      <IconButton
        icon="home"
        label="Home"
        variant="primary"
        colorScheme="blue"
        onPress={fn()}
      />
      <IconButton
        icon="search"
        label="Search"
        variant="default"
        colorScheme="blue"
        onPress={fn()}
      />
      <IconButton
        icon="star"
        label="Favorites"
        variant="default"
        colorScheme="blue"
        onPress={fn()}
      />
      <IconButton
        icon="user"
        label="Profile"
        variant="default"
        colorScheme="blue"
        onPress={fn()}
      />
      <IconButton
        icon="settings"
        label="Settings"
        variant="default"
        colorScheme="blue"
        onPress={fn()}
      />
    </XStack>
  ),
};

export const ActionGrid: Story = {
  name: 'Action Grid Example',
  render: () => (
    <YStack gap="$4" alignItems="center">
      <XStack gap="$4" alignItems="center">
        <IconButton
          icon="plus"
          label="Add"
          variant="primary"
          colorScheme="green"
          size="lg"
          onPress={fn()}
        />
        <IconButton
          icon="edit"
          label="Edit"
          variant="secondary"
          colorScheme="blue"
          size="lg"
          onPress={fn()}
        />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <IconButton
          icon="star"
          label="Favorite"
          variant="accent"
          colorScheme="gold"
          size="lg"
          onPress={fn()}
        />
        <IconButton
          icon="delete"
          label="Delete"
          variant="primary"
          colorScheme="red"
          size="lg"
          onPress={fn()}
        />
      </XStack>
    </YStack>
  ),
};

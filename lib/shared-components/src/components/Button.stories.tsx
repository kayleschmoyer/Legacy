import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { XStack, YStack } from 'tamagui';
import { Button } from '../Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Brand button — Big Shoulders Display, uppercase tracking. Navy primary, gold for prominent positive actions, seam red for danger, ghost for low-emphasis. Pill modifier for compact navigational chips.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onPress: { action: 'pressed' },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'gold', 'danger', 'ghost', 'outlined'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    pill: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: 'Create a League', variant: 'primary' },
};

export const Gold: Story = {
  args: { children: 'View League', variant: 'gold' },
};

export const Danger: Story = {
  args: { children: 'Join Draft', variant: 'danger' },
};

export const Ghost: Story = {
  args: { children: 'Cancel', variant: 'ghost' },
};

export const Pill: Story = {
  args: { children: 'Week 14/22', variant: 'primary', pill: true, size: 'sm' },
};

export const Sizes: Story = {
  render: () => (
    <XStack gap={12} alignItems="center">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </XStack>
  ),
};

export const Variants: Story = {
  render: () => (
    <YStack gap={16}>
      <XStack gap={12} flexWrap="wrap" alignItems="center">
        <Button variant="primary">Create a League</Button>
        <Button variant="gold">View League</Button>
        <Button variant="danger">Join Draft</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary" pill size="sm">
          Week 14/22
        </Button>
      </XStack>
    </YStack>
  ),
};

export const States: Story = {
  render: () => (
    <YStack gap={12}>
      <XStack gap={12} alignItems="center">
        <Button>Default</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </XStack>
    </YStack>
  ),
};

export const LongText: Story = {
  args: {
    children: 'This is a button with very long text to test wrapping behavior',
  },
};

export const WithInteraction: Story = {
  args: {
    children: 'Click Me',
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

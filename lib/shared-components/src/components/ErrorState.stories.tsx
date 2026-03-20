import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { ErrorState } from './ErrorState';

const meta: Meta<typeof ErrorState> = {
  title: 'Components/ErrorState',
  component: ErrorState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A styled error card with an optional retry action. Accepts an Error object or string.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    retryLabel: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithStringError: Story = {
  args: {
    error: 'Failed to load standings data.',
  },
};

export const WithErrorObject: Story = {
  args: {
    error: new Error('Network request failed'),
  },
};

export const WithRetryButton: Story = {
  args: {
    error: 'Something went wrong. Please try again.',
    onRetry: fn(),
  },
};

export const WithCustomRetryLabel: Story = {
  args: {
    error: 'Unable to fetch player stats.',
    onRetry: fn(),
    retryLabel: 'Reload Stats',
  },
};

export const NullError: Story = {
  args: {
    error: null,
  },
};

export const WithRetryInteraction: Story = {
  args: {
    error: 'Connection lost.',
    onRetry: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const retryButton = canvas.getByRole('button', { name: 'Retry' });
    await userEvent.click(retryButton);
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
  tags: ['autodocs', 'test'],
};

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { AccessibilitySettings } from './AccessibilitySettings';

const meta: Meta<typeof AccessibilitySettings> = {
  title: 'Features/Draft/AccessibilitySettings',
  component: AccessibilitySettings,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Toggle button for enabling or disabling accessibility mode during a draft.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Disabled: Story = {
  args: {
    mode: false,
    onChange: fn(),
  },
};

export const Enabled: Story = {
  args: {
    mode: true,
    onChange: fn(),
  },
};

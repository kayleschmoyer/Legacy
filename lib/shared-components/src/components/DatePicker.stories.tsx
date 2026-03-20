import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DatePicker } from './DatePicker';

const meta: Meta<typeof DatePicker> = {
  title: 'Components/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Date picker supporting native HTML5 input on web and a custom calendar popup. Supports min/max date constraints.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    useNativeInput: { control: 'boolean' },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ minWidth: '300px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onChange: fn(),
    placeholder: 'Select date',
  },
};

export const WithValue: Story = {
  args: {
    value: new Date(2025, 2, 15),
    onChange: fn(),
  },
};

export const CustomPlaceholder: Story = {
  args: {
    onChange: fn(),
    placeholder: 'Pick a game date',
  },
};

export const Disabled: Story = {
  args: {
    value: new Date(2025, 5, 1),
    onChange: fn(),
    disabled: true,
  },
};

export const WithMinDate: Story = {
  args: {
    onChange: fn(),
    minDate: new Date(2025, 0, 1),
    placeholder: 'No dates before Jan 2025',
  },
};

export const WithMaxDate: Story = {
  args: {
    onChange: fn(),
    maxDate: new Date(2025, 11, 31),
    placeholder: 'No dates after Dec 2025',
  },
};

export const WithDateRange: Story = {
  args: {
    onChange: fn(),
    minDate: new Date(2025, 3, 1),
    maxDate: new Date(2025, 9, 31),
    placeholder: 'Apr - Oct 2025 only',
  },
};

export const CustomCalendar: Story = {
  args: {
    onChange: fn(),
    useNativeInput: false,
    placeholder: 'Custom calendar popup',
  },
};

export const NativeInput: Story = {
  args: {
    onChange: fn(),
    useNativeInput: true,
    placeholder: 'Native HTML5 input',
  },
};

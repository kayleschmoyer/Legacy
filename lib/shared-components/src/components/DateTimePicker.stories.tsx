import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DateTimePicker } from './DateTimePicker';

const meta: Meta<typeof DateTimePicker> = {
  title: 'Components/DateTimePicker',
  component: DateTimePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Date and time picker supporting native HTML5 datetime-local input on web and a custom calendar + time picker popup. Supports min/max date constraints, AM/PM toggle, and clear action.',
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
    placeholder: 'Select date and time',
  },
};

export const WithValue: Story = {
  args: {
    value: new Date(2025, 2, 15, 14, 30),
    onChange: fn(),
  },
};

export const CustomPlaceholder: Story = {
  args: {
    onChange: fn(),
    placeholder: 'Pick draft start time',
  },
};

export const Disabled: Story = {
  args: {
    value: new Date(2025, 5, 1, 19, 0),
    onChange: fn(),
    disabled: true,
  },
};

export const WithDateRange: Story = {
  args: {
    onChange: fn(),
    minDate: new Date(2025, 3, 1),
    maxDate: new Date(2025, 9, 31, 23, 59, 59, 999),
    placeholder: 'Apr - Oct 2025',
  },
};

export const WithClearAction: Story = {
  args: {
    value: new Date(2025, 6, 4, 10, 0),
    onChange: fn(),
    onClear: fn(),
  },
};

export const CustomCalendar: Story = {
  args: {
    onChange: fn(),
    useNativeInput: false,
    placeholder: 'Custom calendar + time picker',
  },
};

export const NativeInput: Story = {
  args: {
    onChange: fn(),
    useNativeInput: true,
    placeholder: 'Native datetime-local input',
  },
};

export const CustomInputStyle: Story = {
  args: {
    onChange: fn(),
    useNativeInput: true,
    inputStyle: { border: '2px solid #2563eb', borderRadius: '12px' },
    placeholder: 'Styled native input',
  },
};

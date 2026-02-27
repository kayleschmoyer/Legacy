import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { Dropdown, DropdownItem } from './Dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'Components/Dropdown',
  component: Dropdown,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A cross-platform dropdown component that adapts to web and React Native environments.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    value: {
      control: 'text',
      description: 'The currently selected value',
    },
    onChange: {
      action: 'changed',
      description: 'Callback fired when selection changes',
    },
    items: {
      control: 'object',
      description: 'Array of dropdown items',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text when no item is selected',
    },
    'aria-label': {
      control: 'text',
      description:
        'Accessible label for the dropdown (required for a11y when no visible label)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample data for stories
const sampleItems: DropdownItem[] = [
  { text: 'Option 1', value: 'option1' },
  { text: 'Option 2', value: 'option2' },
  { text: 'Option 3', value: 'option3' },
];

const sportsItems: DropdownItem[] = [
  { text: 'Baseball', value: 'baseball' },
  { text: 'Basketball', value: 'basketball' },
  { text: 'Football', value: 'football' },
  { text: 'Hockey', value: 'hockey' },
  { text: 'Soccer', value: 'soccer' },
];

const teamItems: DropdownItem[] = [
  { text: 'New York Yankees', value: 'nyy' },
  { text: 'Boston Red Sox', value: 'bos' },
  { text: 'Los Angeles Dodgers', value: 'lad' },
  { text: 'Chicago Cubs', value: 'chc' },
  { text: 'Houston Astros', value: 'hou' },
];

export const Default: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: sampleItems,
    placeholder: 'Select an option...',
    'aria-label': 'Select an option',
  },
};

export const WithSelection: Story = {
  args: {
    value: 'option2',
    onChange: fn(),
    items: sampleItems,
    placeholder: 'Select an option...',
    'aria-label': 'Select an option',
  },
};

export const SportsDropdown: Story = {
  args: {
    value: 'baseball',
    onChange: fn(),
    items: sportsItems,
    placeholder: 'Choose a sport...',
    'aria-label': 'Choose a sport',
  },
};

export const TeamsDropdown: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: teamItems,
    placeholder: 'Select a team...',
    'aria-label': 'Select a team',
  },
};

export const NoPlaceholder: Story = {
  args: {
    value: 'option1',
    onChange: fn(),
    items: sampleItems,
    'aria-label': 'Select an option',
  },
};

export const SingleItem: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: [{ text: 'Only Option', value: 'only' }],
    placeholder: 'Single choice...',
    'aria-label': 'Single choice',
  },
};

export const LongOptions: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: [
      {
        text: 'This is a very long option name that might wrap',
        value: 'long1',
      },
      {
        text: 'Another extremely long option to test wrapping behavior',
        value: 'long2',
      },
      { text: 'Short', value: 'short' },
      { text: 'Medium length option', value: 'medium' },
    ],
    placeholder: 'Choose an option with long text...',
    'aria-label': 'Choose an option',
  },
};

export const ManyOptions: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: Array.from({ length: 20 }, (_, i) => ({
      text: `Option ${i + 1}`,
      value: `option${i + 1}`,
    })),
    placeholder: 'Select from many options...',
    'aria-label': 'Select from many options',
  },
};

// Interactive test story for web dropdowns
export const WithInteraction: Story = {
  args: {
    value: '',
    onChange: fn(),
    items: sampleItems,
    placeholder: 'Select an option...',
    'aria-label': 'Select an option',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // For web, test select interaction
    if (typeof window !== 'undefined') {
      const select = canvas.getByRole('combobox');
      await expect(select).toBeInTheDocument();

      // Test selection change
      await userEvent.selectOptions(select, 'option2');
      await expect(args.onChange).toHaveBeenCalledWith('option2');
    }
  },
};

// Controlled component story
export const Controlled: Story = {
  render: function ControlledDropdown(args) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [value, setValue] = React.useState(args.value);

    return (
      <div style={{ padding: '20px' }}>
        <Dropdown
          {...args}
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          value={value}
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          onChange={setValue}
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          items={args.items || []}
        />
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          Selected value: <strong>{value || 'None'}</strong>
        </p>
      </div>
    );
  },
  args: {
    value: '',
    items: sportsItems,
    placeholder: 'Choose a sport...',
  },
};

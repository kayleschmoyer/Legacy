import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { Filter, FilterSection } from './FilterComponents';
import { FilterDrawer } from './FilterComponents';

const meta: Meta<typeof FilterDrawer> = {
  title: 'Features/Draft/FilterDrawer',
  component: FilterDrawer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A modal drawer component for advanced filtering with multiple sections and options.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    visible: {
      control: 'boolean',
      description: 'Whether the drawer is visible',
    },
    onClose: {
      action: 'drawer-closed',
      description: 'Callback to close the drawer',
    },
    filters: {
      control: 'object',
      description: 'Current filter state',
    },
    onFiltersChange: {
      action: 'filters-changed',
      description: 'Callback when filters are modified',
    },
    sections: {
      control: 'object',
      description: 'Array of filter sections',
    },
    title: {
      control: 'text',
      description: 'Drawer title',
    },
    resetLabel: {
      control: 'text',
      description: 'Reset button label',
    },
    applyLabel: {
      control: 'text',
      description: 'Apply button label',
    },
    onReset: {
      action: 'filters-reset',
      description: 'Callback for reset action',
    },
    variant: {
      control: 'select',
      options: ['slide', 'fade', 'scale'],
      description: 'Animation variant',
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const sampleFilters: Filter = {
  position: '',
  team: '',
  availability: 'available',
  trending: '',
  injury: 'healthy',
};

const footballFilterSections: FilterSection[] = [
  {
    key: 'position',
    title: 'Position',
    options: [
      { label: 'QB', value: 'QB' },
      { label: 'RB', value: 'RB' },
      { label: 'WR', value: 'WR' },
      { label: 'TE', value: 'TE' },
      { label: 'K', value: 'K' },
      { label: 'DEF', value: 'DEF' },
    ],
    allowMultiple: false,
  },
  {
    key: 'availability',
    title: 'Availability',
    options: [
      { label: 'Available', value: 'available' },
      { label: 'Drafted', value: 'drafted' },
      { label: 'Free Agent', value: 'free_agent' },
      { label: 'Waiver', value: 'waiver' },
    ],
    allowMultiple: false,
  },
  {
    key: 'trending',
    title: 'Trending',
    options: [
      { label: 'Up', value: 'up' },
      { label: 'Down', value: 'down' },
      { label: 'Hot', value: 'hot' },
      { label: 'Cold', value: 'cold' },
    ],
    allowMultiple: false,
  },
  {
    key: 'injury',
    title: 'Health',
    options: [
      { label: 'Healthy', value: 'healthy' },
      { label: 'Questionable', value: 'questionable' },
      { label: 'Doubtful', value: 'doubtful' },
      { label: 'Out', value: 'out' },
    ],
    allowMultiple: false,
  },
];

const baseballFilterSections: FilterSection[] = [
  {
    key: 'position',
    title: 'Position',
    options: [
      { label: 'C', value: 'C' },
      { label: '1B', value: '1B' },
      { label: '2B', value: '2B' },
      { label: '3B', value: '3B' },
      { label: 'SS', value: 'SS' },
      { label: 'OF', value: 'OF' },
      { label: 'P', value: 'P' },
    ],
    allowMultiple: false,
  },
  {
    key: 'team',
    title: 'Team',
    options: [
      { label: 'Yankees', value: 'NYY' },
      { label: 'Red Sox', value: 'BOS' },
      { label: 'Dodgers', value: 'LAD' },
      { label: 'Astros', value: 'HOU' },
    ],
    allowMultiple: true,
  },
];

export const Default: Story = {
  args: {
    visible: true,
    onClose: fn(),
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections,
    title: 'Filter Players',
    resetLabel: 'Clear All',
    applyLabel: 'Apply Filters',
    onReset: fn(),
    variant: 'slide',
  },
};

export const Baseball: Story = {
  args: {
    visible: true,
    onClose: fn(),
    filters: { position: 'P', team: '' },
    onFiltersChange: fn(),
    sections: baseballFilterSections,
    title: 'Filter Baseball Players',
    resetLabel: 'Reset',
    applyLabel: 'Apply',
    onReset: fn(),
    variant: 'fade',
  },
};

export const Hidden: Story = {
  args: {
    visible: false,
    onClose: fn(),
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections,
    title: 'Filter Players',
    variant: 'scale',
  },
};

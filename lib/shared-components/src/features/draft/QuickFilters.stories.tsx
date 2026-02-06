import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { Filter, FilterSection } from './FilterComponents';
import { QuickFilters } from './FilterComponents';

const meta: Meta<typeof QuickFilters> = {
  title: 'Features/Draft/QuickFilters',
  component: QuickFilters,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A horizontal or grid layout of filter sections for quick access to common filters.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
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
      description: 'Array of filter sections to display',
    },
    maxVisible: {
      control: 'number',
      description: 'Maximum number of sections to show',
    },
    variant: {
      control: 'select',
      options: ['horizontal', 'grid'],
      description: 'Layout variant',
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
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections.slice(0, 2),
    maxVisible: 2,
    variant: 'horizontal',
  },
};

export const Grid: Story = {
  args: {
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections,
    maxVisible: 4,
    variant: 'grid',
  },
};

export const Baseball: Story = {
  args: {
    filters: { position: '1B', team: 'NYY' },
    onFiltersChange: fn(),
    sections: baseballFilterSections,
    maxVisible: 2,
    variant: 'horizontal',
  },
};

export const SingleSection: Story = {
  args: {
    filters: { position: 'QB' },
    onFiltersChange: fn(),
    sections: [footballFilterSections[0]],
    maxVisible: 1,
    variant: 'horizontal',
  },
};

export const ManySections: Story = {
  args: {
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections,
    maxVisible: 4,
    variant: 'horizontal',
  },
  parameters: {
    layout: 'padded',
  },
};

const FilterDemoComponent = () => {
  const [filters, setFilters] = React.useState<Filter>({
    position: '',
    availability: 'available',
  });

  return (
    <div style={{ padding: '20px' }}>
      <h3>Interactive Filter Demo</h3>
      <p>Current filters: {JSON.stringify(filters)}</p>

      <QuickFilters
        filters={filters}
        onFiltersChange={setFilters}
        sections={footballFilterSections.slice(0, 2)}
        maxVisible={2}
        variant="horizontal"
      />
    </div>
  );
};

export const Demo: Story = {
  render: () => <FilterDemoComponent />,
  parameters: {
    layout: 'padded',
  },
};

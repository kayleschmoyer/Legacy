import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SearchBar } from './SearchBar';
import { ConditionalProviders } from '../../ConditionalProviders';

const meta: Meta<typeof SearchBar> = {
  title: 'Features/Common/SearchBar',
  component: SearchBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Filter-aware search bar with a Sheet modal for rich filter options. Supports position, team, and custom filter categories with single-select options per category.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ConditionalProviders>
        <div style={{ minWidth: '400px' }}>
          <Story />
        </div>
      </ConditionalProviders>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: '',
    onSearch: fn(),
    onFilter: fn(),
    currentFilters: {},
    placeholder: 'Search players...',
  },
};

export const WithSearchValue: Story = {
  args: {
    value: 'Mike Trout',
    onSearch: fn(),
    onFilter: fn(),
    currentFilters: {},
  },
};

export const WithActiveFilters: Story = {
  args: {
    value: '',
    onSearch: fn(),
    onFilter: fn(),
    currentFilters: { position: 'OF', team: 'LA Dodgers' },
  },
};

export const CustomPlaceholder: Story = {
  args: {
    value: '',
    onSearch: fn(),
    onFilter: fn(),
    currentFilters: {},
    placeholder: 'Find free agents...',
  },
};

export const CustomFilterOptions: Story = {
  args: {
    value: '',
    onSearch: fn(),
    onFilter: fn(),
    currentFilters: {},
    filterOptions: [
      {
        label: 'Status',
        value: null,
        options: [
          { label: 'All', value: null },
          { label: 'Active', value: 'active' },
          { label: 'Injured', value: 'injured' },
          { label: 'Free Agent', value: 'free-agent' },
        ],
      },
    ],
    placeholder: 'Search by status...',
  },
};

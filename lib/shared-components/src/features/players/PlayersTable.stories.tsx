import type { Meta, StoryObj } from '@storybook/react';
import { PlayersTable } from './PlayersTable';
import { ConditionalProviders } from '../ConditionalProviders';

const meta: Meta<typeof PlayersTable> = {
  title: 'Features/Players/PlayersTable',
  component: PlayersTable,
  decorators: [
    (Story) => (
      <ConditionalProviders>
        <Story />
      </ConditionalProviders>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A comprehensive table component for displaying player data with search, sorting, and pagination capabilities.',
      },
    },
  },
  argTypes: {
    onPlayerSelect: { action: 'player selected' },
    pageSize: {
      control: { type: 'number', min: 5, max: 100, step: 5 },
      description: 'Number of players to display per page',
    },
    showSearch: {
      control: 'boolean',
      description: 'Show/hide the search functionality',
    },
    showSorting: {
      control: 'boolean',
      description: 'Show/hide the sorting dropdown',
    },
    showPagination: {
      control: 'boolean',
      description: 'Show/hide pagination controls',
    },
    title: {
      control: 'text',
      description: 'Table title',
    },
    selectable: {
      control: 'boolean',
      description: 'Allow selecting players with action buttons',
    },
    compact: {
      control: 'boolean',
      description: 'Use compact styling for smaller spaces',
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'All Players',
    pageSize: 20,
    showSearch: true,
    showSorting: true,
    showPagination: true,
    selectable: false,
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    title: 'Players (Compact)',
    pageSize: 15,
    showSearch: true,
    showSorting: true,
    showPagination: true,
    selectable: false,
    compact: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Compact version suitable for smaller spaces or embedded use.',
      },
    },
  },
};

export const Selectable: Story = {
  args: {
    title: 'Select Player',
    pageSize: 10,
    showSearch: true,
    showSorting: true,
    showPagination: false,
    selectable: true,
    compact: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Table with selection functionality for choosing players.',
      },
    },
  },
};

export const SearchOnly: Story = {
  args: {
    title: 'Player Search',
    pageSize: 25,
    showSearch: true,
    showSorting: false,
    showPagination: false,
    selectable: false,
    compact: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Simplified table with only search functionality.',
      },
    },
  },
};

export const MinimalTable: Story = {
  args: {
    title: 'Players List',
    pageSize: 50,
    showSearch: false,
    showSorting: false,
    showPagination: false,
    selectable: false,
    compact: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Minimal table without any controls, suitable for simple listings.',
      },
    },
  },
};

export const LargeDataset: Story = {
  args: {
    title: 'All Players Database',
    pageSize: 100,
    showSearch: true,
    showSorting: true,
    showPagination: true,
    selectable: false,
    compact: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Configuration for handling large datasets with full functionality.',
      },
    },
  },
};

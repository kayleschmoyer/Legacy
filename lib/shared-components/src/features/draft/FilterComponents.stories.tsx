import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import {
  Filter,
  FilterChip,
  FilterDrawer,
  FilterSection,
  QuickFilters,
} from './FilterComponents';

const meta: Meta<typeof FilterChip> = {
  title: 'Features/Draft/FilterChip',
  component: FilterChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'An animated filter chip component for selecting filter options in draft interfaces.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Display text for the chip',
    },
    value: {
      control: 'text',
      description: 'Value associated with the chip',
    },
    isSelected: {
      control: 'boolean',
      description: 'Whether the chip is currently selected',
    },
    onPress: {
      action: 'chip-pressed',
      description: 'Callback when chip is pressed',
    },
    variant: {
      control: 'select',
      options: ['default', 'accent', 'outline'],
      description: 'Visual variant of the chip',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: 'Size of the chip',
    },
  },
};

// Export meta instead of default to avoid conflicts
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Quarterback',
    value: 'QB',
    isSelected: false,
    onPress: fn(),
    variant: 'default',
    size: 'medium',
  },
};

export const Selected: Story = {
  args: {
    label: 'Running Back',
    value: 'RB',
    isSelected: true,
    onPress: fn(),
    variant: 'default',
    size: 'medium',
  },
};

export const AccentVariant: Story = {
  args: {
    label: 'Wide Receiver',
    value: 'WR',
    isSelected: false,
    onPress: fn(),
    variant: 'accent',
    size: 'medium',
  },
};

export const AccentSelected: Story = {
  args: {
    label: 'Tight End',
    value: 'TE',
    isSelected: true,
    onPress: fn(),
    variant: 'accent',
    size: 'medium',
  },
};

export const OutlineVariant: Story = {
  args: {
    label: 'Defense',
    value: 'DEF',
    isSelected: false,
    onPress: fn(),
    variant: 'outline',
    size: 'medium',
  },
};

export const OutlineSelected: Story = {
  args: {
    label: 'Kicker',
    value: 'K',
    isSelected: true,
    onPress: fn(),
    variant: 'outline',
    size: 'medium',
  },
};

export const SmallSize: Story = {
  args: {
    label: 'Available',
    value: 'available',
    isSelected: false,
    onPress: fn(),
    variant: 'default',
    size: 'small',
  },
};

export const LargeSize: Story = {
  args: {
    label: 'Trending Up',
    value: 'trending_up',
    isSelected: true,
    onPress: fn(),
    variant: 'accent',
    size: 'large',
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Super Long Position Name',
    value: 'long_position',
    isSelected: false,
    onPress: fn(),
    variant: 'default',
    size: 'medium',
  },
};

export const WithInteraction: Story = {
  args: {
    label: 'Interactive Chip',
    value: 'interactive',
    isSelected: false,
    onPress: fn(),
    variant: 'default',
    size: 'medium',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test chip click
    const chip = canvas.getByText(String(args.label));
    await userEvent.click(chip);
    await expect(args.onPress).toHaveBeenCalled();
  },
};

// Quick Filters Stories
const QuickFiltersMeta: Meta<typeof QuickFilters> = {
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

type QuickFiltersStory = StoryObj<typeof QuickFiltersMeta>;

// Sample filter data for sports
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

export const QuickFiltersDefault: QuickFiltersStory = {
  args: {
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections.slice(0, 2),
    maxVisible: 2,
    variant: 'horizontal',
  },
};

export const QuickFiltersGrid: QuickFiltersStory = {
  args: {
    filters: sampleFilters,
    onFiltersChange: fn(),
    sections: footballFilterSections,
    maxVisible: 4,
    variant: 'grid',
  },
};

export const QuickFiltersBaseball: QuickFiltersStory = {
  args: {
    filters: { position: '1B', team: 'NYY' },
    onFiltersChange: fn(),
    sections: baseballFilterSections,
    maxVisible: 2,
    variant: 'horizontal',
  },
};

export const QuickFiltersSingle: QuickFiltersStory = {
  args: {
    filters: { position: 'QB' },
    onFiltersChange: fn(),
    sections: [footballFilterSections[0]], // Just position
    maxVisible: 1,
    variant: 'horizontal',
  },
};

export const QuickFiltersMany: QuickFiltersStory = {
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

// Filter Drawer Stories
const FilterDrawerMeta: Meta<typeof FilterDrawer> = {
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

type FilterDrawerStory = StoryObj<typeof FilterDrawerMeta>;

export const FilterDrawerDefault: FilterDrawerStory = {
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

export const FilterDrawerBaseball: FilterDrawerStory = {
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

export const FilterDrawerHidden: FilterDrawerStory = {
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

export default FilterDrawerMeta;

// Also export the chip meta for reference
export { meta as FilterChipMeta, QuickFiltersMeta };

// Chip Variants Showcase
export const ChipVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
      }}
    >
      <div>
        <h3>Default Variant</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <FilterChip
            label="Unselected"
            value="1"
            isSelected={false}
            onPress={fn()}
            variant="default"
            size="medium"
          />
          <FilterChip
            label="Selected"
            value="2"
            isSelected={true}
            onPress={fn()}
            variant="default"
            size="medium"
          />
        </div>
      </div>

      <div>
        <h3>Accent Variant</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <FilterChip
            label="Unselected"
            value="3"
            isSelected={false}
            onPress={fn()}
            variant="accent"
            size="medium"
          />
          <FilterChip
            label="Selected"
            value="4"
            isSelected={true}
            onPress={fn()}
            variant="accent"
            size="medium"
          />
        </div>
      </div>

      <div>
        <h3>Outline Variant</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <FilterChip
            label="Unselected"
            value="5"
            isSelected={false}
            onPress={fn()}
            variant="outline"
            size="medium"
          />
          <FilterChip
            label="Selected"
            value="6"
            isSelected={true}
            onPress={fn()}
            variant="outline"
            size="medium"
          />
        </div>
      </div>

      <div>
        <h3>Size Variants</h3>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <FilterChip
            label="Small"
            value="7"
            isSelected={false}
            onPress={fn()}
            variant="default"
            size="small"
          />
          <FilterChip
            label="Medium"
            value="8"
            isSelected={false}
            onPress={fn()}
            variant="default"
            size="medium"
          />
          <FilterChip
            label="Large"
            value="9"
            isSelected={false}
            onPress={fn()}
            variant="default"
            size="large"
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

// Interactive Filter Demo
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

export const FilterDemo: Story = {
  render: () => <FilterDemoComponent />,
  parameters: {
    layout: 'padded',
  },
};

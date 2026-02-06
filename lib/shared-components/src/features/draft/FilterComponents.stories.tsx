import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { FilterChip } from './FilterComponents';

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

export default meta;

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

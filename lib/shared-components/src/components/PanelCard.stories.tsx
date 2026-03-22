import type { Meta, StoryObj } from '@storybook/react';
import { Text } from 'tamagui';
import { PanelCard } from './PanelCard';

const meta: Meta<typeof PanelCard> = {
  title: 'Components/PanelCard',
  component: PanelCard as Meta<typeof PanelCard>['component'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Styled card panel with optional interactive and compact variants.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <Text>Panel content</Text>,
  },
};

export const Interactive: Story = {
  args: {
    interactive: true,
    children: <Text>Interactive panel — hover and press for effects</Text>,
  },
};

export const Compact: Story = {
  args: {
    compact: true,
    children: <Text>Compact panel with smaller padding</Text>,
  },
};

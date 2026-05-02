import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { UnifiedLoadingPanel } from './UnifiedLoadingPanel';

const meta: Meta<typeof UnifiedLoadingPanel> = {
  title: 'Components/UnifiedLoadingPanel',
  component: UnifiedLoadingPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The single cross-platform loading indicator. Consolidates 6+ LoadingPanel implementations scattered across web/app/shared.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['small', 'large'] },
    loading: { control: 'boolean' },
    fullScreen: { control: 'boolean' },
    message: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { message: 'Loading the dugout…' },
};

export const Small: Story = {
  args: { size: 'small', message: 'Refreshing standings…' },
};

export const NoMessage: Story = { args: {} };

export const NotLoading: Story = {
  args: { loading: false },
};

export const FullScreen: Story = {
  render: () => (
    <YStack width={520} height={260} backgroundColor="$bg" borderRadius={16}>
      <UnifiedLoadingPanel fullScreen message="Drafting Babe Ruth…" />
    </YStack>
  ),
};

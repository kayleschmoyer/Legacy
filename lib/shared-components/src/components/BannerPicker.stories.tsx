import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { BannerPicker } from './BannerPicker';

const meta: Meta<typeof BannerPicker> = {
  title: 'Components/BannerPicker',
  component: BannerPicker,
  parameters: {
    docs: {
      description: {
        component:
          'Lets users choose a league banner from curated presets or enter a custom URL. Banners are wide-format (3:1).',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSelect: fn(),
  },
};

export const WithCurrentUrl: Story = {
  args: {
    currentUrl: '/presets/banner-blue.png',
    onSelect: fn(),
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    onSelect: fn(),
  },
};

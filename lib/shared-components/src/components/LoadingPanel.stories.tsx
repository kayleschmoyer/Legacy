import type { Meta, StoryObj } from '@storybook/react';
import { LoadingPanel } from '../LoadingPanel';

const meta: Meta<typeof LoadingPanel> = {
  title: 'Components/LoadingPanel',
  component: LoadingPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A loading panel component that displays a spinner',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InContainer: Story = {
  decorators: [
    (Story) => (
      <div
        style={{ width: '300px', height: '200px', border: '1px solid #ccc' }}
      >
        <Story />
      </div>
    ),
  ],
};

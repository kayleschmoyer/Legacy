import type { Meta, StoryObj } from '@storybook/react';
import { LiveStream } from './LiveStream';

const meta: Meta<typeof LiveStream> = {
  title: 'Features/Draft/LiveStream',
  component: LiveStream,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Live stream panel displayed during a draft broadcast.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    leagueId: '1',
  },
};

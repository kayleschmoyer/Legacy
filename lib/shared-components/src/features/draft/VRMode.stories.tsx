import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { VRMode } from './VRMode';

const meta: Meta<typeof VRMode> = {
  title: 'Features/Draft/VRMode',
  component: VRMode,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'VR draft mode overlay showing sport name and an exit button.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    sport: 'baseball',
    onClose: fn(),
  },
};

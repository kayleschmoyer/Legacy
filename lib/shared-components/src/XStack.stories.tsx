import type { Meta, StoryObj } from '@storybook/react';
import { XStack, YStack, H1, H2, H3, Paragraph } from './Layout';
import { Button } from './Button';

// XStack Stories
const XStackMeta: Meta<typeof XStack> = {
  title: 'Layout/XStack',
  component: XStack,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A horizontal stack component that arranges children side by side',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    space: {
      control: 'select',
      options: ['$1', '$2', '$3', '$4', '$5'],
      description: 'Space between children',
    },
    alignItems: {
      control: 'select',
      options: ['flex-start', 'center', 'flex-end', 'stretch'],
      description: 'Cross-axis alignment',
    },
    justifyContent: {
      control: 'select',
      options: [
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
      ],
      description: 'Main axis alignment',
    },
  },
};

export default XStackMeta;
type XStackStory = StoryObj<typeof XStackMeta>;

export const DefaultXStack: XStackStory = {
  args: {
    children: [
      <Button key="1" onPress={() => {}}>
        Button 1
      </Button>,
      <Button key="2" onPress={() => {}}>
        Button 2
      </Button>,
      <Button key="3" onPress={() => {}}>
        Button 3
      </Button>,
    ],
  },
};

export const CenteredXStack: XStackStory = {
  args: {
    alignItems: 'center',
    justifyContent: 'center',
    children: [
      <Paragraph key="1">Text</Paragraph>,
      <Button key="2" onPress={() => {}}>
        Action
      </Button>,
      <Paragraph key="3">More text</Paragraph>,
    ],
  },
};

export const SpaceBetweenXStack: XStackStory = {
  args: {
    justifyContent: 'space-between',
    width: 400,
    children: [
      <Button key="1" onPress={() => {}}>
        Left
      </Button>,
      <Button key="2" onPress={() => {}}>
        Center
      </Button>,
      <Button key="3" onPress={() => {}}>
        Right
      </Button>,
    ],
  },
};

export const LargeSpaceXStack: XStackStory = {
  args: {
    space: '$5',
    children: [
      <Button key="1" onPress={() => {}}>
        Wide
      </Button>,
      <Button key="2" onPress={() => {}}>
        Spacing
      </Button>,
      <Button key="3" onPress={() => {}}>
        Example
      </Button>,
    ],
  },
};

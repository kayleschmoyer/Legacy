import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Paragraph, XStack } from './Layout';
import { Button } from './Button';

// XStack Stories
const XStackMeta: Meta<typeof XStack> = {
  title: 'Layout/XStack',
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Tamagui component type gap with Storybook Meta
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
    ai: {
      control: 'select',
      options: ['flex-start', 'center', 'flex-end', 'stretch'],
      description: 'Cross-axis alignment (alignItems shorthand)',
    },
    jc: {
      control: 'select',
      options: [
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
      ],
      description: 'Main axis alignment (justifyContent shorthand)',
    },
  },
};

export default XStackMeta;
type XStackStory = StoryObj<typeof XStackMeta>;

export const DefaultXStack: XStackStory = {
  args: {
    children: [
      <Button key="1" onPress={fn()}>
        Button 1
      </Button>,
      <Button key="2" onPress={fn()}>
        Button 2
      </Button>,
      <Button key="3" onPress={fn()}>
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
      <Button key="2" onPress={fn()}>
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
      <Button key="1" onPress={fn()}>
        Left
      </Button>,
      <Button key="2" onPress={fn()}>
        Center
      </Button>,
      <Button key="3" onPress={fn()}>
        Right
      </Button>,
    ],
  },
};

export const LargeSpaceXStack: XStackStory = {
  args: {
    space: '$5',
    children: [
      <Button key="1" onPress={fn()}>
        Wide
      </Button>,
      <Button key="2" onPress={fn()}>
        Spacing
      </Button>,
      <Button key="3" onPress={fn()}>
        Example
      </Button>,
    ],
  },
};

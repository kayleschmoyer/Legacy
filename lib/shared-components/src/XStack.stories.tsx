import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { XStack } from './components/Stack';
import { Separator } from './components/Separator';
import { Paragraph } from './Layout';
import { Button } from './Button';

const XStackMeta: Meta<typeof XStack> = {
  title: 'Layout/XStack',
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Tamagui component type gap with Storybook Meta
  component: XStack,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Horizontal layout primitive. Default gap $3 (12 px), items centered on the cross axis. Pass `separator` for inline dividers.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    gap: {
      control: 'select',
      options: ['$1', '$2', '$3', '$4', '$5', '$6'],
      description: 'Space between children (spacing-scale token)',
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
      description: 'Main-axis alignment',
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

export const WithSeparator: XStackStory = {
  render: () => (
    <XStack gap="$3" height={48}>
      <Button onPress={fn()}>12 Teams</Button>
      <Separator vertical />
      <Button onPress={fn()}>Week 14</Button>
      <Separator vertical />
      <Button onPress={fn()}>Live</Button>
    </XStack>
  ),
};

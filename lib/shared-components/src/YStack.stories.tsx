import type { Meta, StoryObj } from '@storybook/react';
import { YStack, H1, H2, H3, Paragraph, Separator } from './Layout';
import { Button } from './Button';

// YStack Stories
const YStackMeta: Meta<typeof YStack> = {
  title: 'Layout/YStack',
  component: YStack,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A vertical stack component that arranges children vertically',
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
      description: 'Main axis alignment',
    },
  },
};

export default YStackMeta;
type YStackStory = StoryObj<typeof YStackMeta>;

export const DefaultYStack: YStackStory = {
  args: {
    children: [
      <H2 key="1">Section Title</H2>,
      <Paragraph key="2">
        Some descriptive text that explains the content below.
      </Paragraph>,
      <Button key="3" onPress={() => {}}>
        Action Button
      </Button>,
    ],
  },
};

export const CenteredYStack: YStackStory = {
  args: {
    alignItems: 'center',
    children: [
      <H1 key="1">Centered Content</H1>,
      <Paragraph key="2">This content is centered horizontally</Paragraph>,
      <Button key="3" onPress={() => {}}>
        Centered Button
      </Button>,
    ],
  },
};

export const SpacedYStack: YStackStory = {
  args: {
    space: '$4',
    children: [
      <H2 key="1">Large Spacing Example</H2>,
      <Paragraph key="2">There's more space between these elements.</Paragraph>,
      <Separator key="3" />,
      <Paragraph key="4">Notice the larger gaps?</Paragraph>,
      <Button key="5" onPress={() => {}}>
        Spaced Button
      </Button>,
    ],
  },
};

export const FormLayoutYStack: YStackStory = {
  args: {
    space: '$3',
    width: 300,
    children: [
      <H3 key="1">User Information</H3>,
      <Paragraph key="2">Please fill out the form below:</Paragraph>,
      <Separator key="3" />,
      <Button key="4" onPress={() => {}} variant="outlined">
        Name Field
      </Button>,
      <Button key="5" onPress={() => {}} variant="outlined">
        Email Field
      </Button>,
      <Button key="6" onPress={() => {}} variant="outlined">
        Phone Field
      </Button>,
      <Button key="7" onPress={() => {}}>
        Submit
      </Button>,
    ],
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import {
  Card,
  ScreenContainer,
  XStack,
  YStack,
  H1,
  H2,
  H3,
  Paragraph,
  Separator,
} from './Layout';
import { Button } from './Button';

// Card Stories
const CardMeta: Meta<typeof Card> = {
  title: 'Layout/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A card component with optional title and subtitle',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'Card title',
    },
    subtitle: {
      control: 'text',
      description: 'Card subtitle',
    },
  },
};

export default CardMeta;
type CardStory = StoryObj<typeof CardMeta>;

export const DefaultCard: CardStory = {
  args: {
    children: (
      <Paragraph>
        This is the card content. You can put any components here.
      </Paragraph>
    ),
  },
};

export const CardWithTitle: CardStory = {
  args: {
    title: 'Card Title',
    children: <Paragraph>This card has a title and some content.</Paragraph>,
  },
};

export const CardWithTitleAndSubtitle: CardStory = {
  args: {
    title: 'Main Title',
    subtitle: 'This is a subtitle that provides additional context',
    children: (
      <YStack>
        <Paragraph>
          This card demonstrates both title and subtitle functionality.
        </Paragraph>
        <Button onPress={() => {}}>Action Button</Button>
      </YStack>
    ),
  },
};

export const CardWithComplexContent: CardStory = {
  args: {
    title: 'Player Statistics',
    subtitle: 'Season 2024 Performance',
    children: (
      <YStack>
        <XStack>
          <Paragraph flex={1}>Games Played:</Paragraph>
          <Paragraph>42</Paragraph>
        </XStack>
        <Separator />
        <XStack>
          <Paragraph flex={1}>Points Scored:</Paragraph>
          <Paragraph>1,247</Paragraph>
        </XStack>
        <Separator />
        <XStack>
          <Paragraph flex={1}>Average:</Paragraph>
          <Paragraph>29.7</Paragraph>
        </XStack>
      </YStack>
    ),
  },
};

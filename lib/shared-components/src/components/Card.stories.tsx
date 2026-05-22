import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card as Meta<typeof Card>['component'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Surface card built on `$surfaceCard`. Use `interactive` for hover/press states and `premium` for the gold-glow championship variant.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function Eyebrow({
  children,
  gold,
}: {
  children: string;
  gold?: boolean;
}): React.JSX.Element {
  return (
    <Text
      fontFamily="$heading"
      fontSize={11}
      fontWeight="700"
      letterSpacing={1.3}
      textTransform="uppercase"
      color={gold ? '$brandGold' : '$textMuted'}
    >
      {children}
    </Text>
  );
}

function Heading({ children }: { children: string }): React.JSX.Element {
  return (
    <Text fontFamily="$heading" fontSize={18} fontWeight="700" color="$color">
      {children}
    </Text>
  );
}

function Body({ children }: { children: string }): React.JSX.Element {
  return (
    <Text fontFamily="$body" fontSize={14} color="$textMuted" lineHeight={21}>
      {children}
    </Text>
  );
}

export const Default: Story = {
  render: () => (
    <Card width={360}>
      <Eyebrow>Standings</Eyebrow>
      <Heading>Brooklyn Bridegrooms</Heading>
      <Body>3rd in division · 8-4 · Streaks W3</Body>
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card interactive width={360}>
      <Eyebrow>Active draft</Eyebrow>
      <Heading>1947 Negro Leagues Dynasty</Heading>
      <Body>Round 7 of 22 · You're on the clock.</Body>
    </Card>
  ),
};

export const Premium: Story = {
  render: () => (
    <Card premium width={360}>
      <Eyebrow gold>Champion · 2025</Eyebrow>
      <Heading>Cooperstown Society</Heading>
      <Body>Won 3 of last 5 seasons · 18 trophies</Body>
    </Card>
  ),
};

export const PremiumInteractive: Story = {
  render: () => (
    <Card interactive premium width={360}>
      <Eyebrow gold>Champion · 2025</Eyebrow>
      <Heading>Cooperstown Society</Heading>
      <Body>Won 3 of last 5 seasons · 18 trophies</Body>
    </Card>
  ),
};

export const Compact: Story = {
  render: () => (
    <Card compact width={320}>
      <Eyebrow>Note</Eyebrow>
      <Body>Compact padding for dense lists.</Body>
    </Card>
  ),
};

export const Gallery: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <XStack flexWrap="wrap" gap="$4" maxWidth={840}>
      <YStack gap="$2" width={400}>
        <Eyebrow>Card · default</Eyebrow>
        <Card>
          <Eyebrow>Standings</Eyebrow>
          <Heading>Brooklyn Bridegrooms</Heading>
          <Body>3rd in division · 8-4 · Streaks W3</Body>
        </Card>
      </YStack>
      <YStack gap="$2" width={400}>
        <Eyebrow>Card · interactive</Eyebrow>
        <Card interactive>
          <Eyebrow>Active draft</Eyebrow>
          <Heading>1947 Negro Leagues Dynasty</Heading>
          <Body>Round 7 of 22 · You're on the clock.</Body>
        </Card>
      </YStack>
      <YStack gap="$2" width={400}>
        <Eyebrow>Card · gold (premium)</Eyebrow>
        <Card premium>
          <Eyebrow gold>Champion · 2025</Eyebrow>
          <Heading>Cooperstown Society</Heading>
          <Body>Won 3 of last 5 seasons · 18 trophies</Body>
        </Card>
      </YStack>
    </XStack>
  ),
};

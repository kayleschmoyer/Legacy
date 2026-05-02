import type { Meta, StoryObj } from '@storybook/react';
import { Button, Text, YStack } from 'tamagui';
import { Popover } from './Popover';

const meta: Meta<typeof Popover> = {
  title: 'Components/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Menu: Story = {
  render: () => (
    <Popover trigger={<Button>Era</Button>}>
      <YStack gap="$1" minWidth={160}>
        <Text
          fontFamily="$body"
          padding="$2"
          cursor="pointer"
          hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
          borderRadius={8}
        >
          Dead Ball
        </Text>
        <Text
          fontFamily="$body"
          padding="$2"
          cursor="pointer"
          hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
          borderRadius={8}
        >
          Live Ball
        </Text>
        <Text
          fontFamily="$body"
          padding="$2"
          cursor="pointer"
          hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
          borderRadius={8}
        >
          Modern
        </Text>
      </YStack>
    </Popover>
  ),
};

export const Info: Story = {
  render: () => (
    <Popover trigger={<Button>Win Probability</Button>}>
      <YStack gap="$2" maxWidth={260}>
        <Text
          fontFamily="$heading"
          fontSize={11}
          letterSpacing={1.4}
          color="$textMuted"
        >
          HOW IT WORKS
        </Text>
        <Text fontFamily="$body" fontSize={13} color="$color">
          Win probability is computed live from each pitch's expected run value,
          updated every half-inning.
        </Text>
      </YStack>
    </Popover>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { Linescore } from './Linescore';

const meta: Meta<typeof Linescore> = {
  title: 'Components/Scoreboard/Linescore',
  component: Linescore,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <YStack
        backgroundColor="$surfacePanel"
        padding="$3"
        borderRadius="$3"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    awayAbbr: 'NYY',
    homeAbbr: 'BOS',
    awayInnings: [1, 0, 0, 2, 0, 0, 1],
    homeInnings: [0, 1, 0, 0, 0, 2, 0],
    awayHits: 8,
    homeHits: 7,
    awayErrors: 0,
    homeErrors: 1,
    currentInningIndex: 6,
    currentInningHalf: 'Top',
  },
};

export const ExtraInnings: Story = {
  args: {
    awayAbbr: 'PHI',
    homeAbbr: 'WSH',
    awayInnings: [0, 0, 2, 0, 1, 0, 1, 1, 0, 0, 1],
    homeInnings: [1, 0, 0, 3, 0, 0, 2, 0, 0, 0, 0],
    awayHits: 11,
    homeHits: 9,
    awayErrors: 0,
    homeErrors: 1,
  },
};

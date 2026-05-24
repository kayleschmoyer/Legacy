import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { PlayerCard } from './PlayerCard';

const meta: Meta<typeof PlayerCard> = {
  title: 'Components/PlayerCard',
  component: PlayerCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Pitcher: Story = {
  args: {
    name: 'Randy Johnson',
    position: 'P',
    meta: '1998 · ARI · 329 K · 2.48 ERA',
    stat: 24.5,
  },
};

export const Outfielder: Story = {
  args: {
    name: 'Barry Bonds',
    position: 'OF',
    meta: '2001 · SF · .328 · 73 HR',
    stat: 31.2,
  },
};

export const Shortstop: Story = {
  args: {
    name: 'Lou Gehrig',
    position: 'SS',
    meta: '1927 · NYY · .373 · 47 HR',
    stat: 27.8,
  },
};

export const Interactive: Story = {
  args: {
    name: 'Babe Ruth',
    position: 'OF',
    meta: '1927 · NYY · .356 · 60 HR',
    stat: 35.1,
    onPress: () => undefined,
  },
};

export const NoMeta: Story = {
  args: {
    name: 'Cy Young',
    position: 'P',
    stat: 18.0,
  },
};

export const Stack: Story = {
  render: () => (
    <YStack gap={10} width={520}>
      <PlayerCard
        name="Randy Johnson"
        position="P"
        meta="1998 · ARI · 329 K · 2.48 ERA"
        stat={24.5}
      />
      <PlayerCard
        name="Barry Bonds"
        position="OF"
        meta="2001 · SF · .328 · 73 HR"
        stat={31.2}
      />
      <PlayerCard
        name="Lou Gehrig"
        position="SS"
        meta="1927 · NYY · .373 · 47 HR"
        stat={27.8}
      />
      <PlayerCard
        name="Johnny Bench"
        position="C"
        meta="1972 · CIN · .270 · 40 HR"
        stat={22.1}
      />
    </YStack>
  ),
};

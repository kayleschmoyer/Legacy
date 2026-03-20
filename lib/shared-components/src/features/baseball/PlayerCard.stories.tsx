import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { BaseballPlayer, PlayerCard, PlayerCardList } from './PlayerCard';

const batter: BaseballPlayer = {
  id: 1,
  name: 'Mike Trout',
  position: 'CF',
  team: 'LAA',
  battingAvg: 0.301,
  homeRuns: 35,
  rbi: 90,
  jerseyNumber: 27,
  age: 32,
  fantasyPoints: 285,
};

const pitcher: BaseballPlayer = {
  id: 2,
  name: 'Gerrit Cole',
  position: 'SP',
  team: 'NYY',
  era: 2.63,
  wins: 15,
  saves: 0,
  jerseyNumber: 45,
  age: 33,
  fantasyPoints: 210,
};

const reliever: BaseballPlayer = {
  id: 3,
  name: 'Edwin Diaz',
  position: 'RP',
  team: 'NYM',
  era: 1.31,
  wins: 3,
  saves: 32,
  jerseyNumber: 39,
  age: 30,
};

const rosterSample: BaseballPlayer[] = [
  batter,
  pitcher,
  reliever,
  {
    id: 4,
    name: 'Mookie Betts',
    position: 'RF',
    team: 'LAD',
    battingAvg: 0.307,
    homeRuns: 39,
    rbi: 107,
    jerseyNumber: 50,
    age: 31,
  },
  {
    id: 5,
    name: 'Shohei Ohtani',
    position: 'DH',
    team: 'LAD',
    battingAvg: 0.304,
    homeRuns: 54,
    rbi: 130,
    jerseyNumber: 17,
    age: 30,
    fantasyPoints: 420,
  },
];

const meta: Meta<typeof PlayerCard> = {
  title: 'Features/Baseball/PlayerCard',
  component: PlayerCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Baseball player card showing name, position, team, jersey number, and stats (batting or pitching). Supports compact and full modes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    showStats: {
      control: 'select',
      options: ['batting', 'pitching', 'both'],
    },
    compact: { control: 'boolean' },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ maxWidth: '400px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Batter: Story = {
  args: {
    player: batter,
    onPress: fn(),
  },
};

export const Pitcher: Story = {
  args: {
    player: pitcher,
    onPress: fn(),
  },
};

export const Reliever: Story = {
  args: {
    player: reliever,
    onPress: fn(),
  },
};

export const CompactBatter: Story = {
  args: {
    player: batter,
    compact: true,
    onPress: fn(),
  },
};

export const CompactPitcher: Story = {
  args: {
    player: pitcher,
    compact: true,
    onPress: fn(),
  },
};

export const BattingStatsOnly: Story = {
  args: {
    player: batter,
    showStats: 'batting',
  },
};

export const NoJerseyNumber: Story = {
  args: {
    player: { ...batter, jerseyNumber: undefined },
  },
};

export const WithFantasyPoints: Story = {
  args: {
    player: { ...batter, fantasyPoints: 300 },
  },
};

export const PlayerList: StoryObj<typeof PlayerCardList> = {
  render: () => (
    <PlayerCardList
      players={rosterSample}
      onPlayerPress={fn()}
      showStats="both"
    />
  ),
};

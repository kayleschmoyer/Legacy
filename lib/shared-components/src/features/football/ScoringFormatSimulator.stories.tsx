import type { Meta, StoryObj } from '@storybook/react';
import {
  ScoringFormatSimulator,
  type ScoringFormatSimulatorPlayer,
} from './ScoringFormatSimulator';

const players: ScoringFormatSimulatorPlayer[] = [
  {
    playerId: 1,
    playerName: "Ja'Marr Chase",
    position: 'WR',
    totalPoints: 24.1,
    receivingGames: [{ rec: 9, yds: 121, td: 1 }],
  },
  {
    playerId: 2,
    playerName: 'Travis Kelce',
    position: 'TE',
    totalPoints: 12.4,
    receivingGames: [{ rec: 6, yds: 64, td: 0 }],
  },
  {
    playerId: 3,
    playerName: 'Derrick Henry',
    position: 'RB',
    totalPoints: 18.2,
    receivingGames: [{ rec: 1, yds: 6, td: 0 }],
  },
  {
    playerId: 4,
    playerName: 'Josh Allen',
    position: 'QB',
    totalPoints: 26.8,
    receivingGames: [],
  },
];

const meta: Meta<typeof ScoringFormatSimulator> = {
  title: 'Features/Football/ScoringFormatSimulator',
  component: ScoringFormatSimulator,
  parameters: {
    docs: {
      description: {
        component:
          'Premium "what would my score be if my league used PPR?" preview for football Team Detail (LS-6454). Collapsed by default; expand it to re-score the week under Standard, Half-PPR and PPR.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ScoringFormatSimulator>;

/** Premium manager in a PPR league — both other formats cost them points. */
export const PremiumPprLeague: Story = {
  args: {
    players,
    teamTotalPoints: 81.5,
    leagueReceptionPoints: 1,
    isPremium: true,
  },
};

/** Premium manager in a Standard league — PPR would have been a big gain. */
export const PremiumStandardLeague: Story = {
  args: {
    players,
    teamTotalPoints: 65.5,
    leagueReceptionPoints: 0,
    isPremium: true,
  },
};

/** Free manager — the panel opens onto the locked upgrade card. */
export const Locked: Story = {
  args: {
    players,
    teamTotalPoints: 81.5,
    leagueReceptionPoints: 1,
    isPremium: false,
    onUpgrade: () => undefined,
  },
};

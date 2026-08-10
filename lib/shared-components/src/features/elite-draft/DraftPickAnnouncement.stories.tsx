import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { DraftPickAnnouncement } from './DraftPickAnnouncement';
import type { DraftPlayer, NotablePlaySummary } from './types';

const player: DraftPlayer = {
  id: 1,
  name: 'Infielder One',
  position: '1B',
  avg: 0.318,
  hr: 24,
  rbi: 88,
} as DraftPlayer;

const meta: Meta<typeof DraftPickAnnouncement> = {
  title: 'Features/EliteDraft/DraftPickAnnouncement',
  component: DraftPickAnnouncement,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <YStack height={480} position="relative" backgroundColor="$background">
        <Story />
      </YStack>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const myPickArgs = {
  announcement: {
    player,
    pickNumber: 5,
    round: 1,
    roundPickNumber: 5,
    isMyPick: true,
    isAuto: false,
    teamName: 'Cooperstown Society',
  },
  celebrate: true,
  onDismiss: () => undefined,
};

export const MyPick: Story = {
  args: myPickArgs,
};

export const OtherTeamPick: Story = {
  args: {
    announcement: {
      player,
      pickNumber: 6,
      round: 1,
      roundPickNumber: 6,
      isMyPick: false,
      isAuto: false,
      teamName: 'Brooklyn Bridegrooms',
    },
    celebrate: false,
    onDismiss: () => undefined,
  },
};

export const AutoPick: Story = {
  args: {
    announcement: {
      player,
      pickNumber: 7,
      round: 1,
      roundPickNumber: 7,
      isMyPick: false,
      isAuto: true,
      teamName: 'Iron Horse',
    },
    celebrate: false,
    onDismiss: () => undefined,
  },
};

const notablePlay: NotablePlaySummary = {
  mlbPlayerId: 1,
  playerRole: 'batter',
  gameDate: '2026-08-01',
  eventType: 'home_run',
  description: 'Deep drive to left field, home run.',
  exitVelocity: 104.3,
  launchAngle: 27,
  hitDistance: 412,
  pitchSpeed: null,
  pitchType: null,
  filmRoomUrl: null,
};

export const SpectatorSplashWithNotablePlay: Story = {
  args: { ...myPickArgs, notablePlay },
};

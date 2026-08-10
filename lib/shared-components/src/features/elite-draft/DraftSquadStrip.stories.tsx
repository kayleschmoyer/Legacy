import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { DraftSquadStrip } from './DraftSquadStrip';
import type { DraftPickRecord, DraftPlayer } from './types';

const player = (id: number, name: string, position: string): DraftPlayer =>
  ({
    id,
    name,
    position,
    avg: 0.29,
    hr: 15,
    rbi: 60,
  }) as DraftPlayer;

const myTeam: DraftPlayer[] = [
  player(1, 'Infielder One', '1B'),
  player(2, 'Second Baseman', '2B'),
];

const myPicks: DraftPickRecord[] = [
  {
    id: '1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-01-01T00:00:00.000Z',
    teamId: 1,
    playerId: 1,
  },
  {
    id: '2',
    draftId: 1,
    round: 2,
    pickNumber: 1,
    overallPick: 5,
    pickedAt: '2026-01-01T00:00:00.000Z',
    teamId: 1,
    playerId: 2,
  },
];

const statsLookup = new Map<number, DraftPlayer>([
  [1, myTeam[0]],
  [2, myTeam[1]],
]);

const baseArgs = {
  myPicks,
  myTeam,
  statsLookup,
  rounds: 8,
  teamName: 'Cooperstown Society',
  isMyPick: false,
  open: false,
  onOpen: () => undefined,
  onClose: () => undefined,
};

const meta: Meta<typeof DraftSquadStrip> = {
  title: 'Features/EliteDraft/DraftSquadStrip',
  component: DraftSquadStrip,
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

export const Collapsed: Story = {
  args: baseArgs,
};

export const RosterSheetOpen: Story = {
  args: { ...baseArgs, open: true },
};

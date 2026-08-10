import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { DraftMiniBoard } from './DraftMiniBoard';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Cooperstown Society', leagueId: 7 },
  { id: '2', name: 'Brooklyn Bridegrooms', leagueId: 7 },
  { id: '3', name: 'Negro League Stars', leagueId: 7 },
  { id: '4', name: 'Iron Horse', leagueId: 7 },
];

const player = (id: number, name: string, position: string): DraftPlayer =>
  ({
    id,
    name,
    position,
    avg: 0.29,
    hr: 15,
    rbi: 60,
  }) as DraftPlayer;

const pick = (
  overrides: Partial<DraftPickRecord> & { round: number; teamId: number },
): DraftPickRecord => ({
  id: `${overrides.round}-${overrides.teamId}`,
  draftId: 1,
  pickNumber: 1,
  overallPick: 1,
  pickedAt: '2026-01-01T00:00:00.000Z',
  playerId: overrides.round * 10 + overrides.teamId,
  ...overrides,
});

const statsLookup = new Map<number, DraftPlayer>([
  [11, player(11, 'Infielder One', '1B')],
  [12, player(12, 'Second Baseman', '2B')],
  [21, player(21, 'Shortstop One', 'SS')],
]);

const meta: Meta<typeof DraftMiniBoard> = {
  title: 'Features/EliteDraft/DraftMiniBoard',
  component: DraftMiniBoard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <YStack width={360} backgroundColor="$background">
        <Story />
      </YStack>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    teams: TEAMS,
    picks: [
      pick({ round: 1, teamId: 1 }),
      pick({ round: 1, teamId: 2 }),
      pick({ round: 2, teamId: 1 }),
    ],
    currentPickInfo: {
      draftId: 1,
      teamId: 3,
      round: 2,
      pickNumber: 6,
      overallPick: 6,
      isComplete: false,
    },
    myTeamId: 1,
    statsLookup,
    rounds: 5,
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { DraftTopBand } from './DraftTopBand';
import type { LeagueTeam } from './types';

const LEAGUE_TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Cooperstown Society', leagueId: 7 },
  { id: '2', name: 'Brooklyn Bridegrooms', leagueId: 7 },
  { id: '3', name: 'Negro League Stars', leagueId: 7 },
  { id: '4', name: 'Iron Horse', leagueId: 7 },
];

const baseArgs = {
  draftPaused: false,
  currentPick: 5,
  round: 1,
  timeRemaining: 60,
  pickTimeLimitSeconds: 90,
  isMyPick: false,
  currentPickInfo: {
    draftId: 42,
    pickNumber: 5,
    teamId: 2,
    overallPick: 5,
    round: 1,
    isComplete: false,
  },
  leagueTeamsLength: 10,
  isCommissioner: false,
  isOwner: false,
  draftId: 42,
  commPickMode: false,
  autoPickDisabled: false,
  pauseLoading: false,
  resumeLoading: false,
  autoPickDisabledLoading: false,
  isMyTeamAutoPick: false,
  toggleAutoPickLoading: false,
  myTeamId: 1,
  teamNameById: () => 'Brooklyn Bridegrooms',
  leagueTeams: LEAGUE_TEAMS,
  autoPickTeamIds: new Set<string>(['3']),
  commissionerToggleUserAutoPickLoading: false,
  onPauseDraft: () => undefined,
  onResumeDraft: () => undefined,
  onToggleCommPickMode: () => undefined,
  onToggleAutoPickDisabled: () => undefined,
  onToggleUserAutoPick: () => undefined,
  onCommissionerToggleUserAutoPick: () => undefined,
};

const meta: Meta<typeof DraftTopBand> = {
  title: 'Features/EliteDraft/DraftTopBand',
  component: DraftTopBand,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <YStack backgroundColor="$background">
        <Story />
      </YStack>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTheClock: Story = {
  args: baseArgs,
};

export const MyPick: Story = {
  args: { ...baseArgs, isMyPick: true, timeRemaining: 12 },
};

export const Paused: Story = {
  args: { ...baseArgs, draftPaused: true },
};

export const Commissioner: Story = {
  args: { ...baseArgs, isCommissioner: true, isOwner: true },
};

export const CommissionerAutoPickDisabled: Story = {
  args: {
    ...baseArgs,
    isCommissioner: true,
    isOwner: true,
    autoPickDisabled: true,
  },
};

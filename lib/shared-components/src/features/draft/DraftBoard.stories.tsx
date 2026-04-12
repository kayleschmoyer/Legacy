import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DraftBoard } from './DraftBoard';
import type { DraftState, Player } from '../../types';

const makePlayer = (
  overrides: Partial<Player> & {
    id: string;
    firstName: string;
    lastName: string;
    position: Player['position'];
    team: string;
    adp: number;
    rank: number;
  },
): Player => ({
  hr: 0,
  avg: 0,
  rbi: 0,
  legacy: '',
  fantasyPoints: 0,
  projectedPoints: 0,
  gamesPlayed: 0,
  runs: 0,
  hits: 0,
  strikeouts: 0,
  walks: 0,
  obp: 0,
  ...overrides,
});

const samplePlayers: Player[] = [
  makePlayer({
    id: '1',
    firstName: 'Mike',
    lastName: 'Trout',
    position: 'CF',
    team: 'LAA',
    adp: 1,
    rank: 1,
    hr: 35,
    avg: 0.301,
    rbi: 90,
    fantasyPoints: 285,
  }),
  makePlayer({
    id: '2',
    firstName: 'Shohei',
    lastName: 'Ohtani',
    position: 'DH',
    team: 'LAD',
    adp: 2,
    rank: 2,
    hr: 54,
    avg: 0.304,
    rbi: 130,
    fantasyPoints: 420,
  }),
  makePlayer({
    id: '3',
    firstName: 'Mookie',
    lastName: 'Betts',
    position: 'RF',
    team: 'LAD',
    adp: 3,
    rank: 3,
    hr: 39,
    avg: 0.307,
    rbi: 107,
    fantasyPoints: 310,
  }),
  makePlayer({
    id: '4',
    firstName: 'Aaron',
    lastName: 'Judge',
    position: 'RF',
    team: 'NYY',
    adp: 4,
    rank: 4,
    hr: 58,
    avg: 0.311,
    rbi: 131,
    fantasyPoints: 400,
  }),
  makePlayer({
    id: '5',
    firstName: 'Gerrit',
    lastName: 'Cole',
    position: 'SP',
    team: 'NYY',
    adp: 5,
    rank: 5,
    fantasyPoints: 210,
  }),
  makePlayer({
    id: '6',
    firstName: 'Ronald',
    lastName: 'Acuna Jr',
    position: 'CF',
    team: 'ATL',
    adp: 6,
    rank: 6,
    hr: 41,
    avg: 0.337,
    rbi: 106,
    fantasyPoints: 380,
  }),
];

const sampleDraft: DraftState = {
  id: 'draft-1',
  name: '2025 Fantasy Baseball Draft',
  sport: 'baseball',
  status: 'active',
  currentPick: 1,
  timeRemaining: 120,
  teams: [
    { id: 't1', name: 'Team Alpha', owner: 'Brad', picks: [] },
    { id: 't2', name: 'Team Beta', owner: 'Alex', picks: [] },
    { id: 't3', name: 'Team Gamma', owner: 'Jordan', picks: [] },
  ],
  picks: [],
};

const meta: Meta<typeof DraftBoard> = {
  title: 'Features/Draft/DraftBoard',
  component: DraftBoard,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Interactive draft board with player cards, search, position filters, draft timer, and confirmation modal. The main screen for conducting a fantasy draft.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveDraft: Story = {
  args: {
    draft: sampleDraft,
    availablePlayers: samplePlayers,
    onPlayerDraft: fn(),
    onTimerControl: fn(),
  },
};

export const EmptyBoard: Story = {
  args: {
    draft: sampleDraft,
    availablePlayers: [],
    onPlayerDraft: fn(),
  },
};

export const WithDraftedPlayers: Story = {
  args: {
    draft: { ...sampleDraft, currentPick: 3 },
    availablePlayers: samplePlayers,
    onPlayerDraft: fn(),
    draftedPlayerIds: new Set(['1', '2']),
  },
};

export const PausedDraft: Story = {
  args: {
    draft: { ...sampleDraft, status: 'paused' as const },
    availablePlayers: samplePlayers,
    onPlayerDraft: fn(),
    onTimerControl: fn(),
  },
};

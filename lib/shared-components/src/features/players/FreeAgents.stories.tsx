import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { type FreeAgentPlayer, FreeAgents } from './FreeAgents';
import type { Player } from '../../types';

// --- Mock data ---

function makeFreeAgent(
  id: string,
  firstName: string,
  lastName: string,
  position: string,
  team: string,
  rank: number,
  overrides: Partial<FreeAgentPlayer> = {},
): FreeAgentPlayer {
  return {
    id,
    firstName,
    lastName,
    position,
    team,
    rank,
    adp: rank + 10,
    stats: {},
    player: `${firstName} ${lastName}`,
    pos: position,
    hr: 10,
    avg: 0.265,
    rbi: 40,
    legacy: '',
    fantasyPoints: 120,
    projectedPoints: 130,
    gamesPlayed: 80,
    runs: 35,
    hits: 75,
    strikeouts: 60,
    walks: 30,
    obp: 0.33,
    ownership: 15,
    trending: 'stable',
    injury: 'healthy',
    projections: { pts: rank * 0.8 },
    isWatched: false,
    faabValue: Math.max(1, 50 - rank),
    ...overrides,
  };
}

const mockPlayers: FreeAgentPlayer[] = [
  makeFreeAgent('fa1', 'Cody', 'Bellinger', 'OF', 'CHC', 1, {
    ownership: 45,
    trending: 'up',
    faabValue: 42,
  }),
  makeFreeAgent('fa2', 'Tommy', 'Edman', 'SS', 'LAD', 2, {
    ownership: 38,
    trending: 'up',
    faabValue: 35,
    isWatched: true,
  }),
  makeFreeAgent('fa3', 'Joey', 'Gallo', '1B', 'WSN', 3, {
    ownership: 8,
    trending: 'down',
    faabValue: 5,
    injury: 'questionable',
  }),
  makeFreeAgent('fa4', 'Andrew', 'Heaney', 'P', 'TEX', 4, {
    ownership: 22,
    trending: 'up',
    faabValue: 28,
  }),
  makeFreeAgent('fa5', 'Yoan', 'Moncada', '3B', 'CWS', 5, {
    ownership: 12,
    trending: 'down',
    faabValue: 8,
    injury: 'doubtful',
  }),
  makeFreeAgent('fa6', 'Nick', 'Lodolo', 'P', 'CIN', 6, {
    ownership: 30,
    trending: 'stable',
    faabValue: 25,
  }),
  makeFreeAgent('fa7', 'Dylan', 'Cease', 'P', 'SD', 7, {
    ownership: 55,
    trending: 'up',
    faabValue: 40,
    isWatched: true,
  }),
  makeFreeAgent('fa8', 'Brandon', 'Nimmo', 'OF', 'NYM', 8, {
    ownership: 28,
    trending: 'stable',
    faabValue: 18,
  }),
  makeFreeAgent('fa9', 'Tyler', 'Anderson', 'P', 'LAA', 9, {
    ownership: 10,
    trending: 'down',
    faabValue: 6,
    injury: 'out',
  }),
  makeFreeAgent('fa10', 'Willy', 'Adames', 'SS', 'SF', 10, {
    ownership: 60,
    trending: 'up',
    faabValue: 38,
  }),
];

const basePlayerStats = {
  hr: 5,
  avg: 0.22,
  rbi: 20,
  legacy: '',
  fantasyPoints: 60,
  projectedPoints: 70,
  gamesPlayed: 50,
  runs: 15,
  hits: 40,
  strikeouts: 45,
  walks: 15,
  obp: 0.29,
} as const;

const rosterPlayers: Player[] = [
  {
    id: 'r1',
    firstName: 'Bench',
    lastName: 'Warmer',
    position: 'C',
    team: 'NYY',
    adp: 200,
    rank: 180,
    player: 'Bench Warmer',
    pos: 'C',
    ...basePlayerStats,
  },
  {
    id: 'r2',
    firstName: 'Drop',
    lastName: 'Candidate',
    position: 'RP',
    team: 'BOS',
    adp: 250,
    rank: 220,
    player: 'Drop Candidate',
    pos: 'RP',
    ...basePlayerStats,
  },
];

// --- Meta ---

const meta: Meta<typeof FreeAgents> = {
  title: 'Features/Players/FreeAgents',
  component: FreeAgents,
  decorators: [
    (Story) => (
      <div style={{ height: 700, maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Full-featured free agent browser with search, position/trending filters, sort controls, player cards with ownership and injury data, and waiver claim modal.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    sport: {
      control: 'select',
      options: ['baseball', 'football', 'basketball', 'hockey'],
    },
    maxFaab: { control: { type: 'number', min: 0, max: 500, step: 10 } },
    onPlayerClaim: { action: 'player-claim' },
    onPlayerWatch: { action: 'player-watch' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Stories ---

export const Default: Story = {
  args: {
    sport: 'baseball',
    players: mockPlayers,
    onPlayerClaim: fn(),
    onPlayerWatch: fn(),
    maxFaab: 100,
    rosterPlayers,
  },
};

export const EmptyList: Story = {
  args: {
    sport: 'baseball',
    players: [],
    onPlayerClaim: fn(),
    onPlayerWatch: fn(),
    maxFaab: 100,
    rosterPlayers,
  },
  parameters: {
    docs: {
      description: {
        story: 'No free agents available -- shows empty list with controls.',
      },
    },
  },
};

export const InjuryHeavy: Story = {
  args: {
    sport: 'baseball',
    players: mockPlayers.map((p, i) => ({
      ...p,
      injury: (['healthy', 'questionable', 'doubtful', 'out'] as const)[i % 4],
    })),
    onPlayerClaim: fn(),
    onPlayerWatch: fn(),
    maxFaab: 100,
    rosterPlayers,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Mix of all injury statuses to verify color coding and badge display.',
      },
    },
  },
};

export const HighOwnership: Story = {
  args: {
    sport: 'baseball',
    players: mockPlayers.map((p, i) => ({
      ...p,
      ownership: 70 + (i % 30),
      trending: 'up' as const,
    })),
    onPlayerClaim: fn(),
    onPlayerWatch: fn(),
    maxFaab: 50,
    rosterPlayers,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Highly owned players trending up -- represents a competitive waiver wire.',
      },
    },
  },
};

export const LowBudget: Story = {
  args: {
    sport: 'baseball',
    players: mockPlayers,
    onPlayerClaim: fn(),
    onPlayerWatch: fn(),
    maxFaab: 5,
    rosterPlayers,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Very low FAAB budget remaining -- tests waiver claim modal constraints.',
      },
    },
  },
};

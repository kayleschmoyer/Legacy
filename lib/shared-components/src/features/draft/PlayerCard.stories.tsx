import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { Player, PlayerCard } from './PlayerCard';

const meta: Meta<typeof PlayerCard> = {
  title: 'Features/Draft/PlayerCard',
  component: PlayerCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A comprehensive player card component for draft boards, free agents, and roster management.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    player: {
      control: 'object',
      description: 'Player data object',
    },
    onSelect: {
      action: 'selected',
      description: 'Callback when player is selected',
    },
    onWatch: {
      action: 'watched',
      description: 'Callback when player is added to watch list',
    },
    onAction: {
      action: 'action',
      description: 'Callback for primary action button',
    },
    sport: {
      control: 'select',
      options: ['baseball', 'football', 'basketball', 'hockey'],
      description: 'Sport type for position coloring',
    },
    variant: {
      control: 'select',
      options: ['draft', 'freeagent', 'roster', 'compact'],
      description: 'Card variant/layout',
    },
    isSelected: {
      control: 'boolean',
      description: 'Whether the player is currently selected',
    },
    showStats: {
      control: 'boolean',
      description: 'Show player statistics',
    },
    showOwnership: {
      control: 'boolean',
      description: 'Show ownership percentage',
    },
    actionLabel: {
      control: 'text',
      description: 'Label for action button',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample player data
const baseballPlayer: Player = {
  id: '1',
  name: 'Mike Trout',
  position: 'OF',
  team: 'LAA',
  adp: 1.2,
  rank: 1,
  ownership: 98.5,
  trending: 'stable',
  injury: 'healthy',
  stats: {
    avg: '.283',
    hr: 40,
    rbi: 104,
    sb: 11,
  },
  isWatched: false,
};

const footballPlayer: Player = {
  id: '2',
  name: 'Josh Allen',
  position: 'QB',
  team: 'BUF',
  adp: 8.7,
  rank: 2,
  ownership: 89.2,
  trending: 'up',
  injury: 'healthy',
  stats: {
    passingYds: 4306,
    passingTds: 29,
    rushingYds: 523,
    rushingTds: 15,
  },
};

const injuredPlayer: Player = {
  id: '3',
  name: 'Ronald Acuña Jr.',
  position: 'OF',
  team: 'ATL',
  adp: 125.4,
  rank: 45,
  ownership: 12.8,
  trending: 'down',
  injury: 'out',
  stats: {
    avg: '.337',
    hr: 8,
    rbi: 15,
    sb: 3,
  },
  isWatched: true,
};

const rookiePlayer: Player = {
  id: '4',
  name: 'Corbin Carroll',
  position: 'OF',
  team: 'ARI',
  adp: 45.2,
  rank: 15,
  ownership: 76.3,
  trending: 'up',
  injury: 'healthy',
  stats: {
    avg: '.285',
    hr: 25,
    rbi: 76,
    sb: 54,
  },
  faabValue: 85,
};

export const Default: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
};

export const FootballPlayer: Story = {
  args: {
    player: footballPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'football',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
};

export const InjuredPlayer: Story = {
  args: {
    player: injuredPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
};

export const Selected: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    isSelected: true,
    showStats: true,
    showOwnership: true,
  },
};

export const Watched: Story = {
  args: {
    player: { ...baseballPlayer, isWatched: true },
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
};

export const FreeAgentVariant: Story = {
  args: {
    player: rookiePlayer,
    onSelect: fn(),
    onAction: fn(),
    sport: 'baseball',
    variant: 'freeagent',
    actionLabel: 'Add Player',
    showStats: true,
    showOwnership: false,
  },
};

export const RosterVariant: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    onAction: fn(),
    sport: 'baseball',
    variant: 'roster',
    actionLabel: 'Drop',
    showStats: true,
    showOwnership: false,
  },
};

export const CompactVariant: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    sport: 'baseball',
    variant: 'compact',
    showStats: false,
    showOwnership: false,
  },
};

export const NoStats: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: false,
    showOwnership: true,
  },
};

export const MinimalData: Story = {
  args: {
    player: {
      id: '5',
      name: 'Unknown Player',
      position: 'UTL',
      team: 'FA',
    },
    onSelect: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: false,
    showOwnership: false,
  },
};

export const LongName: Story = {
  args: {
    player: {
      ...baseballPlayer,
      name: 'Freddie Freeman Jr. III',
      team: 'LAD',
    },
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
};

// Interactive tests
export const WithInteraction: Story = {
  args: {
    player: baseballPlayer,
    onSelect: fn(),
    onWatch: fn(),
    sport: 'baseball',
    variant: 'draft',
    showStats: true,
    showOwnership: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test card click/selection
    const playerName = (args.player as Player)?.name || '';
    const card = canvas.getByText(playerName).closest('div');
    if (card) {
      await userEvent.click(card);
      await expect(args.onSelect).toHaveBeenCalled();
    }
  },
};

// Multiple sports comparison
export const SportsComparison: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <PlayerCard
        player={baseballPlayer}
        onSelect={fn()}
        sport="baseball"
        variant="draft"
        showStats={true}
        showOwnership={true}
      />
      <PlayerCard
        player={footballPlayer}
        onSelect={fn()}
        sport="football"
        variant="draft"
        showStats={true}
        showOwnership={true}
      />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

// Injury status showcase
export const InjuryStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <PlayerCard
        player={{ ...baseballPlayer, injury: 'healthy' }}
        onSelect={fn()}
        sport="baseball"
        variant="draft"
      />
      <PlayerCard
        player={{ ...baseballPlayer, injury: 'questionable' }}
        onSelect={fn()}
        sport="baseball"
        variant="draft"
      />
      <PlayerCard
        player={{ ...baseballPlayer, injury: 'doubtful' }}
        onSelect={fn()}
        sport="baseball"
        variant="draft"
      />
      <PlayerCard
        player={{ ...baseballPlayer, injury: 'out' }}
        onSelect={fn()}
        sport="baseball"
        variant="draft"
      />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

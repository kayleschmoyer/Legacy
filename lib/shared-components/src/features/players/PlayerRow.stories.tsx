import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { PlayerRow, PlayerRowData } from './PlayerRow';

const meta: Meta<typeof PlayerRow> = {
  title: 'Features/Players/PlayerRow',
  component: PlayerRow,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A table row component for displaying player statistics and draft information.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    player: {
      control: 'object',
      description: 'Player data object with statistics',
    },
    onDraft: {
      action: 'player-drafted',
      description: 'Callback when player is selected for drafting',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample player data
const baseballPlayer: PlayerRowData = {
  player: 'Mike Trout',
  pos: 'OF',
  team: 'LAA',
  hr: 40,
  avg: 0.283,
  rbi: 104,
  legacy: 'HOF Track',
  fantasyPoints: 387.5,
  projectedPoints: 420.0,
  gamesPlayed: 140,
  runs: 90,
  hits: 144,
  strikeouts: 130,
  walks: 95,
  obp: 0.378,
};

const pitcherPlayer: PlayerRowData = {
  player: 'Jacob deGrom',
  pos: 'P',
  team: 'TEX',
  hr: 0,
  avg: 0.0,
  rbi: 0,
  legacy: 'Cy Young',
  fantasyPoints: 285.2,
  projectedPoints: 310.0,
  gamesPlayed: 30,
  runs: 0,
  hits: 0,
  strikeouts: 220,
  walks: 35,
  obp: 0.0,
};

const rookiePlayer: PlayerRowData = {
  player: 'Corbin Carroll',
  pos: 'OF',
  team: 'ARI',
  hr: 25,
  avg: 0.285,
  rbi: 76,
  legacy: 'ROY',
  fantasyPoints: 312.8,
  projectedPoints: 350.0,
  gamesPlayed: 154,
  runs: 116,
  hits: 172,
  strikeouts: 142,
  walks: 72,
  obp: 0.362,
};

const veteranPlayer: PlayerRowData = {
  player: 'Albert Pujols',
  pos: '1B',
  team: 'STL',
  hr: 24,
  avg: 0.27,
  rbi: 68,
  legacy: 'HOF',
  fantasyPoints: 198.5,
  projectedPoints: 180.0,
  gamesPlayed: 109,
  runs: 34,
  hits: 99,
  strikeouts: 65,
  walks: 26,
  obp: 0.315,
};

const strugglingPlayer: PlayerRowData = {
  player: 'Chris Davis',
  pos: '1B',
  team: 'BAL',
  hr: 12,
  avg: 0.168,
  rbi: 36,
  legacy: 'Former Slugger',
  fantasyPoints: 84.2,
  projectedPoints: 95.0,
  gamesPlayed: 105,
  runs: 24,
  hits: 53,
  strikeouts: 195,
  walks: 28,
  obp: 0.243,
};

const utilityPlayer: PlayerRowData = {
  player: 'Enrique Hernandez',
  pos: 'UTL',
  team: 'LAD',
  hr: 8,
  avg: 0.24,
  rbi: 37,
  legacy: 'Versatile',
  fantasyPoints: 156.3,
  projectedPoints: 165.0,
  gamesPlayed: 122,
  runs: 48,
  hits: 89,
  strikeouts: 98,
  walks: 31,
  obp: 0.294,
};

export const Default: Story = {
  args: {
    player: baseballPlayer,
    onDraft: fn(),
  },
};

export const Pitcher: Story = {
  args: {
    player: pitcherPlayer,
    onDraft: fn(),
  },
};

export const Rookie: Story = {
  args: {
    player: rookiePlayer,
    onDraft: fn(),
  },
};

export const Veteran: Story = {
  args: {
    player: veteranPlayer,
    onDraft: fn(),
  },
};

export const Struggling: Story = {
  args: {
    player: strugglingPlayer,
    onDraft: fn(),
  },
};

export const UtilityPlayer: Story = {
  args: {
    player: utilityPlayer,
    onDraft: fn(),
  },
};

export const HighAverage: Story = {
  args: {
    player: {
      ...baseballPlayer,
      player: 'Tony Gwynn',
      avg: 0.394,
      hits: 220,
      obp: 0.454,
      legacy: 'Hit King',
    },
    onDraft: fn(),
  },
};

export const PowerHitter: Story = {
  args: {
    player: {
      ...baseballPlayer,
      player: 'Giancarlo Stanton',
      hr: 59,
      avg: 0.281,
      rbi: 132,
      legacy: 'HR Record',
      fantasyPoints: 445.2,
    },
    onDraft: fn(),
  },
};

export const SpeedPlayer: Story = {
  args: {
    player: {
      ...rookiePlayer,
      player: 'Billy Hamilton',
      hr: 2,
      avg: 0.236,
      rbi: 29,
      runs: 87,
      legacy: 'Speed Demon',
      fantasyPoints: 201.5,
    },
    onDraft: fn(),
  },
};

export const StringStats: Story = {
  args: {
    player: {
      player: 'Unknown Player',
      pos: 'IF',
      team: 'FA',
      hr: '--',
      avg: '--',
      rbi: '--',
      legacy: 'TBD',
      fantasyPoints: '--',
      projectedPoints: '--',
      gamesPlayed: 0,
      runs: '--',
      hits: '--',
      strikeouts: '--',
      walks: '--',
      obp: '--',
    },
    onDraft: fn(),
  },
};

export const LongName: Story = {
  args: {
    player: {
      ...baseballPlayer,
      player: 'Jarren Duran-Ramirez Jr.',
      team: 'BOS',
    },
    onDraft: fn(),
  },
};

export const ZeroStats: Story = {
  args: {
    player: {
      player: 'Injured Player',
      pos: 'DH',
      team: 'TBD',
      hr: 0,
      avg: 0.0,
      rbi: 0,
      legacy: 'Comeback Story',
      fantasyPoints: 0.0,
      projectedPoints: 25.0,
      gamesPlayed: 5,
      runs: 0,
      hits: 0,
      strikeouts: 15,
      walks: 1,
      obp: 0.063,
    },
    onDraft: fn(),
  },
};

// Interactive test
export const WithInteraction: Story = {
  args: {
    player: baseballPlayer,
    onDraft: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test row click
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const playerName = canvas.getByText(args.player.player);
    const row = playerName.closest('div');
    if (row) {
      await userEvent.click(row);
      await expect(args.onDraft).toHaveBeenCalledWith(args.player);
    }
  },
};

// Table layout simulation
export const PlayerRowTable: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#333',
        }}
      >
        Available Players
      </div>

      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#e9ecef',
          padding: '12px 8px',
          borderRadius: '4px 4px 0 0',
          fontWeight: 'bold',
          fontSize: '14px',
        }}
      >
        <div style={{ flex: '2 0 0', textAlign: 'left' }}>Player</div>
        <div style={{ flex: '1 0 0', textAlign: 'center' }}>Pos</div>
        <div style={{ flex: '1 0 0', textAlign: 'left' }}>Team</div>
        <div style={{ flex: '1 0 0', textAlign: 'center' }}>HR</div>
        <div style={{ flex: '1 0 0', textAlign: 'center' }}>AVG</div>
        <div style={{ flex: '1 0 0', textAlign: 'center' }}>RBI</div>
      </div>

      {/* Player Rows */}
      <PlayerRow player={baseballPlayer} onDraft={fn()} />
      <PlayerRow player={rookiePlayer} onDraft={fn()} />
      <PlayerRow player={pitcherPlayer} onDraft={fn()} />
      <PlayerRow player={veteranPlayer} onDraft={fn()} />
      <PlayerRow player={utilityPlayer} onDraft={fn()} />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

// Stats comparison
export const StatComparison: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <h3>Player Performance Comparison</h3>
      <PlayerRow player={baseballPlayer} onDraft={fn()} />
      <PlayerRow player={rookiePlayer} onDraft={fn()} />
      <PlayerRow player={strugglingPlayer} onDraft={fn()} />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

// Position types showcase
export const PositionTypes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <h3>Different Position Types</h3>
      <PlayerRow player={{ ...baseballPlayer, pos: 'OF' }} onDraft={fn()} />
      <PlayerRow
        player={{
          ...baseballPlayer,
          player: 'Salvador Perez',
          pos: 'C',
          team: 'KC',
        }}
        onDraft={fn()}
      />
      <PlayerRow
        player={{
          ...baseballPlayer,
          player: 'Vladimir Guerrero Jr.',
          pos: '1B',
          team: 'TOR',
        }}
        onDraft={fn()}
      />
      <PlayerRow
        player={{
          ...baseballPlayer,
          player: 'Jose Altuve',
          pos: '2B',
          team: 'HOU',
        }}
        onDraft={fn()}
      />
      <PlayerRow
        player={{
          ...baseballPlayer,
          player: 'Manny Machado',
          pos: '3B',
          team: 'SD',
        }}
        onDraft={fn()}
      />
      <PlayerRow
        player={{
          ...baseballPlayer,
          player: 'Francisco Lindor',
          pos: 'SS',
          team: 'NYM',
        }}
        onDraft={fn()}
      />
      <PlayerRow player={pitcherPlayer} onDraft={fn()} />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

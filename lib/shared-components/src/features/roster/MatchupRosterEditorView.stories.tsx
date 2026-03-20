import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import {
  type MatchupPlayerData,
  type MatchupPositionOption,
  MatchupRosterEditorView,
} from './MatchupRosterEditorView';

// --- Mock data ---

const positionOptions: MatchupPositionOption[] = [
  { id: 1, type: 'C' },
  { id: 2, type: '1B' },
  { id: 3, type: '2B' },
  { id: 4, type: 'SS' },
  { id: 5, type: '3B' },
  { id: 6, type: 'LF' },
  { id: 7, type: 'CF' },
  { id: 8, type: 'RF' },
  { id: 9, type: 'DH' },
  { id: 10, type: 'SP' },
  { id: 11, type: 'SP' },
  { id: 12, type: 'RP' },
  { id: 13, type: 'RP' },
];

const positionMap = new Map<number, string>(
  positionOptions.map((p) => [p.id, p.type]),
);

function makePlayer(
  id: string,
  firstName: string,
  lastName: string,
  positions: string[],
  positionId: number | null,
  teamId = 1,
  season: number | null = 2026,
): MatchupPlayerData {
  return {
    id,
    positionId,
    teamId,
    season,
    player: { firstName, lastName, eligiblePositions: positions },
  };
}

const fullRoster: MatchupPlayerData[] = [
  makePlayer('p1', 'Salvador', 'Perez', ['C'], 1),
  makePlayer('p2', 'Freddie', 'Freeman', ['1B'], 2),
  makePlayer('p3', 'Jose', 'Altuve', ['2B'], 3),
  makePlayer('p4', 'Corey', 'Seager', ['SS'], 4),
  makePlayer('p5', 'Manny', 'Machado', ['3B'], 5),
  makePlayer('p6', 'Juan', 'Soto', ['LF', 'RF'], 6),
  makePlayer('p7', 'Mike', 'Trout', ['CF'], 7),
  makePlayer('p8', 'Mookie', 'Betts', ['RF', 'SS', '2B'], 8),
  makePlayer('p9', 'Shohei', 'Ohtani', ['DH', 'SP'], 9),
  makePlayer('p10', 'Gerrit', 'Cole', ['SP'], 10),
  makePlayer('p11', 'Spencer', 'Strider', ['SP'], 11),
  makePlayer('p12', 'Josh', 'Hader', ['RP'], 12),
  makePlayer('p13', 'Edwin', 'Diaz', ['RP'], 13),
  // Bench
  makePlayer('p14', 'Julio', 'Rodriguez', ['CF', 'RF'], null),
  makePlayer('p15', 'Bobby', 'Witt Jr', ['SS', '3B'], null),
  makePlayer('p16', 'Corbin', 'Burnes', ['SP'], null),
];

const noopAsync = () => Promise.resolve();

// --- Meta ---

const meta: Meta<typeof MatchupRosterEditorView> = {
  title: 'Features/Roster/MatchupRosterEditorView',
  component: MatchupRosterEditorView,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 520, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Presentational matchup roster editor with tap-to-select player swapping, bench management, position assignment buttons, and locked/unlocked states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onSwapPositions: { action: 'swap-positions' },
    onMoveToPosition: { action: 'move-to-position' },
    locked: { control: 'boolean' },
    mutating: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Stories ---

export const Default: Story = {
  args: {
    players: fullRoster,
    positionMap,
    positionOptions,
    locked: false,
    mutating: false,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
};

export const Locked: Story = {
  args: {
    players: fullRoster,
    positionMap,
    positionOptions,
    locked: true,
    mutating: false,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Matchup in progress -- lineup is locked and no interactions are available.',
      },
    },
  },
};

export const Mutating: Story = {
  args: {
    players: fullRoster,
    positionMap,
    positionOptions,
    locked: false,
    mutating: true,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
  parameters: {
    docs: {
      description: {
        story:
          'A swap/move mutation is in flight -- shows the loading indicator.',
      },
    },
  },
};

const partialRoster: MatchupPlayerData[] = [
  makePlayer('p1', 'Salvador', 'Perez', ['C'], 1),
  makePlayer('p3', 'Jose', 'Altuve', ['2B'], 3),
  makePlayer('p7', 'Mike', 'Trout', ['CF'], 7),
  makePlayer('p10', 'Gerrit', 'Cole', ['SP'], 10),
  // Bench
  makePlayer('p14', 'Julio', 'Rodriguez', ['CF', 'RF'], null),
  makePlayer('p15', 'Bobby', 'Witt Jr', ['SS', '3B'], null),
  makePlayer('p16', 'Corbin', 'Burnes', ['SP'], null),
];

export const PartiallyFilled: Story = {
  args: {
    players: partialRoster,
    positionMap,
    positionOptions,
    locked: false,
    mutating: false,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Several empty starter slots with bench players available for assignment.',
      },
    },
  },
};

export const EmptyBench: Story = {
  args: {
    players: fullRoster.filter((p) => p.positionId !== null),
    positionMap,
    positionOptions,
    locked: false,
    mutating: false,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
  parameters: {
    docs: {
      description: {
        story: 'All players are in starter slots with no bench players.',
      },
    },
  },
};

export const SelectPlayer: Story = {
  args: {
    players: fullRoster,
    positionMap,
    positionOptions,
    locked: false,
    mutating: false,
    onSwapPositions: fn().mockImplementation(noopAsync),
    onMoveToPosition: fn().mockImplementation(noopAsync),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const player = canvas.getByText('Mike Trout');
    await expect(player).toBeInTheDocument();
    await userEvent.click(player);

    // After selecting a player, "Tap to swap" prompts should appear on other rows
    const swapPrompts = await canvas.findAllByText(/Tap to swap/i);
    await expect(swapPrompts.length).toBeGreaterThan(0);

    // First tap only selects — no swap or move callbacks should have fired
    await expect(args.onSwapPositions).not.toHaveBeenCalled();
    await expect(args.onMoveToPosition).not.toHaveBeenCalled();
  },
  tags: ['test'],
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates selecting a starter -- the card highlights and swap targets show "Tap to swap".',
      },
    },
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { LineupEditor } from './LineupEditor';
import type {
  LeaguePosition,
  TeamMemberWithPositions,
} from '../../utils/PositionModels';

// --- Mock data ---

const rosterSlots: LeaguePosition[] = [
  { id: 1, positionType: 'C', order: 1 },
  { id: 2, positionType: '1B', order: 2 },
  { id: 3, positionType: '2B', order: 3 },
  { id: 4, positionType: 'SS', order: 4 },
  { id: 5, positionType: '3B', order: 5 },
  { id: 6, positionType: 'LF', order: 6 },
  { id: 7, positionType: 'CF', order: 7 },
  { id: 8, positionType: 'RF', order: 8 },
  { id: 9, positionType: 'DH', order: 9 },
  { id: 10, positionType: 'SP', order: 10 },
  { id: 11, positionType: 'SP', order: 11 },
  { id: 12, positionType: 'RP', order: 12 },
  { id: 13, positionType: 'RP', order: 13 },
];

function makePlayer(
  id: number,
  firstName: string,
  lastName: string,
  positions: Array<
    'SP' | 'RP' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'RF' | 'LF' | 'CF' | 'DH'
  >,
  positionId: number | null,
): TeamMemberWithPositions {
  return {
    id,
    playerId: id,
    positionId,
    isActive: true,
    player: {
      id,
      firstName,
      lastName,
      eligiblePositions: positions,
      playerEligiblePositions: {
        nodes: positions.map((p) => ({ position: p })),
      },
    },
  };
}

const fullTeam: TeamMemberWithPositions[] = [
  makePlayer(101, 'Salvador', 'Perez', ['C'], 1),
  makePlayer(102, 'Freddie', 'Freeman', ['1B'], 2),
  makePlayer(103, 'Jose', 'Altuve', ['2B'], 3),
  makePlayer(104, 'Corey', 'Seager', ['SS'], 4),
  makePlayer(105, 'Manny', 'Machado', ['3B'], 5),
  makePlayer(106, 'Juan', 'Soto', ['LF', 'RF'], 6),
  makePlayer(107, 'Mike', 'Trout', ['CF'], 7),
  makePlayer(108, 'Mookie', 'Betts', ['RF', 'SS', '2B'], 8),
  makePlayer(109, 'Shohei', 'Ohtani', ['DH', 'SP'], 9),
  makePlayer(110, 'Gerrit', 'Cole', ['SP'], 10),
  makePlayer(111, 'Spencer', 'Strider', ['SP'], 11),
  makePlayer(112, 'Josh', 'Hader', ['RP'], 12),
  makePlayer(113, 'Edwin', 'Diaz', ['RP'], 13),
  // Bench players (positionId = null)
  makePlayer(114, 'Julio', 'Rodriguez', ['CF', 'RF'], null),
  makePlayer(115, 'Bobby', 'Witt Jr', ['SS', '3B'], null),
  makePlayer(116, 'Corbin', 'Burnes', ['SP'], null),
];

const projections: Record<number, number> = {
  101: 8.5,
  102: 12.3,
  103: 10.1,
  104: 11.7,
  105: 9.8,
  106: 14.2,
  107: 13.5,
  108: 11.9,
  109: 18.4,
  110: 15.2,
  111: 14.8,
  112: 6.5,
  113: 5.8,
  114: 12.1,
  115: 10.9,
  116: 13.7,
};

const actuals: Record<number, number> = {
  101: 7.2,
  102: 14.1,
  103: 10.1,
  104: 9.3,
  105: 11.5,
  106: 16.8,
  107: 12.0,
  108: 13.2,
  109: 22.1,
  110: 18.0,
  111: 11.2,
  112: 8.1,
  113: 4.2,
};

// --- Meta ---

const meta: Meta<typeof LineupEditor> = {
  title: 'Features/Roster/LineupEditor',
  component: LineupEditor,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 600, height: 700, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Interactive lineup editor with tap-to-select player swapping, position compatibility validation, and projected vs actual stat display.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onPlayerAdded: { action: 'player-added' },
    onPlayerMoved: { action: 'player-moved' },
    onPlayerRemoved: { action: 'player-removed' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Stories ---

export const Default: Story = {
  args: {
    availableRosterSlots: rosterSlots,
    team: fullTeam,
    projections,
    actual: actuals,
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
};

export const ProjectionsOnly: Story = {
  args: {
    availableRosterSlots: rosterSlots,
    team: fullTeam,
    projections,
    actual: {},
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Before games start -- only projected values are shown, no actual stats yet.',
      },
    },
  },
};

export const EmptyRoster: Story = {
  args: {
    availableRosterSlots: rosterSlots,
    team: [],
    projections: {},
    actual: {},
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'All roster slots are empty with no players assigned.',
      },
    },
  },
};

const partialTeam: TeamMemberWithPositions[] = [
  makePlayer(101, 'Salvador', 'Perez', ['C'], 1),
  makePlayer(103, 'Jose', 'Altuve', ['2B'], 3),
  makePlayer(107, 'Mike', 'Trout', ['CF'], 7),
  makePlayer(110, 'Gerrit', 'Cole', ['SP'], 10),
  // Bench players
  makePlayer(114, 'Julio', 'Rodriguez', ['CF', 'RF'], null),
  makePlayer(115, 'Bobby', 'Witt Jr', ['SS', '3B'], null),
];

export const PartiallyFilled: Story = {
  args: {
    availableRosterSlots: rosterSlots,
    team: partialTeam,
    projections,
    actual: {},
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Roster with some empty slots and bench players available -- typical mid-draft or waiver state.',
      },
    },
  },
};

export const BenchHeavy: Story = {
  args: {
    availableRosterSlots: rosterSlots.slice(0, 5),
    team: [
      makePlayer(101, 'Salvador', 'Perez', ['C'], 1),
      makePlayer(102, 'Freddie', 'Freeman', ['1B'], 2),
      // Many bench players
      makePlayer(103, 'Jose', 'Altuve', ['2B'], null),
      makePlayer(104, 'Corey', 'Seager', ['SS'], null),
      makePlayer(105, 'Manny', 'Machado', ['3B'], null),
      makePlayer(106, 'Juan', 'Soto', ['LF', 'RF'], null),
      makePlayer(107, 'Mike', 'Trout', ['CF'], null),
      makePlayer(108, 'Mookie', 'Betts', ['RF', 'SS', '2B'], null),
    ],
    projections,
    actual: {},
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Few roster slots with many bench players -- tests scrolling and bench section display.',
      },
    },
  },
};

export const SelectPlayer: Story = {
  args: {
    availableRosterSlots: rosterSlots,
    team: fullTeam,
    projections,
    actual: actuals,
    onPlayerAdded: fn(),
    onPlayerMoved: fn(),
    onPlayerRemoved: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Click on a player card to select them
    const playerName = canvas.getByText('Mike Trout');
    await expect(playerName).toBeInTheDocument();
    await userEvent.click(playerName);
    await expect(playerName).toHaveFocus();
  },
  tags: ['test'],
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates selecting a player by clicking their card. The selected card gets highlighted.',
      },
    },
  },
};

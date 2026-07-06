import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { View } from 'react-native';
import { PlayerChip, type SelectedPlayer, SlotBadge } from './PlayerComparison';

/**
 * Visual coverage for the per-slot accent colors of the Player Comparison chips
 * (LS-5577 / LS-8352). Slot color is driven by the chip's slot **index**, not
 * the player identity:
 *
 *   slot 0 → gold  (#C5A55A / rgba(197,165,90,0.5) border)
 *   slot 1 → blue  (#60A5FA / rgba(96,165,250,0.5) border)
 *   slot 2 → green (#34D399 / rgba(52,211,153,0.5) border)
 *   slot 3 → red   (#F87171 / rgba(248,113,113,0.5) border)
 *
 * These stories replace the E2E `toHaveCSS` chip-color assertions that used to
 * live in apps/web-e2e/src/tests/player-comparison-color-chips.spec.ts. Per the
 * testing skill's visual-assertion rule, rendered colors are a Chromatic/
 * Storybook concern; the E2E suite keeps only the platform-neutral slot
 * *identity* checks (the `aria-label="Slot N"` badge).
 */

// `summary` (the full player stats fragment) is unused by PlayerChip — it only
// reads id / name / position — so an empty Player object satisfies the type.
const EMPTY_SUMMARY = {} as SelectedPlayer['summary'];

const SLOT_PLAYERS: readonly SelectedPlayer[] = [
  { id: 1, name: 'Aaron Judge', position: 'OF', summary: EMPTY_SUMMARY },
  { id: 2, name: 'Shohei Ohtani', position: 'DH', summary: EMPTY_SUMMARY },
  { id: 3, name: 'Mookie Betts', position: 'OF', summary: EMPTY_SUMMARY },
  { id: 4, name: 'Miguel Cabrera', position: '1B', summary: EMPTY_SUMMARY },
];

const meta: Meta<typeof PlayerChip> = {
  title: 'Features/Players/PlayerComparison',
  component: PlayerChip,
  decorators: [
    (Story) => (
      <View style={{ padding: 20, gap: 12, alignItems: 'flex-start' }}>
        <Story />
      </View>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * All four selected-player chips, one per slot — the primary Chromatic capture
 * for the slot border colors (PLAYER_ACCENT_ALPHAS) and accent-dot colors
 * (PLAYER_ACCENTS).
 */
export const AllSlots: Story = {
  render: () => (
    <>
      {SLOT_PLAYERS.map((player, index) => (
        <PlayerChip
          key={player.id}
          player={player}
          index={index}
          onRemove={action(`remove-slot-${index}`)}
        />
      ))}
    </>
  ),
};

/** A single gold (slot 0) chip. */
export const Slot0Gold: Story = {
  args: {
    player: SLOT_PLAYERS[0],
    index: 0,
    onRemove: action('remove'),
  },
};

/** A single blue (slot 1) chip. */
export const Slot1Blue: Story = {
  args: {
    player: SLOT_PLAYERS[1],
    index: 1,
    onRemove: action('remove'),
  },
};

/** A single green (slot 2) chip. */
export const Slot2Green: Story = {
  args: {
    player: SLOT_PLAYERS[2],
    index: 2,
    onRemove: action('remove'),
  },
};

/** A single red (slot 3) chip. */
export const Slot3Red: Story = {
  args: {
    player: SLOT_PLAYERS[3],
    index: 3,
    onRemove: action('remove'),
  },
};

/**
 * The numbered slot badges in isolation — the primary (color-blind-safe) slot
 * differentiator carried by each chip's `aria-label="Slot N"`.
 */
export const SlotBadges: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[0, 1, 2, 3].map((index) => (
        <SlotBadge key={index} index={index} />
      ))}
    </View>
  ),
};

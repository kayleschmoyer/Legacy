/**
 * DraftSquadStrip — the phone draft room's persistent squad strip (LS-10001),
 * design `styles/mobile.css` `.mob-squad` / `.mob-slots` / `.mob-slot` as
 * rendered in `DraftRoomMobile.html`.
 *
 * This *replaces* the roster tab rather than adding to it — the design's own
 * markup comment is "Roster left the tab set — it lives in the squad strip
 * below." So the answer to "what do I still need" is always on screen, and
 * the full roster is one tap away instead of one tab away.
 *
 * Two deliberate reuses, both required by the ticket:
 *
 *  - The chips are {@link DraftSlotChip} at `size="sm"`, the *same* component
 *    the desktop slot strip ({@link DraftSlotStrip}) renders at `md`. The
 *    design says as much — `.mob-squad .sb-slot` restyles the desktop
 *    `.sb-slot` vocabulary rather than defining a phone chip. Do not fork it.
 *  - Occupancy comes from `buildRosterSlotInstances`, the same derivation the
 *    Team tab, the depth chart and the desktop strip use, so no two views of
 *    the roster can ever disagree. This component never counts slots itself.
 *
 * Sizing is by design token, not Tamagui `$token` style props: the strip only
 * ever mounts on the phone tier, which `CompactLiveDraftBoard` selects via
 * `useDraftViewportTier()`, so there is no width-conditional styling here at
 * all.
 */
import React, { useMemo } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { DraftSlotChip, type DraftSlotChipState } from './DraftSlotChip';
import {
  buildRosterSlotInstances,
  nextPrioritySlotKey,
  openStarterSlotLabels,
  rosterSlotFillCounts,
} from './rosterSlots';
import type { DraftPlayer } from './types';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import { BG_DARK, BRAND_GOLD, withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

/** Touch-target floor for the strip's controls (LS-10001 AC: 44px throughout). */
const MIN_TOUCH = 44;

/** The summary shown once every starter slot is filled. */
export const ROSTER_SET_LABEL = 'Roster set';

/**
 * "Open slots: 1B, SS" — or `ROSTER_SET_LABEL` when nothing is left. Exported
 * for the spec, which asserts the dedup/bench rules through this boundary.
 */
export function openSlotsSummary(labels: readonly string[]): string {
  return labels.length === 0
    ? ROSTER_SET_LABEL
    : `Open slots: ${labels.join(', ')}`;
}

export interface DraftSquadStripProps {
  /** League-configured starter slots, in lineup order. */
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  /** The viewing user's drafted players. */
  players: DraftPlayer[];
  sport: SportKind;
  maxRosterSize: number | null;
  /** Raises the full squad sheet. */
  onOpen: () => void;
  /**
   * Bottom safe-area inset (LS-9444). The strip is the phone draft room's
   * bottom-most band now that the draft-owned bottom nav is gone (LS-10165),
   * so it reserves Android's edge-to-edge navigation bar itself.
   */
  bottomInset?: number;
}

/** The design's `.mob-squad { padding-bottom: 12px }`, before any inset. */
const STRIP_PADDING_BOTTOM = 12;

export function DraftSquadStrip({
  leaguePositions,
  players,
  sport,
  maxRosterSize,
  onOpen,
  bottomInset = 0,
}: DraftSquadStripProps): React.JSX.Element {
  const slots = useMemo(
    () =>
      buildRosterSlotInstances(leaguePositions, players, sport, maxRosterSize),
    [leaguePositions, players, sport, maxRosterSize],
  );
  const priorityKey = useMemo(() => nextPrioritySlotKey(slots), [slots]);
  const { filled, total } = useMemo(() => rosterSlotFillCounts(slots), [slots]);
  const summary = useMemo(
    () => openSlotsSummary(openStarterSlotLabels(slots)),
    [slots],
  );

  return (
    <YStack
      testID="draft-squad-strip"
      borderTopWidth={1}
      borderTopColor={withAlpha(BRAND_GOLD, 0.3)}
      backgroundColor={withAlpha(BG_DARK, 0.94)}
      paddingTop={9}
      paddingBottom={STRIP_PADDING_BOTTOM + Math.max(bottomInset, 0)}
      paddingHorizontal={12}
      gap={8}
    >
      <XStack alignItems="center" justifyContent="space-between" gap={8}>
        <Text
          testID="draft-squad-strip-count"
          fontFamily="$heading"
          fontSize={11}
          fontWeight="800"
          letterSpacing={1.76}
          textTransform="uppercase"
          numberOfLines={1}
          color="$brandGold"
        >
          Positions drafted · {filled}/{total}
        </Text>

        {/* The labelled expand affordance. The track below opens the sheet
            too (the design marks both `.hd .open` and `.sb-track` with
            `data-sheet-open`), but only this one carries the accessible name
            — a screen reader should hear one control here, not two. */}
        <XStack
          testID="draft-squad-strip-open"
          minHeight={MIN_TOUCH}
          alignItems="center"
          justifyContent="flex-end"
          flexShrink={1}
          minWidth={0}
          onPress={onOpen}
          pressStyle={{ opacity: 0.7 }}
          cursor="pointer"
          role="button"
          accessibilityRole="button"
          tabIndex={0}
          onKeyDown={handleKeyActivate(onOpen)}
          aria-haspopup="dialog"
          aria-label={`${summary}. Open full squad`}
          accessibilityLabel={`${summary}. Open full squad`}
        >
          <Text fontSize={11} color="$fg3" numberOfLines={1}>
            {summary} ▴
          </Text>
        </XStack>
      </XStack>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The track must not stretch to the tallest flex line or the 44px
        // chips lose their floor; it sizes to the chips instead.
        flexGrow={0}
        flexShrink={0}
      >
        {/* Tapping the chips opens the sheet as well (design: `.sb-track` is a
            `data-sheet-open` trigger). A tap that turns into a horizontal drag
            is consumed by the scroller and never becomes a press, so the two
            gestures coexist.

            Deliberately carries no `role`/`accessibilityLabel`: the header
            control above is the announced route to this action, and giving the
            track one too would either double the control count or — if the
            track were hidden instead — silence the chips' own per-slot labels,
            which are how a screen-reader user reads the roster at all. */}
        <XStack
          testID="draft-squad-strip-track"
          gap={5}
          paddingVertical={1}
          onPress={onOpen}
          cursor="pointer"
        >
          {slots.map((slot) => {
            const state: DraftSlotChipState =
              slot.player != null
                ? 'filled'
                : slot.key === priorityKey
                  ? 'need'
                  : 'open';
            return (
              <DraftSlotChip
                key={slot.key}
                positionType={slot.positionType}
                sport={sport}
                state={state}
                playerName={slot.player?.name ?? null}
                isBench={slot.isBench}
                size="sm"
              />
            );
          })}
        </XStack>
      </ScrollView>
    </YStack>
  );
}

export default DraftSquadStrip;

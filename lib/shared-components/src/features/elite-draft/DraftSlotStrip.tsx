/**
 * DraftSlotStrip — the bottom-pinned "Positions drafted" strip on the desktop
 * draft room (LS-10004), design `styles/board.css` `.slotbar` / `.sb-head` /
 * `.sb-track` rendered in `DraftRoom.html`.
 *
 * One chip per roster slot in lineup order. Occupancy comes from
 * {@link buildRosterSlotInstances}, the *same* derivation the depth chart view
 * and the Team tab use — the design's "mirrors the depth chart counts exactly
 * so the two views can never disagree" is an implementation constraint, so
 * this component must never count slots itself. `rosterSlots.spec.ts` asserts
 * the two agree.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { DRAFT_SLOT_STRIP_HEIGHT_PX } from './constants';
import { DraftSlotChip, type DraftSlotChipState } from './DraftSlotChip';
import {
  buildRosterSlotInstances,
  nextPrioritySlotKey,
  rosterSlotFillCounts,
} from './rosterSlots';
import type { DraftPlayer } from './types';
import { BG_DARK, OUTLINE_DEFAULT, withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

export { DRAFT_SLOT_STRIP_HEIGHT_PX };

/** Minimal structural view of a DOM element that can be scrolled horizontally. */
interface HorizontallyScrollable {
  scrollLeft: number;
}

function isScrollable(target: unknown): target is HorizontallyScrollable {
  return (
    target !== null &&
    typeof target === 'object' &&
    'scrollLeft' in target &&
    typeof (target as HorizontallyScrollable).scrollLeft === 'number'
  );
}

export interface DraftSlotStripProps {
  /** League-configured starter slots, in lineup order. */
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  /** The viewing user's drafted players. */
  players: DraftPlayer[];
  sport: SportKind;
  maxRosterSize: number | null;
}

export function DraftSlotStrip({
  leaguePositions,
  players,
  sport,
  maxRosterSize,
}: DraftSlotStripProps): React.JSX.Element {
  const slots = useMemo(
    () =>
      buildRosterSlotInstances(leaguePositions, players, sport, maxRosterSize),
    [leaguePositions, players, sport, maxRosterSize],
  );
  const priorityKey = useMemo(() => nextPrioritySlotKey(slots), [slots]);
  const { filled, total } = useMemo(() => rosterSlotFillCounts(slots), [slots]);

  // Mouse click-and-drag scrolling for the track (design: `.sb-track` has
  // `cursor: grab` and a `.dragging` state). Touch drag and the wheel are
  // already handled by the scroll container on both platforms; this only adds
  // the pointer gesture, and no-ops where the target has no `scrollLeft`.
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  const handlePointerDown = useCallback((event: { nativeEvent: unknown }) => {
    const { clientX, target } = (event.nativeEvent ?? {}) as {
      clientX?: number;
      target?: unknown;
    };
    if (clientX == null || !isScrollable(target)) return;
    drag.current = { startX: clientX, startScroll: target.scrollLeft };
  }, []);

  const handlePointerMove = useCallback((event: { nativeEvent: unknown }) => {
    const active = drag.current;
    if (active == null) return;
    const { clientX, target } = (event.nativeEvent ?? {}) as {
      clientX?: number;
      target?: unknown;
    };
    if (clientX == null || !isScrollable(target)) return;
    target.scrollLeft = active.startScroll - (clientX - active.startX);
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <XStack
      testID="draft-slot-strip"
      accessibilityLabel="Positions drafted"
      aria-label="Positions drafted"
      height={DRAFT_SLOT_STRIP_HEIGHT_PX}
      alignItems="center"
      gap={18}
      paddingVertical={10}
      paddingHorizontal={20}
      borderTopWidth={1}
      borderTopColor={OUTLINE_DEFAULT}
      backgroundColor={withAlpha(BG_DARK, 0.94)}
    >
      <YStack flexShrink={0} gap={3}>
        <Text
          fontFamily="$heading"
          fontSize={10}
          fontWeight="800"
          letterSpacing={1.8}
          color="$fg3"
        >
          POSITIONS DRAFTED
        </Text>
        <Text
          testID="draft-slot-strip-count"
          fontFamily="$heading"
          fontSize={12}
          fontWeight="700"
          letterSpacing={0.7}
          color="$fg4"
        >
          {filled} / {total} slots
        </Text>
      </YStack>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        flex={1}
        minWidth={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <XStack gap={6} paddingVertical={1}>
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
              />
            );
          })}
        </XStack>
      </ScrollView>
    </XStack>
  );
}

export default DraftSlotStrip;

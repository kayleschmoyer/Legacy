/**
 * DraftSlotChip — one roster-slot chip (LS-10004), design `styles/board.css`
 * `.sb-slot` with its `.open` / `.need` / `.filled` / `.bench` states.
 *
 * Shared on purpose: the desktop slot strip ({@link DraftSlotStrip}) and the
 * phone squad strip (LS-10001) render the *same* chip, differing only by the
 * `size` prop. Do not fork it per surface.
 *
 * Accent vocabulary: the mock groups positions into a handful of `--sb`
 * custom-property hues (all infielders share one). This uses the repo's
 * canonical {@link getPositionColor} table instead, per LS-10004's acceptance
 * criteria — same intent, one hue per slot name, and already covering both
 * sports (P/SP/RP/C/1B/2B/3B/SS/OF/DH and QB/RB/WR/TE/K/DEF/DST/FLEX). The
 * two slot names with no badge entry resolve through `getPositionColor`'s
 * `positions.utility` fallback (UTIL → gold, matching the mock) except BENCH,
 * which the design de-accents to muted text — handled by `isBench` below.
 *
 * Color plumbing: every state is an alpha tint of its accent, and those have
 * to be composed from resolved hex, so accent/gold/bench tones come from the
 * canonical `utils/colors` constants rather than a theme hook — the same
 * choice `DraftRosterSlotRow` makes. Plain text colors stay `$` tokens so they
 * still flip with the theme.
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { initialsOf } from './nativeDraftBoard';
import {
  BRAND_GOLD,
  getPositionColor,
  lightenForContrast,
  SURFACE_CARD,
  TEXT_MUTED,
  withAlpha,
} from '../../utils/colors';
import type { Sport } from '../../utils/colors';

/** Depth-chart bucket key for the synthetic overflow bucket, displayed as "BN". */
const BENCH_POSITION_TYPE = 'BENCH';

export type DraftSlotChipState = 'filled' | 'need' | 'open';

/**
 * Per-size metrics — `md` is the desktop strip, `sm` the phone squad strip.
 *
 * `minHeight` is the touch-target floor. The desktop strip is pointer-driven
 * and lets the chip size to its content (`board.css` `.sb-slot` sets no
 * height), so `md` is unconstrained; the phone strip is a touch surface and
 * the design pins it at 44px — `mobile.css` `.mob-squad .sb-slot { flex: 0 0
 * 40px; min-height: 44px }`, which is also LS-10001's 44px hit-target AC.
 */
export const DRAFT_SLOT_CHIP_SIZES = {
  md: {
    width: 46,
    minWidth: 34,
    minHeight: 0,
    mark: 22,
    pos: 10,
    monogram: 9,
    need: 12,
  },
  sm: {
    width: 40,
    minWidth: 30,
    minHeight: 44,
    mark: 19,
    pos: 9,
    monogram: 8,
    need: 11,
  },
} as const;

const SIZES = DRAFT_SLOT_CHIP_SIZES;

export type DraftSlotChipSize = keyof typeof SIZES;

/**
 * Accent hue for a slot chip. Bench slots are deliberately de-accented — the
 * design renders them as a dashed, muted outline rather than a position color.
 */
export function slotAccentColor(
  sport: Sport,
  positionType: string,
  mutedColor: string = TEXT_MUTED,
): string {
  if (positionType === BENCH_POSITION_TYPE || positionType === 'BN') {
    return mutedColor;
  }
  return getPositionColor(sport, positionType);
}

/** "BENCH" is the internal bucket key; the chip label is the abbreviation "BN". */
export function slotChipLabel(positionType: string): string {
  return positionType === BENCH_POSITION_TYPE ? 'BN' : positionType;
}

export interface DraftSlotChipProps {
  /** League-configured slot type, e.g. `'QB'`, `'OF'`, `'FLEX'`, `'BENCH'`. */
  positionType: string;
  sport: Sport;
  /**
   * `filled` shows the player's monogram, `need` the gold "+" priority marker,
   * `open` an empty dashed marker.
   */
  state: DraftSlotChipState;
  /** Occupying player's name — required for `filled`, ignored otherwise. */
  playerName?: string | null;
  /** Renders the muted, dashed bench treatment. */
  isBench?: boolean;
  size?: DraftSlotChipSize;
}

export function DraftSlotChip({
  positionType,
  sport,
  state,
  playerName,
  isBench = false,
  size = 'md',
}: DraftSlotChipProps): React.JSX.Element {
  const metrics = SIZES[size];
  const accent = slotAccentColor(
    sport,
    isBench ? BENCH_POSITION_TYPE : positionType,
  );
  const label = slotChipLabel(positionType);
  const isNeed = state === 'need';
  const isFilled = state === 'filled';

  const monogram = isFilled ? initialsOf(playerName ?? '') : isNeed ? '+' : '';
  const accessibilityLabel = isFilled
    ? `${label} — ${playerName ?? 'filled'}`
    : isNeed
      ? `${label} — open, priority`
      : `${label} — open`;

  return (
    <YStack
      testID="draft-slot-chip"
      // Not a control: the strip is a read-only map of roster occupancy.
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      data-pos={label}
      data-state={state}
      width={metrics.width}
      minWidth={metrics.minWidth}
      minHeight={metrics.minHeight}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      gap={4}
      paddingTop={5}
      paddingBottom={6}
      paddingHorizontal={3}
      borderRadius={9999}
      borderWidth={1}
      borderStyle={isBench ? 'dashed' : 'solid'}
      borderColor={
        isNeed ? BRAND_GOLD : withAlpha(accent, isFilled ? 0.58 : 0.26)
      }
      backgroundColor={
        isNeed
          ? withAlpha(BRAND_GOLD, 0.12)
          : isBench
            ? 'transparent'
            : withAlpha(accent, isFilled ? 0.16 : 0.07)
      }
    >
      <Text
        fontFamily="$heading"
        fontSize={metrics.pos}
        fontWeight="800"
        letterSpacing={0.6}
        numberOfLines={1}
        color={isNeed ? '$brandGold' : lightenForContrast(accent, SURFACE_CARD)}
      >
        {label}
      </Text>
      <XStack
        testID="draft-slot-chip-mark"
        width={metrics.mark}
        height={metrics.mark}
        borderRadius={9999}
        alignItems="center"
        justifyContent="center"
        borderWidth={isFilled ? 0 : 1}
        borderColor={isNeed ? BRAND_GOLD : withAlpha(accent, 0.32)}
        // The mock washes the open marker with `rgba(255,255,255,0.02)`; a
        // literal would trip the theme-compliance ratchet and read wrong in
        // light mode, so the wash is the chip's own accent at the same weight.
        backgroundColor={withAlpha(accent, isFilled ? 0.42 : 0.03)}
      >
        <Text
          fontFamily="$heading"
          fontSize={isNeed ? metrics.need : metrics.monogram}
          fontWeight="700"
          color={isNeed ? '$brandGold' : '$color'}
        >
          {monogram}
        </Text>
      </XStack>
    </YStack>
  );
}

export default DraftSlotChip;

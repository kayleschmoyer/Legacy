import React from 'react';
import { Text, XStack } from 'tamagui';
import { GREEN, withAlpha } from '../utils/colors';
import { FONT_MONO } from '../utils/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface ScoreDeltaBadgeProps {
  /**
   * The increase to announce. Rendered as "+N" with two decimals to match the
   * scoreboard's score formatting. Nothing renders for null/zero/negative —
   * callers can pass the raw delta straight from `useAnimatedNumber`.
   */
  delta: number | null;
  /** Optional test hook for platform E2E/unit assertions. */
  testID?: string;
}

/**
 * The premium "+N points" flourish that rides alongside a score increase on
 * the matchup scoreboard (LS-6392 / FMD-012).
 *
 * Colours are literal hex constants, never `var(--token)` strings: this
 * component carries an `animation` prop, and Tamagui's react-native animation
 * driver crashes at runtime when it tries to interpolate a CSS custom property
 * (it returns null from RN's colour normalizer and then maps over it). Build,
 * typecheck and lint all stay green when that happens — it only fails in the
 * browser — so the constraint is enforced by `make lint-animated-theme-vars`
 * (LS-8554) and must be preserved by hand here. See `.agents/skills/ui/SKILL.md`.
 *
 * Built from Tamagui primitives only (no raw HTML elements), so it renders on
 * both `apps/web` and `apps/app`.
 */
export function ScoreDeltaBadge({ delta, testID }: ScoreDeltaBadgeProps) {
  const reducedMotion = useReducedMotion();
  if (delta == null || delta <= 0) return null;

  return (
    <XStack
      testID={testID}
      // Springs settle at browser-dependent durations; collapse to a
      // near-instant timing animation under prefers-reduced-motion, matching
      // the Dialog/Sheet precedent (LS-8995).
      animation={reducedMotion ? '100ms' : 'medium'}
      enterStyle={{ opacity: 0, y: 6 }}
      opacity={1}
      y={0}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius="$10"
      borderWidth={1}
      borderColor={withAlpha(GREEN, 0.45)}
      backgroundColor={withAlpha(GREEN, 0.16)}
      // Announced by the scoreboard's own aria-live score node, so the badge
      // itself is decorative — a second live region would double-announce.
      aria-hidden
    >
      <Text fontFamily={FONT_MONO} fontSize="$1" fontWeight="700" color={GREEN}>
        {`+${delta.toFixed(2)}`}
      </Text>
    </XStack>
  );
}

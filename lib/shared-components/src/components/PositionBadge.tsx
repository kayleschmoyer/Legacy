import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  getPositionColor,
  POS_UTILITY,
  WHITE,
  withAlpha,
} from '../utils/colors';
import type { Sport } from '../utils/colors';

export type PositionBadgeVariant = 'alpha' | 'solid';
export type PositionBadgeShape = 'chip' | 'circle';

export interface PositionBadgeProps {
  /** Position abbreviation to display, e.g. "QB", "1B", "DST". */
  position: string;
  /**
   * Sport used to resolve a color via the canonical `getPositionColor()` when
   * `color` is not given. Omit and pass `color` (or `backgroundColor` +
   * `textColor`) directly for callers with a legacy/local color source.
   */
  sport?: Sport;
  /** Explicit color override (hex). Takes precedence over `sport`. */
  color?: string;
  /**
   * Full override for the badge background (e.g. a Tamagui theme token like
   * `'$amber3'`). Wins over the `variant`-derived background.
   */
  backgroundColor?: string;
  /**
   * Full override for the label color (e.g. a Tamagui theme token like
   * `'$amber11'`). Wins over the `variant`-derived text color.
   */
  textColor?: string;
  /**
   * `'alpha'` (translucent tinted background + colored text, optionally a
   * subtle tinted border — the football-detail style) or `'solid'` (solid
   * color background + white/token text). Default `'alpha'`.
   */
  variant?: PositionBadgeVariant;
  /** Background alpha for the `'alpha'` variant. Default 0.15. */
  alpha?: number;
  /** Border alpha for the `'alpha'` variant (only applies when `showBorder`). Default 0.5. */
  borderAlpha?: number;
  /** Whether to render a 1px tinted border. Default `false`. */
  showBorder?: boolean;
  /** `'chip'` (rounded rectangle, default) or `'circle'` (fixed-size avatar badge used by roster views). */
  shape?: PositionBadgeShape;
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  borderRadius?: number | string;
  minWidth?: number | string;
  /**
   * Fixed container width/height (`shape="chip"` only — `shape="circle"` sizes
   * itself from `size`). Set both to render a fixed-size tile (e.g. a square
   * position tile) instead of the default content-hugging pill. Omit for the
   * default padding-driven sizing.
   */
  width?: number;
  height?: number;
  /** Circle diameter (`shape="circle"` only). Default 36. */
  size?: number;
  fontSize?: number | string;
  fontWeight?: string;
  fontFamily?: string;
  /**
   * Numeric points only — forwarded to the native text style, where React
   * Native requires a number; a CSS unit string like `'0.08em'` hard-crashes
   * Android (LS-8624). Tamagui renders the number as `px` on web.
   */
  letterSpacing?: number;
  /** Opacity of the whole badge, e.g. to dim it while a related item is drafted/disabled. */
  opacity?: number;
  /** Overrides the default label `Text` — e.g. a loading `Spinner` in the same color. */
  children?: React.ReactNode;
}

const CIRCLE_DEFAULT_SIZE = 36;

/**
 * Shared position pill/badge (Tamagui, cross-platform) used across roster,
 * draft, and player-stats surfaces (LS-8568). Color resolution and container
 * sizing are both overridable so each call site can preserve its exact prior
 * appearance — this consolidates only the duplicated markup, not the
 * (sometimes divergent) color sources feeding it.
 */
export function PositionBadge({
  position,
  sport,
  color,
  backgroundColor,
  textColor,
  variant = 'alpha',
  alpha = 0.15,
  borderAlpha = 0.5,
  showBorder = false,
  shape = 'chip',
  paddingHorizontal = 7,
  paddingVertical = 2,
  borderRadius = 4,
  minWidth,
  width,
  height,
  size = CIRCLE_DEFAULT_SIZE,
  fontSize = 11,
  fontWeight = '700',
  fontFamily,
  letterSpacing,
  opacity,
  children,
}: PositionBadgeProps) {
  const resolvedColor =
    color ?? (sport ? getPositionColor(sport, position) : POS_UTILITY);
  const background =
    backgroundColor ??
    (variant === 'solid' ? resolvedColor : withAlpha(resolvedColor, alpha));
  const label = textColor ?? (variant === 'solid' ? WHITE : resolvedColor);
  const border = showBorder ? withAlpha(resolvedColor, borderAlpha) : undefined;

  const content = children ?? (
    <Text
      fontSize={fontSize}
      fontWeight={fontWeight}
      color={label}
      fontFamily={fontFamily}
      letterSpacing={letterSpacing}
    >
      {position}
    </Text>
  );

  if (shape === 'circle') {
    return (
      <YStack
        width={size}
        height={size}
        borderRadius={size / 2}
        backgroundColor={background}
        borderWidth={border ? 1 : undefined}
        borderColor={border}
        opacity={opacity}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {content}
      </YStack>
    );
  }

  return (
    <XStack
      paddingHorizontal={width == null ? paddingHorizontal : undefined}
      paddingVertical={height == null ? paddingVertical : undefined}
      borderRadius={borderRadius}
      minWidth={minWidth}
      width={width}
      height={height}
      backgroundColor={background}
      borderWidth={border ? 1 : undefined}
      borderColor={border}
      opacity={opacity}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      {content}
    </XStack>
  );
}

export default PositionBadge;

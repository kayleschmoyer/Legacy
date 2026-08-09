/**
 * StatusBadge — a small pill that shows a status label with colour coding.
 *
 * Used for draft status, matchup status, custom/override indicators, etc.
 * Replaces 8+ inline badge implementations across web and mobile.
 *
 * Uses `Animated` from `react-native` (aliased to `react-native-web` in web
 * builds via Next.js + Tamagui config) for the pulsing dot on `draftLive`.
 * This is the same pattern used by {@link Chip} for its live-state dot.
 */
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Text, XStack } from 'tamagui';

export type StatusBadgeVariant =
  // Semantic variants
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'
  | 'accent'
  // Heritage product lifecycle states
  | 'draftLive'
  | 'preDraft'
  | 'live'
  | 'final'
  | 'active'
  | 'comingSoon';

export type StatusBadgeSize = 'xs' | 'sm' | 'md';

export interface StatusBadgeProps {
  /** The label text to display inside the badge. */
  label: string;
  /** Colour variant. Defaults to 'neutral'. */
  variant?: StatusBadgeVariant;
  /** Size preset. Controls font size and padding. Defaults to 'sm'. */
  size?: StatusBadgeSize;
  /** Override background colour. */
  backgroundColor?: string;
  /** Override text colour. */
  color?: string;
  /** Override font size only; use `size` prop to control both font size and padding together. */
  fontSize?: number;
  /**
   * Show a leading dot in this colour, overriding the variant's default dot
   * (if any). Pass any variant + `dotColor` to add a dot indicator that
   * isn't built into that variant — e.g. `variant="success" dotColor="$success"`
   * for an "On Time" state.
   */
  dotColor?: string;
  /** Whether the dot pulses. Only applies when a dot is shown. Defaults to the variant's own pulse behavior (`false` unless overridden). */
  pulseDot?: boolean;
}

const SIZE_STYLES: Record<
  StatusBadgeSize,
  { fontSize: number; padH: number; padV: number }
> = {
  xs: { fontSize: 9, padH: 8, padV: 2 },
  sm: { fontSize: 11, padH: 10, padV: 4 },
  md: { fontSize: 13, padH: 14, padV: 6 },
};

const VARIANT_STYLES: Record<
  StatusBadgeVariant,
  {
    bg: string;
    color: string;
    border: string;
    dotColor?: string;
    pulse?: boolean;
  }
> = {
  // Semantic variants — Tamagui theme tokens (lib/tamagui-config), resolved
  // per active theme so both light and dark render correctly.
  info: {
    bg: '$accentMuted',
    color: '$color12',
    border: '$brandNavyLight',
  },
  success: {
    bg: '$successMuted',
    color: '$green10',
    border: '$green7',
  },
  warning: {
    bg: '$warningMuted',
    color: '$amber10',
    border: '$amber7',
  },
  error: {
    bg: '$red3',
    color: '$red10',
    border: '$red7',
  },
  neutral: {
    bg: '$surfaceCard',
    color: '$textMuted',
    border: '$outlineStrong',
  },
  // Gold heritage accent — "Premium", featured, or championship moments.
  // Never use for action-required states (that's `error`/`draftLive`).
  accent: {
    bg: '$amber3',
    color: '$brandGoldLight',
    border: '$brandGoldDark',
  },
  // Heritage lifecycle states.
  // draftLive: action-required (seam red) + pulsing live dot. The pulse dot
  // renders via a raw RN `Animated.View` style (PulseDot below), which
  // bypasses Tamagui's own token resolution — `useTheme()` is unavailable in
  // this repo's installed Tamagui version (its types don't resolve; nothing
  // else in the codebase uses it). `brandSeamRedLight` is `#E63950` in both
  // brandDark and brandLight (lib/tamagui-config), so a literal is
  // theme-safe here — unlike the other variants, it can't regress a theme.
  draftLive: {
    bg: '$red3',
    color: '$red10',
    border: '$red7',
    dotColor: '#E63950',
    pulse: true,
  },
  // preDraft: pre-season anticipation (heritage gold) + static dot.
  preDraft: {
    bg: '$amber3',
    color: '$brandGoldLight',
    border: '$brandGoldDark',
    dotColor: '$brandGold',
  },
  live: {
    bg: '$red3',
    color: '$red10',
    border: '$red7',
  },
  final: {
    bg: '$surfaceCard',
    color: '$textMuted',
    border: '$outlineStrong',
  },
  active: {
    bg: '$successMuted',
    color: '$green10',
    border: '$green7',
  },
  comingSoon: {
    bg: '$warningMuted',
    color: '$amber10',
    border: '$amber7',
  },
};

function PulseDot({ color }: { color: string }): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

export function StatusBadge({
  label,
  variant = 'neutral',
  size = 'sm',
  backgroundColor,
  color,
  fontSize,
  dotColor,
  pulseDot,
}: StatusBadgeProps): React.JSX.Element {
  const styles = VARIANT_STYLES[variant];
  const sizeStyles = SIZE_STYLES[size];
  const resolvedFontSize = fontSize ?? sizeStyles.fontSize;
  const letterSpacing = resolvedFontSize * 0.1;
  const resolvedDotColor = dotColor ?? styles.dotColor;
  const resolvedPulse = pulseDot ?? styles.pulse ?? false;

  return (
    <XStack
      paddingHorizontal={sizeStyles.padH}
      paddingVertical={sizeStyles.padV}
      borderRadius={9999}
      backgroundColor={backgroundColor ?? styles.bg}
      borderWidth={1}
      borderColor={styles.border}
      alignSelf="flex-start"
      alignItems="center"
      gap={6}
    >
      {resolvedDotColor != null &&
        (resolvedPulse ? (
          <PulseDot color={resolvedDotColor} />
        ) : (
          <XStack
            width={6}
            height={6}
            borderRadius={3}
            backgroundColor={resolvedDotColor}
          />
        ))}
      <Text
        fontFamily="$heading"
        fontSize={resolvedFontSize}
        fontWeight="700"
        color={color ?? styles.color}
        textTransform="uppercase"
        letterSpacing={letterSpacing}
      >
        {label}
      </Text>
    </XStack>
  );
}

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Text, XStack } from 'tamagui';
import type { GetProps } from 'tamagui';

export type Position = 'P' | 'C' | 'IF' | 'OF' | 'U';
export type ChipTone =
  | 'neutral'
  | 'navy'
  | 'gold'
  | 'seam'
  | 'success'
  | 'warning'
  | 'info'
  | 'live'
  | 'pre'
  | 'active'
  | 'soon'
  | 'fin'
  | Position;

export interface ChipProps extends Omit<
  GetProps<typeof XStack>,
  'size' | 'children'
> {
  label: string;
  tone?: ChipTone;
  /** Whether the chip is in a "selected" filter state. */
  selected?: boolean;
  /** Optional leading node (icon, dot). */
  leading?: React.ReactNode;
  /** Optional trailing node (e.g. close ✕). */
  trailing?: React.ReactNode;
  size?: 'sm' | 'md';
}

const TONE_STYLES: Record<
  ChipTone,
  { bg: string; fg: string; border: string; alwaysBorder?: boolean }
> = {
  neutral: { bg: '$surfaceCard', fg: '$color', border: '$outlineStrong' },
  navy: { bg: '$brandNavy', fg: '$color12', border: '$brandNavyLight' },
  gold: { bg: '$brandGold', fg: '#1A1206', border: '$brandGoldDark' },
  seam: { bg: '$brandSeamRed', fg: '#FFFFFF', border: '$brandSeamRedLight' },
  success: { bg: '$successMuted', fg: '$green10', border: '$green7' },
  warning: { bg: '$warningMuted', fg: '$amber10', border: '$amber7' },
  info: { bg: '$accentMuted', fg: '$blue10', border: '$blue8' },
  // Status chips — league lifecycle states, always show border.
  // Backgrounds use rgba values (same pattern as position chips below) since
  // no dedicated alpha-tinted tokens exist in the current foundations slice.
  // fg/border use Tamagui tokens where exact equivalents exist.
  live: {
    bg: 'rgba(196,30,58,0.15)',
    fg: '$brandSeamRedLight',
    border: 'rgba(196,30,58,0.4)',
    alwaysBorder: true,
  },
  pre: {
    bg: 'rgba(197,165,90,0.12)',
    fg: '$brandGoldLight',
    border: 'rgba(197,165,90,0.4)',
    alwaysBorder: true,
  },
  active: {
    bg: 'rgba(34,197,94,0.12)',
    fg: '#22C55E',
    border: 'rgba(34,197,94,0.4)',
    alwaysBorder: true,
  },
  soon: {
    bg: 'rgba(245,158,11,0.12)',
    fg: '#F59E0B',
    border: 'rgba(245,158,11,0.4)',
    alwaysBorder: true,
  },
  fin: {
    bg: 'rgba(127,144,174,0.15)',
    fg: '$textMuted',
    border: '$outlineStrong',
    alwaysBorder: true,
  },
  // Position chips — semantic field colors
  P: { bg: 'rgba(196,30,58,0.16)', fg: '#E07A8C', border: '$positionPitcher' },
  C: {
    bg: 'rgba(124,135,148,0.18)',
    fg: '#C5CDD8',
    border: '$positionCatcher',
  },
  IF: {
    bg: 'rgba(139,111,71,0.20)',
    fg: '#D4B58A',
    border: '$positionInfield',
  },
  OF: {
    bg: 'rgba(45,106,79,0.22)',
    fg: '#7FCFA1',
    border: '$positionOutfield',
  },
  U: {
    bg: 'rgba(197,165,90,0.20)',
    fg: '$brandGoldLight',
    border: '$brandGold',
  },
};

/** Status tones that use the design-system eyebrow typography and always-visible borders. */
const STATUS_TONES = new Set<ChipTone>([
  'live',
  'pre',
  'active',
  'soon',
  'fin',
]);

function PulseDot({ color }: { color: string }): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
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
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

/**
 * Pill chip — used for player positions, status, filters. Borderless
 * by default; selected state or status tones (live/pre/active/soon/fin)
 * always show their border.
 */
export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  leading,
  trailing,
  size = 'md',
  ...rest
}: ChipProps): React.JSX.Element {
  const styles = TONE_STYLES[tone];
  const isStatus = STATUS_TONES.has(tone);
  const padY = size === 'sm' ? 2 : isStatus ? 6 : 4;
  const padX = size === 'sm' ? 8 : isStatus ? 12 : 10;
  const fontSize = size === 'sm' ? 11 : isStatus ? 11 : 12;
  const leadingNode =
    leading ?? (tone === 'live' ? <PulseDot color={styles.fg} /> : undefined);
  return (
    <XStack
      alignItems="center"
      gap={6}
      paddingHorizontal={padX}
      paddingVertical={padY}
      borderRadius={9999}
      backgroundColor={styles.bg}
      borderWidth={1}
      borderColor={
        selected || styles.alwaysBorder ? styles.border : 'transparent'
      }
      hoverStyle={{ borderColor: styles.border }}
      pressStyle={{ scale: 0.97 }}
      animation="quick"
      alignSelf="flex-start"
      role={rest.onPress != null ? 'button' : undefined}
      tabIndex={rest.onPress != null ? 0 : undefined}
      onKeyDown={
        rest.onPress != null
          ? (e: React.KeyboardEvent<HTMLElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }
          : undefined
      }
      {...rest}
    >
      {leadingNode}
      <Text
        fontFamily={isStatus ? '$heading' : '$body'}
        fontSize={fontSize}
        fontWeight="700"
        color={styles.fg}
        letterSpacing={isStatus ? 1.32 : 0.4}
        textTransform={isStatus ? 'uppercase' : undefined}
      >
        {label}
      </Text>
      {trailing}
    </XStack>
  );
}

/** Convenience for a position-coded chip (P/C/IF/OF/U). */
export function PositionChip({
  position,
  ...rest
}: { position: Position } & Omit<
  ChipProps,
  'tone' | 'label'
>): React.JSX.Element {
  return <Chip tone={position} label={position} {...rest} />;
}

import React from 'react';
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
  { bg: string; fg: string; border: string }
> = {
  neutral: { bg: '$surfaceCard', fg: '$color', border: '$outlineStrong' },
  navy: { bg: '$brandNavy', fg: '$color12', border: '$brandNavyLight' },
  gold: { bg: '$brandGold', fg: '#1A1206', border: '$brandGoldDark' },
  seam: { bg: '$brandSeamRed', fg: '#FFFFFF', border: '$brandSeamRedLight' },
  success: { bg: '$successMuted', fg: '$green10', border: '$green7' },
  warning: { bg: '$warningMuted', fg: '$amber10', border: '$amber7' },
  info: { bg: '$accentMuted', fg: '$blue10', border: '$blue8' },
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

/**
 * Pill chip — used for player positions, status, filters. Borderless
 * by default; selected state strengthens the border.
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
  const padY = size === 'sm' ? 2 : 4;
  const padX = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <XStack
      alignItems="center"
      gap={6}
      paddingHorizontal={padX}
      paddingVertical={padY}
      borderRadius={9999}
      backgroundColor={styles.bg}
      borderWidth={1}
      borderColor={selected ? styles.border : 'transparent'}
      hoverStyle={{ borderColor: styles.border }}
      pressStyle={{ scale: 0.97 }}
      animation="quick"
      alignSelf="flex-start"
      {...rest}
    >
      {leading}
      <Text
        fontFamily="$body"
        fontSize={fontSize}
        fontWeight="700"
        color={styles.fg}
        letterSpacing={0.4}
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

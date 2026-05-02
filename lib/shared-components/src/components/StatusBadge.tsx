/**
 * StatusBadge — a small pill that shows a status label with colour coding.
 *
 * Used for draft status, matchup status, custom/override indicators, etc.
 * Replaces 8+ inline badge implementations across web and mobile.
 */
import React from 'react';
import { Text, XStack } from 'tamagui';

export type StatusBadgeVariant =
  // Generic semantic variants (legacy API).
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'
  | 'accent'
  // Brand-aligned product states (per Claude Design handoff).
  | 'draftLive'
  | 'preDraft'
  | 'live'
  | 'final'
  | 'active'
  | 'comingSoon';

export interface StatusBadgeProps {
  /** The label text to display inside the badge. */
  label: string;
  /** Colour variant. Defaults to 'neutral'. */
  variant?: StatusBadgeVariant;
  /** Override background colour. */
  backgroundColor?: string;
  /** Override text colour. */
  color?: string;
  /** Text size. Defaults to 11. */
  fontSize?: number;
}

const VARIANT_STYLES: Record<
  StatusBadgeVariant,
  { bg: string; color: string; border: string }
> = {
  info: { bg: '$blue3', color: '$blue10', border: '$blue6' },
  success: { bg: '$green3', color: '$green10', border: '$green6' },
  warning: { bg: '$yellow3', color: '$yellow10', border: '$yellow6' },
  error: { bg: '$red3', color: '$red10', border: '$red6' },
  neutral: { bg: '$gray3', color: '$gray10', border: '$gray6' },
  accent: { bg: '$blue3', color: '$blue10', border: '$blue7' },

  // Heritage product states. Tuned for the dark "night stadium" surface.
  draftLive: {
    bg: 'rgba(196, 30, 58, 0.18)',
    color: '#F4B7C0',
    border: '$brandSeamRed',
  },
  preDraft: {
    bg: 'rgba(27, 58, 92, 0.30)',
    color: '#C7D6F4',
    border: '$brandNavyLight',
  },
  live: {
    bg: 'rgba(196, 30, 58, 0.22)',
    color: '#FFE3E8',
    border: '$brandSeamRedLight',
  },
  final: {
    bg: 'rgba(124, 135, 148, 0.18)',
    color: '#D7DEE8',
    border: '$outlineStrong',
  },
  active: {
    bg: 'rgba(45, 106, 79, 0.22)',
    color: '#9CE5BA',
    border: '$green7',
  },
  comingSoon: {
    bg: 'rgba(197, 165, 90, 0.18)',
    color: '$brandGoldLight',
    border: '$brandGold',
  },
};

export function StatusBadge({
  label,
  variant = 'neutral',
  backgroundColor,
  color,
  fontSize = 11,
}: StatusBadgeProps): React.JSX.Element {
  const styles = VARIANT_STYLES[variant];

  return (
    <XStack
      paddingHorizontal="$2"
      paddingVertical={2}
      borderRadius="$10"
      backgroundColor={backgroundColor ?? styles.bg}
      borderWidth={1}
      borderColor={styles.border}
      alignSelf="flex-start"
    >
      <Text
        fontSize={fontSize}
        fontWeight="700"
        color={color ?? styles.color}
        textTransform="uppercase"
        letterSpacing={0.6}
      >
        {label}
      </Text>
    </XStack>
  );
}

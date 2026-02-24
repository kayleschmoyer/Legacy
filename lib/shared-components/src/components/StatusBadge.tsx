/**
 * StatusBadge — a small pill that shows a status label with colour coding.
 *
 * Used for draft status, matchup status, custom/override indicators, etc.
 * Replaces 8+ inline badge implementations across web and mobile.
 */
import React from 'react';
import { Text, XStack } from 'tamagui';

export type StatusBadgeVariant =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'
  | 'accent';

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
      >
        {label}
      </Text>
    </XStack>
  );
}

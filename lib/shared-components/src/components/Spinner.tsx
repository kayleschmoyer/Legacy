import React from 'react';
import { Spinner as TamaguiSpinner, Text, XStack, YStack } from 'tamagui';

export interface SpinnerProps {
  /** Spinner size. Defaults to "large". */
  size?: 'small' | 'large';
  /** Tamagui color token (e.g. "$brandGold") or hex. Defaults to brand gold. */
  color?: string;
  /** Optional caption rendered below the spinner. */
  label?: string;
  /** Centred full-page variant. */
  fullPage?: boolean;
}

/**
 * Loading spinner. Defaults to brand-gold so it reads as a heritage
 * accent on the dark "night stadium" backdrop.
 */
export function Spinner({
  label,
  fullPage = false,
  color = '$brandGold',
  size = 'large',
}: SpinnerProps): React.JSX.Element {
  const inner = (
    <YStack alignItems="center" gap="$2">
      <TamaguiSpinner size={size} color={color} />
      {label ? (
        <Text fontFamily="$body" fontSize={13} color="$textMuted">
          {label}
        </Text>
      ) : null}
    </YStack>
  );
  if (!fullPage) return inner;
  return (
    <YStack
      width="100%"
      height="100%"
      flex={1}
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      {inner}
    </YStack>
  );
}

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
}

/**
 * Pulsing skeleton placeholder block. Composes vertically/horizontally
 * to mock list rows or card layouts before content arrives.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
}: SkeletonProps): React.JSX.Element {
  return (
    <YStack
      width={width}
      height={height}
      borderRadius={radius}
      backgroundColor="$surfaceCard"
      opacity={0.65}
      animation="medium"
      enterStyle={{ opacity: 0.4 }}
      hoverStyle={{ opacity: 0.75 }}
    />
  );
}

/** Pre-composed row skeleton — 1 thumb + 2 stacked text bars. */
export function SkeletonRow(): React.JSX.Element {
  return (
    <XStack gap="$3" padding="$3" alignItems="center" width="100%">
      <Skeleton width={40} height={40} radius={9999} />
      <YStack flex={1} gap="$2">
        <Skeleton width="60%" height={12} />
        <Skeleton width="35%" height={10} />
      </YStack>
    </XStack>
  );
}

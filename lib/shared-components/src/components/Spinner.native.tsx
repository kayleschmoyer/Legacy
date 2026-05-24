import React from 'react';
import { Spinner as TamaguiSpinner, Text, YStack } from 'tamagui';
import type { SpinnerProps } from './Spinner';

export type { SkeletonProps } from './Skeleton';
export { Skeleton, SkeletonRow } from './Skeleton';

// Map design-system ring sizes to the two sizes Tamagui's ActivityIndicator supports.
const TAMAGUI_SIZE: Record<'sm' | 'md' | 'lg', 'small' | 'large'> = {
  sm: 'small',
  md: 'small',
  lg: 'large',
};

/** React Native fallback — delegates to TamaguiSpinner (ActivityIndicator). */
export function Spinner({
  size = 'lg',
  color = '$brandGold',
  label,
  fullPage = false,
}: SpinnerProps): React.JSX.Element {
  const inner = (
    <YStack alignItems="center" gap="$2">
      <TamaguiSpinner size={TAMAGUI_SIZE[size]} color={color} />
      {label ? (
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.2}
          textTransform="uppercase"
          color="$textMuted"
        >
          {label}
        </Text>
      ) : null}
    </YStack>
  );

  if (!fullPage) return inner;

  return (
    <YStack
      flex={1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      {inner}
    </YStack>
  );
}

import React from 'react';
import { XStack, YStack } from 'tamagui';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
}

/** Pulsing placeholder block. Compose vertically/horizontally to mock lists or cards. */
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

/** Pre-composed row skeleton — 1 avatar thumb + 2 stacked text bars. */
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

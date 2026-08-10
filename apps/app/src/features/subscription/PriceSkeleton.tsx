import type React from 'react';
import { YStack } from 'tamagui';

export interface PriceSkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
}

/**
 * Pulsing placeholder block for price text that is still loading. Mirrors
 * `apps/web/src/components/PriceSkeleton.tsx`.
 */
export function PriceSkeleton({
  width = 80,
  height = 14,
  radius = 6,
}: PriceSkeletonProps): React.JSX.Element {
  return (
    <YStack
      width={width}
      height={height}
      borderRadius={radius}
      backgroundColor="$surfaceCard"
      opacity={0.65}
      animation="medium"
      enterStyle={{ opacity: 0.4 }}
    />
  );
}

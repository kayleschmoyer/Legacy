import type React from 'react';
import { YStack } from 'tamagui';

export interface PriceSkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
}

/**
 * Pulsing placeholder block for price text that is still loading.
 *
 * Deliberately local (not `@legacy-sports/shared-components`'s `Skeleton`):
 * PremiumGate and UpgradeModal are imported by ~15 other pages, and the
 * shared-components package barrel pulls in unrelated feature modules that
 * fail to load under Jest in some test files that don't mock it — see
 * LS-8813. Importing only `tamagui` avoids that blast radius.
 */
export function PriceSkeleton({
  width = '100%',
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
      hoverStyle={{ opacity: 0.75 }}
    />
  );
}

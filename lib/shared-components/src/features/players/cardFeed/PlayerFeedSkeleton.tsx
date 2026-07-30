import React from 'react';
import { XStack, YStack } from 'tamagui';
import {
  STATS_BORDER,
  SURFACE_PANEL,
  WHITE,
  withAlpha,
} from '../../../utils/colors';

const SKELETON_CARD_COUNT = 8;

function ShimmerBar({ width }: { width: number }) {
  return (
    <YStack
      width={width}
      height={10}
      borderRadius={3}
      backgroundColor={withAlpha(WHITE, 0.08)}
    />
  );
}

/**
 * Loading placeholder for the Players card feed (LS-8832, design handoff
 * option 1c) — 8 skeleton cards sharing the real card's geometry, distinct
 * from the stats-grid's row-shaped {@link LoadingSkeleton} (`shell/StateCards`)
 * since this feed's rows are cards, not table rows.
 */
export function PlayerFeedSkeleton({
  testID = 'players-card-feed-skeleton',
}: {
  testID?: string;
}) {
  return (
    <YStack testID={testID} gap={8} role="presentation" aria-hidden={true}>
      {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
        <XStack
          key={i}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={STATS_BORDER}
          borderRadius={12}
          padding={12}
          gap={12}
          alignItems="center"
        >
          <YStack
            width={38}
            height={38}
            borderRadius={9}
            backgroundColor={withAlpha(WHITE, 0.08)}
          />
          <YStack flex={1} gap={6}>
            <ShimmerBar width={140} />
            <ShimmerBar width={100} />
          </YStack>
          <YStack alignItems="flex-end" gap={6}>
            <ShimmerBar width={44} />
            <ShimmerBar width={36} />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

export default PlayerFeedSkeleton;

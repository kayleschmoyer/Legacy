import React from 'react';
import { H2, XStack, YStack } from 'tamagui';
import {
  FootballPlayerCard,
  type FootballPlayerCardPlayer,
} from './FootballPlayerCard';

export interface TrendingPlayersPreviewProps {
  players: FootballPlayerCardPlayer[];
  loading?: boolean;
}

// Matches the `first: 5` page size FootballHubPage requests for the
// trending-players query, so the skeleton's row count doesn't shift once
// real data resolves (LS-6276/FBH-022).
const SKELETON_CARD_COUNT = 5;

function ShimmerBar({
  width,
  height = 10,
}: {
  width: number | string;
  height?: number;
}) {
  return (
    <YStack
      height={height}
      width={width}
      borderRadius="$2"
      backgroundColor="$gray5"
    />
  );
}

/**
 * Loading placeholder for {@link TrendingPlayersPreview} — mirrors
 * {@link FootballPlayerCard}'s geometry (team-badge square, name/position
 * line, stat lines) so the swap to real cards doesn't reflow the page once
 * trending players resolve (LS-6276/FBH-022). Replaces a plain centered
 * Spinner, which gave no sense of the final layout and caused a CLS hit.
 */
function TrendingPlayersSkeleton() {
  return (
    <XStack
      testID="trending-players-skeleton"
      gap="$3"
      flexWrap="wrap"
      role="presentation"
      aria-hidden={true}
    >
      {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
        <YStack
          key={i}
          minWidth={220}
          flex={1}
          backgroundColor="$glassSurface"
          borderWidth={1}
          borderColor="$glassBorder"
          borderRadius="$3"
          padding="$3"
          gap="$3"
        >
          <XStack gap="$3" alignItems="flex-start">
            <YStack
              width={48}
              height={48}
              borderRadius="$2"
              backgroundColor="$gray5"
              flexShrink={0}
            />
            <YStack flex={1} gap="$2">
              <ShimmerBar width="70%" height={15} />
              <ShimmerBar width="40%" height={11} />
            </YStack>
          </XStack>
          <YStack gap="$2">
            <ShimmerBar width="55%" />
            <ShimmerBar width="45%" />
          </YStack>
        </YStack>
      ))}
    </XStack>
  );
}

// Football Home preview of top/trending players (LS-5411). Renders a small,
// read-only row of FootballPlayerCards — no selection/roster actions, no
// per-player navigation. The section renders nothing once loading finishes
// with zero players rather than showing an empty heading.
function TrendingPlayersPreview({
  players,
  loading = false,
}: TrendingPlayersPreviewProps) {
  if (!loading && players.length === 0) {
    return null;
  }

  return (
    <YStack gap="$4">
      <H2 color="$color" fontSize="$7" fontWeight="700">
        Trending Players
      </H2>
      <YStack testID="trending-players-preview" gap="$2">
        {loading ? (
          <TrendingPlayersSkeleton />
        ) : (
          <XStack gap="$3" flexWrap="wrap">
            {players.map((player) => (
              <YStack
                key={player.id}
                testID={`trending-player-row-${player.id}`}
                minWidth={220}
                flex={1}
              >
                <FootballPlayerCard player={player} />
              </YStack>
            ))}
          </XStack>
        )}
      </YStack>
    </YStack>
  );
}

export { TrendingPlayersPreview };
export default TrendingPlayersPreview;

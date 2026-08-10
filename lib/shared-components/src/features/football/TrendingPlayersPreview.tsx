import React from 'react';
import { H2, Spinner, XStack, YStack } from 'tamagui';
import {
  FootballPlayerCard,
  type FootballPlayerCardPlayer,
} from './FootballPlayerCard';

export interface TrendingPlayersPreviewProps {
  players: FootballPlayerCardPlayer[];
  loading?: boolean;
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
          <YStack alignItems="center" padding="$5">
            <Spinner size="large" color="$orange9" />
          </YStack>
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

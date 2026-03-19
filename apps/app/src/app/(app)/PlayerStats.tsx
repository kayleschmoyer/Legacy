import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  PlayerStatsPage,
  type PlayerWithStats,
} from '@legacy-sports/shared-components';

/**
 * Mobile Player Statistics Screen
 *
 * Wraps the shared PlayerStatsPage component with mobile navigation.
 * Tapping a player navigates to the PlayerDetail screen via Expo Router.
 */
export default function PlayerStatsScreen() {
  const router = useRouter();

  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      router.push({
        pathname: '/PlayerDetail',
        params: { playerId: String(player.id), playerName: player.name },
      });
    },
    [router],
  );

  return (
    <PlayerStatsPage
      onPlayerDetails={handlePlayerDetails}
      showHeader={true}
      showActions={false}
      statsFormat="standard"
    />
  );
}

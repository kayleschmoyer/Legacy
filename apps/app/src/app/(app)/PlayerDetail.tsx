import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlayerDetailById } from '@legacy-sports/shared-components';

/**
 * Mobile Player Detail Screen
 *
 * Shows detailed information for a specific player using the shared
 * PlayerDetailById component which fetches data by player ID.
 */
export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams<{
    playerId: string;
    playerName: string;
  }>();

  const id = playerId ? parseInt(playerId, 10) : 0;

  return <PlayerDetailById playerId={id} />;
}

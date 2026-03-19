import React from 'react';
import { useRouter } from 'expo-router';
import { SeasonDraftGameLobby } from '@legacy-sports/shared-components';

/**
 * Mobile Season Draft Games Lobby
 *
 * Lists all season draft games for the current user.
 * Wraps the shared SeasonDraftGameLobby component for mobile navigation.
 */
export default function SeasonDraftGamesScreen() {
  const router = useRouter();

  return (
    <SeasonDraftGameLobby
      onSelectGame={(gameId) =>
        router.push({
          pathname: '/season-draft/[gameId]',
          params: { gameId: String(gameId) },
        })
      }
      onCreateGame={() => router.push({ pathname: '/season-draft/create' })}
      onBack={() => router.back()}
    />
  );
}

import { useCallback } from 'react';
import { useApolloClient } from '@apollo/client/react';
import {
  GetDraftPickPlayer as GET_DRAFT_PICK_PLAYER,
  type GetDraftPickPlayerQuery,
  type GetDraftPickPlayerQueryVariables,
} from '@legacy-sports/graphql';
import type { AvailableDraftPlayer } from '../types';

/**
 * On-demand single-player lookup for live pick announcements (LS-10627). A
 * pick by another user can name a player this client never loaded (outside
 * the available-players page and stats maps); this resolves them by id.
 * Cache-first, so a repeated id costs nothing. Resolves null when the player
 * does not exist; rejects on a network error (the caller falls back).
 */
export function useFetchDraftPlayer(): (
  playerId: number,
) => Promise<AvailableDraftPlayer | null> {
  const client = useApolloClient();
  return useCallback(
    async (playerId) => {
      const { data } = await client.query<
        GetDraftPickPlayerQuery,
        GetDraftPickPlayerQueryVariables
      >({
        query: GET_DRAFT_PICK_PLAYER,
        variables: { playerId },
        fetchPolicy: 'cache-first',
      });
      const player = data?.player;
      if (player?.id == null) return null;
      return {
        id: player.id,
        firstName: player.firstName ?? '',
        lastName: player.lastName ?? '',
        brefId: '',
        eligiblePositions: player.eligiblePositions ?? null,
        club: player.club ?? null,
      };
    },
    [client],
  );
}

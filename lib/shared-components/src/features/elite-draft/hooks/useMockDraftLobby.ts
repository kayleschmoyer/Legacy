/**
 * Mock-draft lobby actions (LS-10076): the mutations `MockDraftLobby` fires.
 *
 * Kept out of `useDraftActions`, which is the league draft's action set — a
 * mock draft has no commissioner, no slot trades and no initializeDraft.
 */

import { useCallback, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  KickMockDraftSeat as KICK_MOCK_DRAFT_SEAT,
  type KickMockDraftSeatMutation,
  type KickMockDraftSeatMutationVariables,
  LeaveMockDraft as LEAVE_MOCK_DRAFT,
  type LeaveMockDraftMutation,
  type LeaveMockDraftMutationVariables,
  StartMockDraft as START_MOCK_DRAFT,
  type StartMockDraftMutation,
  type StartMockDraftMutationVariables,
  UpdateMockDraftLobby as UPDATE_MOCK_DRAFT_LOBBY,
  type UpdateMockDraftLobbyMutation,
  type UpdateMockDraftLobbyMutationVariables,
} from '@legacy-sports/graphql';

export interface UseMockDraftLobbyParams {
  draftId: number | null;
  /** Refetch the room after a lobby change. */
  onChanged: () => void;
  /** Where to go once the caller no longer holds a seat. */
  onLeft: () => void;
}

export function useMockDraftLobby({
  draftId,
  onChanged,
  onLeft,
}: UseMockDraftLobbyParams) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [startMockDraft] = useMutation<
    StartMockDraftMutation,
    StartMockDraftMutationVariables
  >(START_MOCK_DRAFT);
  const [kickMockDraftSeat] = useMutation<
    KickMockDraftSeatMutation,
    KickMockDraftSeatMutationVariables
  >(KICK_MOCK_DRAFT_SEAT);
  const [updateMockDraftLobby] = useMutation<
    UpdateMockDraftLobbyMutation,
    UpdateMockDraftLobbyMutationVariables
  >(UPDATE_MOCK_DRAFT_LOBBY);
  const [leaveMockDraft] = useMutation<
    LeaveMockDraftMutation,
    LeaveMockDraftMutationVariables
  >(LEAVE_MOCK_DRAFT);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      if (draftId == null) return;
      setError(null);
      try {
        await fn();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong';
        setError(message);
        LOGGER.warn(`[MockDraftLobby] ${label} failed`, { draftId, err });
      }
    },
    [draftId],
  );

  const handleStart = useCallback(() => {
    if (draftId == null) return;
    setStarting(true);
    void run('startMockDraft', async () => {
      await startMockDraft({ variables: { draftId } });
      onChanged();
    }).finally(() => setStarting(false));
  }, [draftId, run, startMockDraft, onChanged]);

  const handleKick = useCallback(
    (participantId: number) => {
      if (draftId == null) return;
      void run('kickMockDraftSeat', async () => {
        await kickMockDraftSeat({ variables: { draftId, participantId } });
        onChanged();
      });
    },
    [draftId, run, kickMockDraftSeat, onChanged],
  );

  const handleToggleVisibility = useCallback(
    (isPublic: boolean) => {
      if (draftId == null) return;
      void run('updateMockDraftLobby', async () => {
        await updateMockDraftLobby({ variables: { draftId, isPublic } });
        onChanged();
      });
    },
    [draftId, run, updateMockDraftLobby, onChanged],
  );

  const handleLeave = useCallback(() => {
    if (draftId == null) return;
    void run('leaveMockDraft', async () => {
      await leaveMockDraft({ variables: { draftId } });
      onLeft();
    });
  }, [draftId, run, leaveMockDraft, onLeft]);

  return {
    error,
    starting,
    handleStart,
    handleKick,
    handleToggleVisibility,
    handleLeave,
  } as const;
}

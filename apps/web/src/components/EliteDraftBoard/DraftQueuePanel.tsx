import React, { useCallback } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  GetMyDraftQueue as GET_MY_DRAFT_QUEUE,
  type GetMyDraftQueueQuery,
  type GetMyDraftQueueQueryVariables,
  RemoveFromDraftQueue as REMOVE_FROM_DRAFT_QUEUE,
  ReorderDraftQueue as REORDER_DRAFT_QUEUE,
} from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// DraftQueuePanel
// Displays the user's prioritised draft queue with reorder and remove.
// Shown in the left sidebar during an active live draft.
// ---------------------------------------------------------------------------

interface DraftQueuePanelProps {
  draftId: number;
}

export function DraftQueuePanel({ draftId }: DraftQueuePanelProps) {
  const {
    data,
    loading,
    refetch: refetchQueue,
  } = useQuery<GetMyDraftQueueQuery, GetMyDraftQueueQueryVariables>(
    GET_MY_DRAFT_QUEUE,
    {
      variables: { draftId },
      skip: !draftId,
      fetchPolicy: 'cache-and-network',
    },
  );

  const entries = data?.getMyDraftQueue ?? [];

  const [removeFromQueue, { loading: removing }] = useMutation(
    REMOVE_FROM_DRAFT_QUEUE,
  );

  const [reorderQueue, { loading: reordering }] =
    useMutation(REORDER_DRAFT_QUEUE);

  const handleRemove = useCallback(
    async (playerId: number) => {
      try {
        await removeFromQueue({ variables: { draftId, playerId } });
        void refetchQueue();
      } catch {
        // silently ignore — optimistic UI not needed here
      }
    },
    [draftId, removeFromQueue, refetchQueue],
  );

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (index === 0) return;
      const reordered = [...entries];
      [reordered[index - 1], reordered[index]] = [
        reordered[index],
        reordered[index - 1],
      ];
      try {
        await reorderQueue({
          variables: {
            draftId,
            playerIds: reordered.map((e) => e.playerId ?? e.player?.id ?? 0),
          },
        });
        void refetchQueue();
      } catch {
        // ignore
      }
    },
    [draftId, entries, reorderQueue, refetchQueue],
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (index === entries.length - 1) return;
      const reordered = [...entries];
      [reordered[index], reordered[index + 1]] = [
        reordered[index + 1],
        reordered[index],
      ];
      try {
        await reorderQueue({
          variables: {
            draftId,
            playerIds: reordered.map((e) => e.playerId ?? e.player?.id ?? 0),
          },
        });
        void refetchQueue();
      } catch {
        // ignore
      }
    },
    [draftId, entries, reorderQueue, refetchQueue],
  );

  const busy = removing || reordering;

  return (
    <div className="d-panel d-queue-panel">
      <h3 className="d-panel-title a-orange" id="draft-queue-heading">
        <span role="img" aria-label="queue">
          📋
        </span>{' '}
        MY QUEUE ({entries.length})
      </h3>

      {loading && entries.length === 0 && (
        <div className="d-queue-empty">Loading queue…</div>
      )}

      {!loading && entries.length === 0 && (
        <div className="d-queue-empty">
          No players queued — add players from the list below
        </div>
      )}

      {entries.length > 0 && (
        <div
          role="list"
          aria-labelledby="draft-queue-heading"
          style={{ maxHeight: 220, overflowY: 'auto' }}
        >
          {entries.map((entry, idx) => {
            const name = entry.player
              ? `${entry.player.firstName} ${entry.player.lastName}`.trim()
              : `Player #${entry.playerId ?? '?'}`;

            return (
              <div
                key={entry.id}
                role="listitem"
                className="d-queue-row"
                aria-label={`Queue position ${idx + 1}: ${name}`}
              >
                {/* Priority rank */}
                <span className="d-queue-rank" aria-hidden="true">
                  {idx + 1}
                </span>

                {/* Player name */}
                <span className="d-queue-name">{name}</span>

                {/* Reorder + remove controls */}
                <span className="d-queue-actions" aria-label="Reorder controls">
                  <button
                    className="d-queue-btn"
                    onClick={() => void handleMoveUp(idx)}
                    disabled={busy || idx === 0}
                    aria-label={`Move ${name} up in queue`}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    className="d-queue-btn"
                    onClick={() => void handleMoveDown(idx)}
                    disabled={busy || idx === entries.length - 1}
                    aria-label={`Move ${name} down in queue`}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    className="d-queue-btn d-queue-remove"
                    onClick={() =>
                      void handleRemove(entry.playerId ?? entry.player?.id ?? 0)
                    }
                    disabled={busy}
                    aria-label={`Remove ${name} from queue`}
                    title="Remove from queue"
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <div className="d-queue-hint">
          Auto-pick will select from this queue first
        </div>
      )}
    </div>
  );
}

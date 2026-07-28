import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GetMyDraftQueue as GET_MY_DRAFT_QUEUE,
  type GetMyDraftQueueQuery,
  type GetMyDraftQueueQueryVariables,
  RemoveFromDraftQueue as REMOVE_FROM_DRAFT_QUEUE,
  ReorderDraftQueue as REORDER_DRAFT_QUEUE,
} from '@legacy-sports/graphql';

// ---------------------------------------------------------------------------
// DraftQueuePanel
// Displays the user's prioritised draft queue with drag-to-sort and remove.
// Shown in the right rail during an active live draft.
// ---------------------------------------------------------------------------

type QueueEntry = NonNullable<GetMyDraftQueueQuery['getMyDraftQueue']>[number];

interface DraftQueuePanelProps {
  draftId: number;
  autoPickDisabled?: boolean;
  onError?: (message: string) => void;
  /**
   * Whether the current user can view the draft queue. The server restricts
   * `getMyDraftQueue` to `permissionLevel === 'general_manager'` — when this
   * is false we skip the query entirely instead of firing it and discarding
   * the FORBIDDEN response, which had been surfacing as a noisy Rollbar
   * error (LS-4804). Defaults to true so existing call sites that already
   * gate on permission upstream keep working.
   */
  enabled?: boolean;
}

function entryKey(entry: QueueEntry): string {
  return String(entry.id ?? entry.playerId ?? entry.player?.id ?? '');
}

function entryName(entry: QueueEntry): string {
  return entry.player
    ? `${entry.player.firstName} ${entry.player.lastName}`.trim()
    : `Player #${entry.playerId ?? '?'}`;
}

interface SortableQueueRowProps {
  entry: QueueEntry;
  index: number;
  busy: boolean;
  onRemove: (playerId: number) => void;
}

function SortableQueueRow({
  entry,
  index,
  busy,
  onRemove,
}: SortableQueueRowProps) {
  const name = entryName(entry);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entryKey(entry), disabled: busy });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="listitem"
      className={`d-queue-row${isDragging ? ' dragging' : ''}`}
      aria-label={`Queue position ${index + 1}: ${name}`}
    >
      {/* Drag handle (LS-8786) */}
      <span
        className="d-queue-drag"
        aria-label={`Drag to reorder ${name}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </span>

      {/* Priority rank */}
      <span className="d-queue-rank" aria-hidden="true">
        {index + 1}
      </span>

      {/* Player name */}
      <span className="d-queue-name">{name}</span>

      {/* Remove control */}
      <span className="d-queue-actions" aria-label="Queue actions">
        <button
          className="d-queue-btn d-queue-remove"
          onClick={() => onRemove(entry.playerId ?? entry.player?.id ?? 0)}
          disabled={busy}
          aria-label={`Remove ${name} from queue`}
          title="Remove from queue"
        >
          ×
        </button>
      </span>
    </div>
  );
}

export function DraftQueuePanel({
  draftId,
  autoPickDisabled,
  onError,
  enabled = true,
}: DraftQueuePanelProps) {
  const {
    data,
    loading,
    error,
    refetch: refetchQueue,
  } = useQuery<GetMyDraftQueueQuery, GetMyDraftQueueQueryVariables>(
    GET_MY_DRAFT_QUEUE,
    {
      variables: { draftId },
      skip: !draftId || !enabled,
      fetchPolicy: 'cache-and-network',
      // Suppress global error toast — FORBIDDEN is handled below by returning
      // null; other errors are surfaced via onError instead.
      context: { suppressGlobalError: true },
    },
  );

  const entries = useMemo(() => data?.getMyDraftQueue ?? [], [data]);

  // Local order mirrors `entries` but is updated immediately on drag-end so
  // the reorder feels instant rather than waiting a network round-trip
  // (LS-8786). Reconciled back to the server-driven `entries` whenever the
  // query returns fresh data (including the post-mutation refetch below).
  const [localEntries, setLocalEntries] = useState<QueueEntry[]>(entries);
  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  const [removeFromQueue, { loading: removing }] = useMutation(
    REMOVE_FROM_DRAFT_QUEUE,
  );

  const [reorderQueue, { loading: reordering }] =
    useMutation(REORDER_DRAFT_QUEUE);

  const handleRemove = useCallback(
    async (playerId: number) => {
      try {
        await removeFromQueue({ variables: { draftId, playerId } });
      } catch {
        onError?.('Failed to remove player from queue. Please try again.');
      } finally {
        void refetchQueue();
      }
    },
    [draftId, removeFromQueue, refetchQueue, onError],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = localEntries.findIndex((e) => entryKey(e) === active.id);
      const newIndex = localEntries.findIndex((e) => entryKey(e) === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localEntries, oldIndex, newIndex);
      // Optimistic reorder — the queue-update mutation persists this order,
      // but the UI reflects it immediately rather than waiting for the
      // round-trip (AC2/AC3, LS-8786).
      setLocalEntries(reordered);
      void reorderQueue({
        variables: {
          draftId,
          playerIds: reordered.map((e) => e.playerId ?? e.player?.id ?? 0),
        },
      })
        .catch(() => {
          // Revert to the last known server order so the UI doesn't show a
          // reorder that never actually persisted.
          setLocalEntries(entries);
          onError?.('Failed to reorder queue. Please try again.');
        })
        .finally(() => {
          void refetchQueue();
        });
    },
    [draftId, localEntries, entries, reorderQueue, refetchQueue, onError],
  );

  // Non-GM users: parent should pass enabled={false} so the query never fires
  // (LS-4804). The FORBIDDEN error check remains as defense-in-depth in case a
  // caller forgets to gate, or league membership changes after mount.
  if (!enabled) return null;
  const gqlErrors =
    error != null && 'graphQLErrors' in error
      ? (error.graphQLErrors as ReadonlyArray<{
          extensions?: Record<string, unknown>;
        }>)
      : [];
  if (gqlErrors.some((e) => e.extensions?.['code'] === 'FORBIDDEN'))
    return null;

  const busy = removing || reordering;

  return (
    <div className="d-panel d-queue-panel" data-testid="draft-queue">
      <h3 className="d-panel-title a-orange" id="draft-queue-heading">
        <span role="img" aria-label="queue">
          📋
        </span>{' '}
        MY QUEUE ({localEntries.length})
      </h3>

      {loading && localEntries.length === 0 && (
        <div className="d-queue-empty">Loading queue…</div>
      )}

      {!loading && localEntries.length === 0 && (
        <div className="d-queue-empty">
          No players queued — add players from the list below
        </div>
      )}

      {localEntries.length > 0 && (
        <div
          role="list"
          aria-labelledby="draft-queue-heading"
          style={{ maxHeight: 220, overflowY: 'auto' }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localEntries.map(entryKey)}
              strategy={verticalListSortingStrategy}
            >
              {localEntries.map((entry, idx) => (
                <SortableQueueRow
                  key={entryKey(entry)}
                  entry={entry}
                  index={idx}
                  busy={busy}
                  onRemove={(playerId) => void handleRemove(playerId)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {localEntries.length > 0 && !autoPickDisabled && (
        <div className="d-queue-hint">
          Drag ⋮⋮ to reorder. Auto-pick will select from this queue first.
        </div>
      )}
    </div>
  );
}

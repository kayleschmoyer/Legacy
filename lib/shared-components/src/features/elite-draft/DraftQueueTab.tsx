/**
 * DraftQueueTab — Draft Room v2 (LS-9400) README "Queue tab". Displays the
 * user's prioritized draft queue with rank/badge/name/meta rows and
 * up/down-reorder + remove controls (the mobile equivalent of
 * DraftQueuePanel's drag-to-sort, which needs pointer drag gestures that
 * don't fit a touch-first compact layout). Auto-draft-on-clock-expiry
 * behavior (top un-drafted queued player, else best ADP) already lives in
 * useDraftTimer/useDraftActions server-side — this tab is display + reorder
 * only, no new auto-pick logic.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useMutation } from '@apollo/client/react';
import {
  type GetMyDraftQueueQuery,
  ReorderDraftQueue as REORDER_DRAFT_QUEUE,
} from '@legacy-sports/graphql';
import type { DraftPlayer } from './types';
import { PositionBadge } from '../../components/PositionBadge';
import type { SportKind } from '../../config/sports';

type QueueEntry = NonNullable<GetMyDraftQueueQuery['getMyDraftQueue']>[number];

function entryKey(entry: QueueEntry): string {
  return String(entry.id ?? entry.playerId ?? entry.player?.id ?? '');
}

function entryName(entry: QueueEntry): string {
  return entry.player
    ? `${entry.player.firstName} ${entry.player.lastName}`.trim()
    : `Player #${entry.playerId ?? '?'}`;
}

function entryPlayerId(entry: QueueEntry): number {
  return entry.playerId ?? entry.player?.id ?? 0;
}

interface QueueRowButtonProps {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

function QueueRowButton({
  label,
  disabled,
  danger,
  onPress,
  children,
}: QueueRowButtonProps): React.JSX.Element {
  return (
    <XStack
      role="button"
      tabIndex={disabled ? -1 : 0}
      accessibilityRole="button"
      aria-label={label}
      accessibilityLabel={label}
      aria-disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      width={32}
      height={32}
      borderRadius={8}
      borderWidth={1}
      borderColor="$outlineDefault"
      alignItems="center"
      justifyContent="center"
      opacity={disabled ? 0.5 : 1}
    >
      <Text
        fontSize={13}
        fontWeight="700"
        color={danger ? '$statusDangerFg' : '$fg3'}
      >
        {children}
      </Text>
    </XStack>
  );
}

export interface DraftQueueTabProps {
  draftId: number;
  entries: readonly QueueEntry[];
  statsLookup: Map<number, DraftPlayer>;
  sport: SportKind;
  /** Removes a player from the queue — wraps `useDraftActions().handleToggleQueue`. */
  onRemove: (playerId: number) => void;
  onError?: (message: string, error?: unknown) => void;
}

export function DraftQueueTab({
  draftId,
  entries,
  statsLookup,
  sport,
  onRemove,
  onError,
}: DraftQueueTabProps): React.JSX.Element {
  const [localEntries, setLocalEntries] =
    useState<readonly QueueEntry[]>(entries);
  const [reorderQueue, { loading: reordering }] =
    useMutation(REORDER_DRAFT_QUEUE);
  useEffect(() => {
    // A reorder in flight already owns localEntries optimistically — a
    // background refetch landing mid-mutation must not clobber it with a
    // (potentially stale) server order before the mutation resolves.
    if (reordering) return;
    setLocalEntries(entries);
  }, [entries, reordering]);

  const persistOrder = useCallback(
    (reordered: readonly QueueEntry[]) => {
      setLocalEntries(reordered);
      void reorderQueue({
        variables: {
          draftId,
          playerIds: reordered.map(entryPlayerId),
        },
      }).catch((error: unknown) => {
        setLocalEntries(entries);
        onError?.('Failed to reorder queue. Please try again.', error);
      });
    },
    [draftId, reorderQueue, entries, onError],
  );

  const handleMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= localEntries.length) return;
      const reordered = [...localEntries];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      persistOrder(reordered);
    },
    [localEntries, persistOrder],
  );

  return (
    <YStack flex={1} testID="draft-queue-tab">
      <XStack paddingHorizontal="$3" paddingTop={12} paddingBottom={8}>
        <Text
          fontFamily="$heading"
          fontSize={11}
          fontWeight="800"
          letterSpacing={2}
          textTransform="uppercase"
          color="$brandGold"
        >
          My Queue · {localEntries.length}
        </Text>
      </XStack>

      {localEntries.length === 0 ? (
        <YStack
          marginHorizontal="$3"
          borderWidth={1}
          borderStyle="dashed"
          borderColor="$outlineDefault"
          borderRadius={12}
          padding="$4"
        >
          <Text fontSize={12.5} color="$fg4">
            Star players from the list to queue them up. When your pick clock
            expires, the top queued player is drafted automatically.
          </Text>
        </YStack>
      ) : (
        <YStack paddingHorizontal="$3" gap={8}>
          {localEntries.map((entry, index) => {
            const playerId = entryPlayerId(entry);
            const player = statsLookup.get(playerId) ?? null;
            const name = entryName(entry);
            return (
              <XStack
                key={entryKey(entry)}
                alignItems="center"
                gap={9}
                backgroundColor="$surfaceCard"
                borderWidth={1}
                borderColor="$surfacePanelBorder"
                borderRadius={12}
                paddingVertical={9}
                paddingHorizontal={11}
              >
                <Text fontSize={12} fontWeight="800" color="$fg4" minWidth={16}>
                  {index + 1}
                </Text>
                {player && (
                  <PositionBadge
                    position={player.position}
                    sport={sport}
                    variant="solid"
                    fontSize={10}
                    borderRadius={5}
                  />
                )}
                <YStack flex={1} minWidth={0}>
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  {player?.ppg != null && (
                    <Text
                      fontSize={10}
                      color="$fg3"
                      numberOfLines={1}
                      marginTop={1}
                    >
                      PROJ {player.ppg.toFixed(1)}
                    </Text>
                  )}
                </YStack>
                <QueueRowButton
                  label={`Move ${name} up`}
                  disabled={reordering || index === 0}
                  onPress={() => handleMove(index, -1)}
                >
                  ▲
                </QueueRowButton>
                <QueueRowButton
                  label={`Move ${name} down`}
                  disabled={reordering || index === localEntries.length - 1}
                  onPress={() => handleMove(index, 1)}
                >
                  ▼
                </QueueRowButton>
                <QueueRowButton
                  label={`Remove ${name} from queue`}
                  disabled={false}
                  danger
                  onPress={() => onRemove(playerId)}
                >
                  ✕
                </QueueRowButton>
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}

export default DraftQueueTab;

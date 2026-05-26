import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  getPositionColors,
  isEligibleForSlot,
  POSITION_SLOT_ORDER,
} from './rosterUtils';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Platform-agnostic representation of a single matchup roster player. */
export interface MatchupPlayerData {
  /** Stable string identifier (from GraphQL). */
  id: string;
  /** League position slot this player is assigned to, or null if on the bench. */
  positionId: number | null;
  teamId: number;
  season: number | null;
  player: {
    firstName: string | null;
    lastName: string | null;
    eligiblePositions: string[] | null;
  } | null;
}

/** A single available position slot the user can assign a bench player to. */
export interface MatchupPositionOption {
  id: number;
  type: string;
}

export interface MatchupRosterEditorViewProps {
  /** All players for the user's team in this matchup. */
  players: readonly MatchupPlayerData[];
  /** Maps positionId → positionType label (e.g. 1 → "SP"). */
  positionMap: ReadonlyMap<number, string>;
  /** Sorted list of available positions for bench-player assignment. */
  positionOptions: readonly MatchupPositionOption[];
  /** Whether the lineup is locked (matchup currently in progress). */
  locked?: boolean;
  /** Whether a mutation is currently in flight. */
  mutating?: boolean;
  /**
   * Swap two players' position assignments.
   *
   * The semantics match the swap mutation:
   *   - player1 will be assigned to `newPosition1Id`
   *   - player2 will be assigned to `newPosition2Id`
   *
   * Typically called as:
   *   onSwapPositions(firstId, secondPlayer.positionId, secondId, firstPlayer.positionId)
   */
  onSwapPositions: (
    player1Id: string,
    newPosition1Id: number | null,
    player2Id: string,
    newPosition2Id: number | null,
  ) => Promise<void>;
  /**
   * Move a player to an explicit position slot, or to the bench when
   * `positionId` is null.
   */
  onMoveToPosition: (
    playerId: string,
    positionId: number | null,
  ) => Promise<void>;
  /**
   * Optional callback invoked when a mutation throws. When provided, the parent
   * is responsible for surfacing the failure to the user. The component still
   * logs the error via `LOGGER.error` regardless.
   *
   * On mutation failure, selection state is preserved so the user can retry
   * without re-selecting the player.
   */
  onMutationError?: (err: unknown) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * MatchupRosterEditorView — Purely presentational lineup editor for a matchup week.
 *
 * Manages local selection state and delegates data mutations to the caller via
 * `onSwapPositions` and `onMoveToPosition` callbacks. Intentionally contains no
 * GraphQL or platform-specific imports so it can be used on both web and mobile.
 */
export function MatchupRosterEditorView({
  players,
  positionMap,
  positionOptions,
  locked = false,
  mutating = false,
  onSwapPositions,
  onMoveToPosition,
  onMutationError,
}: MatchupRosterEditorViewProps): React.JSX.Element | null {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  // Run a mutation, clearing selection only on success. On failure, log the
  // error and forward it to the parent — selection is preserved so the user
  // can retry. Without this wrapper, a rejected promise would leave selection
  // stuck and the error silently swallowed by the surrounding `void`.
  const runMutation = useCallback(
    (mutation: () => Promise<void>): void => {
      void (async () => {
        try {
          await mutation();
          setSelectedPlayerId(null);
        } catch (err) {
          LOGGER.error('MatchupRosterEditorView mutation failed', err as Error);
          onMutationError?.(err);
        }
      })();
    },
    [onMutationError],
  );

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const playerName = useCallback(
    (p: MatchupPlayerData): string =>
      `${p.player?.firstName ?? ''} ${p.player?.lastName ?? ''}`.trim() ||
      `player ${p.id}`,
    [],
  );

  /** Position slots sorted in canonical display order (batters first, then pitchers). */
  const sortedSlots = useMemo(
    () =>
      [...positionOptions].sort(
        (a, b) =>
          (POSITION_SLOT_ORDER[a.type] ?? 99) -
          (POSITION_SLOT_ORDER[b.type] ?? 99),
      ),
    [positionOptions],
  );

  const bench = useMemo(
    () => players.filter((p) => p.positionId === null),
    [players],
  );

  /** Count of slots that currently have an assigned player. */
  const filledSlotCount = useMemo(
    () =>
      positionOptions.filter((slot) =>
        players.some((p) => p.positionId === slot.id),
      ).length,
    [positionOptions, players],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePlayerClick = useCallback(
    (player: MatchupPlayerData) => {
      if (mutating) return;

      if (!selectedPlayerId) {
        setSelectedPlayerId(player.id);
        setEligibilityError(null);
        return;
      }

      if (selectedPlayerId === player.id) {
        setSelectedPlayerId(null);
        setEligibilityError(null);
        return;
      }

      // Second tap — swap the two players' positions
      const first = selectedPlayer;
      if (!first) {
        setSelectedPlayerId(null);
        return;
      }

      // Eligibility check: each player must be eligible at the slot they'd
      // move into. Bench (null positionId) is always allowed.
      const firstNewSlotType = player.positionId
        ? (positionMap.get(player.positionId) ?? null)
        : null;
      const secondNewSlotType = first.positionId
        ? (positionMap.get(first.positionId) ?? null)
        : null;

      const firstEligible = isEligibleForSlot(
        first.player?.eligiblePositions ?? null,
        firstNewSlotType,
      );
      const secondEligible = isEligibleForSlot(
        player.player?.eligiblePositions ?? null,
        secondNewSlotType,
      );

      if (!firstEligible || !secondEligible) {
        const offender = !firstEligible ? first : player;
        const targetSlot = !firstEligible
          ? firstNewSlotType
          : secondNewSlotType;
        setEligibilityError(
          `${playerName(offender)} is not eligible for ${targetSlot}.`,
        );
        return;
      }

      setEligibilityError(null);
      runMutation(() =>
        onSwapPositions(
          first.id,
          player.positionId, // player1 takes player2's current slot
          player.id,
          first.positionId, // player2 takes player1's current slot
        ),
      );
    },
    [
      selectedPlayerId,
      selectedPlayer,
      mutating,
      onSwapPositions,
      positionMap,
      playerName,
      runMutation,
    ],
  );

  /**
   * Assign the currently-selected player to an empty slot.
   * Called when the user taps an empty slot row in the starters section.
   */
  const handleAssignToSlot = useCallback(
    (slotId: number, slotType: string) => {
      if (mutating || !selectedPlayer) return;
      if (
        !isEligibleForSlot(
          selectedPlayer.player?.eligiblePositions ?? null,
          slotType,
        )
      ) {
        setEligibilityError(
          `${playerName(selectedPlayer)} is not eligible for ${slotType}.`,
        );
        return;
      }
      setEligibilityError(null);
      runMutation(() => onMoveToPosition(selectedPlayer.id, slotId));
    },
    [mutating, selectedPlayer, onMoveToPosition, playerName, runMutation],
  );

  const handleMoveToBench = useCallback(
    (player: MatchupPlayerData) => {
      if (mutating) return;
      setEligibilityError(null);
      runMutation(() => onMoveToPosition(player.id, null));
    },
    [mutating, onMoveToPosition, runMutation],
  );

  const handleAssignPosition = useCallback(
    (player: MatchupPlayerData, positionId: number, positionType: string) => {
      if (mutating) return;
      if (
        !isEligibleForSlot(
          player.player?.eligiblePositions ?? null,
          positionType,
        )
      ) {
        setEligibilityError(
          `${playerName(player)} is not eligible for ${positionType}.`,
        );
        return;
      }
      setEligibilityError(null);
      runMutation(() => onMoveToPosition(player.id, positionId));
    },
    [mutating, onMoveToPosition, playerName, runMutation],
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Renders an empty slot row. Tappable when a player is currently selected. */
  const renderEmptySlot = (slot: MatchupPositionOption) => {
    const badge = getPositionColors(slot.type);
    const isIneligible =
      selectedPlayer !== null &&
      !isEligibleForSlot(
        selectedPlayer.player?.eligiblePositions ?? null,
        slot.type,
      );
    const canAssign = !locked && selectedPlayer !== null && !isIneligible;
    return (
      <XStack
        key={`empty-slot-${slot.id}`}
        paddingVertical="$2.5"
        paddingHorizontal="$3"
        opacity={canAssign ? 1 : 0.45}
        backgroundColor={canAssign ? '$green2' : undefined}
        borderRadius="$3"
        hoverStyle={
          canAssign
            ? { backgroundColor: '$green3', cursor: 'pointer' }
            : undefined
        }
        pressStyle={canAssign ? { scale: 0.99 } : undefined}
        animation="quick"
        onPress={
          canAssign ? () => handleAssignToSlot(slot.id, slot.type) : undefined
        }
        alignItems="center"
        gap="$2"
      >
        {/* Position badge */}
        <YStack
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor={badge.bg}
          justifyContent="center"
          alignItems="center"
          flexShrink={0}
        >
          <Text fontSize="$2" fontWeight="800" color={badge.text}>
            {slot.type}
          </Text>
        </YStack>

        {/* Empty label */}
        <YStack flex={1} minWidth={0}>
          <Text
            fontSize="$3"
            fontWeight="400"
            color="$gray8"
            fontStyle="italic"
          >
            Empty
          </Text>
        </YStack>

        {canAssign && (
          <Text fontSize="$1" color="$green10" fontWeight="600">
            Tap to assign
          </Text>
        )}
        {!locked && isIneligible && (
          <Text fontSize="$1" color="$red10" fontWeight="600">
            Not eligible
          </Text>
        )}
      </XStack>
    );
  };

  const renderPlayerCard = (
    player: MatchupPlayerData,
    section: 'starter' | 'bench',
  ) => {
    const posType = player.positionId
      ? positionMap.get(player.positionId)
      : null;
    const badge = getPositionColors(posType);
    const isSelected = selectedPlayerId === player.id;
    const isSwapTarget =
      selectedPlayerId !== null && selectedPlayerId !== player.id;
    // When this card is a potential swap target, check whether the swap would
    // be legal for both players before showing any "Tap to swap" affordance.
    let isIneligibleSwapTarget = false;
    if (isSwapTarget && selectedPlayer !== null) {
      const selectedNewSlotType = player.positionId
        ? (positionMap.get(player.positionId) ?? null)
        : null;
      const targetNewSlotType = selectedPlayer.positionId
        ? (positionMap.get(selectedPlayer.positionId) ?? null)
        : null;
      isIneligibleSwapTarget =
        !isEligibleForSlot(
          selectedPlayer.player?.eligiblePositions ?? null,
          selectedNewSlotType,
        ) ||
        !isEligibleForSlot(
          player.player?.eligiblePositions ?? null,
          targetNewSlotType,
        );
    }
    const playerName =
      `${player.player?.firstName ?? ''} ${player.player?.lastName ?? ''}`.trim();

    const rowTestId = `matchup-player-row-${player.id}`;
    // Tamagui drops `data-testid` on animated XStack with onPress in Chromium
    // (LS-4133, LS-4215). A plain div wrapper guarantees the attribute reaches
    // the real DOM and gives Playwright a clickable bounding box.
    // `testID` stays on XStack for native mobile.
    return (
      <div key={player.id} data-testid={rowTestId}>
        <XStack
          testID={rowTestId}
          paddingVertical="$2.5"
          paddingHorizontal="$3"
          backgroundColor={
            !locked && isSelected
              ? '$blue3'
              : !locked && isSwapTarget && !isIneligibleSwapTarget
                ? '$blue2'
                : undefined
          }
          borderWidth={!locked && isSelected ? 2 : 0}
          borderColor={!locked && isSelected ? '$blue8' : undefined}
          borderRadius="$3"
          opacity={isIneligibleSwapTarget ? 0.45 : undefined}
          hoverStyle={
            locked || isIneligibleSwapTarget
              ? undefined
              : {
                  backgroundColor: isSwapTarget ? '$blue2' : '$gray3',
                  cursor: 'pointer',
                }
          }
          pressStyle={
            locked || isIneligibleSwapTarget ? undefined : { scale: 0.99 }
          }
          animation="quick"
          onPress={locked ? undefined : () => handlePlayerClick(player)}
          alignItems="center"
          gap="$2"
        >
          {/* Position badge */}
          <YStack
            width={36}
            height={36}
            borderRadius={18}
            backgroundColor={badge.bg}
            justifyContent="center"
            alignItems="center"
            flexShrink={0}
          >
            <Text fontSize="$2" fontWeight="800" color={badge.text}>
              {posType ?? 'BN'}
            </Text>
          </YStack>

          {/* Player info */}
          <YStack flex={1} minWidth={0}>
            <Text
              fontSize="$3"
              fontWeight="600"
              color={isSelected ? '$yellow10' : '$gray12'}
              numberOfLines={1}
            >
              {playerName || '—'}
            </Text>
            <Text fontSize="$1" color="$gray10" numberOfLines={1}>
              {player.player?.eligiblePositions?.join(', ') ?? ''}
              {player.season ? ` • Season ${player.season}` : ''}
            </Text>
          </YStack>

          {/* Actions — shown only when this card is selected */}
          {!locked && isSelected && section === 'starter' && (
            <Button
              size="$2"
              theme="red"
              data-testid={`roster-bench-${player.id}`}
              onPress={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                handleMoveToBench(player);
              }}
              disabled={mutating}
            >
              Bench
            </Button>
          )}

          {!locked &&
            isSelected &&
            section === 'bench' &&
            positionOptions.length > 0 && (
              <XStack gap="$1" flexWrap="wrap" maxWidth={200}>
                {positionOptions.map((opt) => {
                  const eligible = isEligibleForSlot(
                    player.player?.eligiblePositions ?? null,
                    opt.type,
                  );
                  return (
                    <Button
                      key={opt.id}
                      size="$2"
                      backgroundColor={eligible ? '$blue8' : '$gray5'}
                      color="white"
                      data-testid={`roster-assign-${player.id}-${opt.id}`}
                      opacity={eligible ? 1 : 0.5}
                      pressStyle={
                        eligible ? { backgroundColor: '$blue10' } : undefined
                      }
                      hoverStyle={
                        eligible ? { backgroundColor: '$blue9' } : undefined
                      }
                      onPress={(e: { stopPropagation: () => void }) => {
                        e.stopPropagation();
                        handleAssignPosition(player, opt.id, opt.type);
                      }}
                      disabled={mutating || !eligible}
                    >
                      {opt.type}
                    </Button>
                  );
                })}
              </XStack>
            )}

          {!locked && isSwapTarget && !isIneligibleSwapTarget && (
            <Text fontSize="$1" color="$yellow10" fontWeight="600">
              Tap to swap
            </Text>
          )}
          {!locked && isIneligibleSwapTarget && (
            <Text fontSize="$1" color="$red10" fontWeight="600">
              Not eligible
            </Text>
          )}
        </XStack>
      </div>
    );
  };

  if (players.length === 0) return null;

  return (
    <Card
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor="$blue8"
      backgroundColor="$background"
    >
      {/* Header */}
      <XStack
        padding="$4"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
        backgroundColor="$blue2"
      >
        <XStack alignItems="center" gap="$2">
          <H4 color="$yellow10">{locked ? 'Current Lineup' : 'Edit Lineup'}</H4>
          <XStack
            paddingHorizontal="$2"
            paddingVertical="$0.5"
            borderRadius="$10"
            backgroundColor={locked ? '$orange3' : '$green3'}
          >
            <Text
              fontSize="$1"
              fontWeight="600"
              color={locked ? '$orange11' : '$green11'}
            >
              {locked ? 'Locked' : 'Unlocked'}
            </Text>
          </XStack>
        </XStack>

        {!locked && selectedPlayerId && (
          <Button
            size="$2"
            theme="alt2"
            data-testid="roster-cancel-selection"
            onPress={() => setSelectedPlayerId(null)}
          >
            Cancel
          </Button>
        )}
      </XStack>

      {/* Instructions */}
      <YStack
        paddingHorizontal="$4"
        paddingVertical="$2"
        backgroundColor="$blue2"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
      >
        <Text fontSize="$2" color="$gray11">
          {locked
            ? 'This matchup is in progress — your lineup is locked.'
            : selectedPlayerId
              ? 'Tap another player to swap positions, or use the action buttons.'
              : 'Tap a player to select them, then tap another to swap positions.'}
        </Text>
      </YStack>

      {/* Eligibility error banner */}
      {!locked && eligibilityError && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          backgroundColor="$red3"
          borderBottomWidth={1}
          borderBottomColor="$red6"
          alignItems="center"
          gap="$2"
        >
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$red11"
            data-testid="roster-eligibility-error"
            flex={1}
          >
            {eligibilityError}
          </Text>
          <Button
            size="$2"
            theme="alt2"
            data-testid="roster-eligibility-error-dismiss"
            onPress={() => setEligibilityError(null)}
          >
            Dismiss
          </Button>
        </XStack>
      )}

      {/* Mutation loading indicator */}
      {!locked && mutating && (
        <XStack padding="$2" justifyContent="center" backgroundColor="$blue2">
          <Spinner size="small" color="$blue8" />
          <Text marginLeft="$2" fontSize="$2" color="$yellow10">
            Updating lineup...
          </Text>
        </XStack>
      )}

      {/* Starters section — one row per league position slot */}
      <YStack>
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor="$blue2"
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor="$blue8"
          />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$yellow10"
            letterSpacing={0.3}
          >
            STARTERS ({filledSlotCount}/{sortedSlots.length})
          </Text>
        </XStack>
        <YStack>
          {sortedSlots.map((slot) => {
            const player =
              players.find((p) => p.positionId === slot.id) ?? null;
            return player
              ? renderPlayerCard(player, 'starter')
              : renderEmptySlot(slot);
          })}
        </YStack>
      </YStack>

      <Separator />

      {/* Bench section */}
      <YStack>
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor="$gray3"
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor="$gray8"
          />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$gray11"
            letterSpacing={0.3}
          >
            BENCH ({bench.length})
          </Text>
        </XStack>
        <YStack>
          {bench.length > 0 ? (
            bench.map((p) => renderPlayerCard(p, 'bench'))
          ) : (
            <YStack padding="$3" alignItems="center">
              <Text color="$gray9" fontSize="$2">
                No bench players
              </Text>
            </YStack>
          )}
        </YStack>
      </YStack>
    </Card>
  );
}

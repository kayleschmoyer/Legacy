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
}

// ── Position badge color helper (tamagui tokens only) ─────────────────────────

function getPositionColors(position: string | null | undefined): {
  bg: string;
  text: string;
} {
  if (!position) return { bg: '$gray4', text: '$gray11' };
  const pos = position.toUpperCase();
  if (pos === 'C') return { bg: '$amber3', text: '$amber11' };
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos))
    return { bg: '$blue3', text: '$blue11' };
  if (['LF', 'CF', 'RF', 'OF'].includes(pos))
    return { bg: '$green3', text: '$green11' };
  if (pos === 'SP') return { bg: '$amber6', text: '$amber12' };
  if (pos === 'RP') return { bg: '$red3', text: '$red11' };
  if (['DH', 'XDH', 'UT', 'UTIL'].includes(pos))
    return { bg: '$red7', text: '$red12' };
  return { bg: '$gray4', text: '$gray11' };
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
}: MatchupRosterEditorViewProps): React.JSX.Element | null {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const starters = useMemo(
    () => players.filter((p) => p.positionId !== null),
    [players],
  );

  const bench = useMemo(
    () => players.filter((p) => p.positionId === null),
    [players],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePlayerClick = useCallback(
    (player: MatchupPlayerData) => {
      if (mutating) return;

      if (!selectedPlayerId) {
        setSelectedPlayerId(player.id);
        return;
      }

      if (selectedPlayerId === player.id) {
        setSelectedPlayerId(null);
        return;
      }

      // Second tap — swap the two players' positions
      const first = selectedPlayer;
      if (!first) {
        setSelectedPlayerId(null);
        return;
      }

      void (async () => {
        await onSwapPositions(
          first.id,
          player.positionId, // player1 takes player2's current slot
          player.id,
          first.positionId, // player2 takes player1's current slot
        );
        setSelectedPlayerId(null);
      })();
    },
    [selectedPlayerId, selectedPlayer, mutating, onSwapPositions],
  );

  const handleMoveToBench = useCallback(
    (player: MatchupPlayerData) => {
      if (mutating) return;
      void (async () => {
        await onMoveToPosition(player.id, null);
        setSelectedPlayerId(null);
      })();
    },
    [mutating, onMoveToPosition],
  );

  const handleAssignPosition = useCallback(
    (player: MatchupPlayerData, positionId: number) => {
      if (mutating) return;
      void (async () => {
        await onMoveToPosition(player.id, positionId);
        setSelectedPlayerId(null);
      })();
    },
    [mutating, onMoveToPosition],
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

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
    const playerName =
      `${player.player?.firstName ?? ''} ${player.player?.lastName ?? ''}`.trim();

    return (
      <XStack
        key={player.id}
        paddingVertical="$2.5"
        paddingHorizontal="$3"
        backgroundColor={
          !locked && isSelected
            ? '$blue3'
            : !locked && isSwapTarget
              ? '$blue2'
              : undefined
        }
        borderWidth={!locked && isSelected ? 2 : 0}
        borderColor={!locked && isSelected ? '$blue8' : undefined}
        borderRadius="$3"
        hoverStyle={
          locked
            ? undefined
            : {
                backgroundColor: isSwapTarget ? '$blue2' : '$gray3',
                cursor: 'pointer',
              }
        }
        pressStyle={locked ? undefined : { scale: 0.99 }}
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
              {positionOptions.map((opt) => (
                <Button
                  key={opt.id}
                  size="$2"
                  backgroundColor="$blue8"
                  color="white"
                  pressStyle={{ backgroundColor: '$blue10' }}
                  hoverStyle={{ backgroundColor: '$blue9' }}
                  onPress={(e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    handleAssignPosition(player, opt.id);
                  }}
                  disabled={mutating}
                >
                  {opt.type}
                </Button>
              ))}
            </XStack>
          )}

        {!locked && isSwapTarget && (
          <Text fontSize="$1" color="$yellow10" fontWeight="600">
            Tap to swap
          </Text>
        )}
      </XStack>
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

      {/* Mutation loading indicator */}
      {!locked && mutating && (
        <XStack padding="$2" justifyContent="center" backgroundColor="$blue2">
          <Spinner size="small" color="$blue8" />
          <Text marginLeft="$2" fontSize="$2" color="$yellow10">
            Updating lineup...
          </Text>
        </XStack>
      )}

      {/* Starters section */}
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
            STARTERS ({starters.length})
          </Text>
        </XStack>
        <YStack>{starters.map((p) => renderPlayerCard(p, 'starter'))}</YStack>
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

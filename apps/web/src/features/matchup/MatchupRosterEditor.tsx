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
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';
import {
  useSwapMatchupPlayerPositions,
  useUpdateMatchupPlayerPosition,
} from '../../hooks/useMatchup';

// ── Position Badge Color Helper ────────────────────────────────────────────
const getPositionColors = (
  position: string | null | undefined,
): { bg: string; text: string } => {
  if (!position) return { bg: '$gray4', text: '$gray11' };
  const pos = position.toUpperCase();
  if (pos === 'C') return { bg: '$amber3', text: '$amber11' };
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos))
    return { bg: withAlpha(BRAND_NAVY_LIGHT, 0.18), text: BRAND_GOLD_LIGHT };
  if (['LF', 'CF', 'RF', 'OF'].includes(pos))
    return { bg: '$green3', text: '$green11' };
  if (pos === 'SP') return { bg: '$amber6', text: '$amber12' };
  if (pos === 'RP') return { bg: '$red3', text: '$red11' };
  if (['DH', 'XDH', 'UT', 'UTIL'].includes(pos))
    return { bg: '$red7', text: '$red12' };
  return { bg: '$gray4', text: '$gray11' };
};

export interface MatchupRosterEditorProps {
  matchup: MatchupFragment;
  userTeamId: number;
}

/**
 * MatchupRosterEditor — Inline roster editing when a matchup is scheduled.
 * Lets the user swap and reassign positions for their own team's matchup roster.
 */
export function MatchupRosterEditor({
  matchup,
  userTeamId,
}: MatchupRosterEditorProps) {
  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Helper to parse matchup player IDs (fragment uses string, mutations need number)
  const parseId = (id: string | null | undefined): number => {
    if (!id) return 0;
    return typeof id === 'string' ? parseInt(id, 10) : 0;
  };

  // ── Fetch data ──────────────────────────────────────────────────────────
  const matchupId =
    typeof matchup.id === 'string'
      ? parseInt(matchup.id, 10)
      : (matchup.id ?? 0);

  const leagueId = matchup.leagueId ?? 0;

  const {
    data: playersData,
    loading: playersLoading,
    refetch: refetchPlayers,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    skip: !matchupId,
  });

  const { data: positionsData } = useGetPositionsForLeagueQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const { updatePosition, loading: updateLoading } =
    useUpdateMatchupPlayerPosition();
  const { swapPositions, loading: swapLoading } =
    useSwapMatchupPlayerPositions();

  const mutating = updateLoading || swapLoading;

  // ── Derived data ────────────────────────────────────────────────────────
  const positionMap = useMemo(() => {
    const map = new Map<number, string>();
    positionsData?.leaguePositions?.forEach(
      (pos: { id?: string | number | null; positionType?: string | null }) => {
        if (pos.id && pos.positionType) {
          map.set(
            typeof pos.id === 'string' ? parseInt(pos.id, 10) : pos.id,
            pos.positionType,
          );
        }
      },
    );
    return map;
  }, [positionsData]);

  const positionOptions = useMemo(() => {
    return Array.from(positionMap.entries())
      .map(([id, type]) => ({ id, type }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [positionMap]);

  const myPlayers = useMemo(() => {
    if (!playersData?.getMatchupPlayers) return [];
    return playersData.getMatchupPlayers.filter(
      (mp: MatchupPlayerFragment) => mp.teamId === userTeamId,
    );
  }, [playersData, userTeamId]);

  const starters = useMemo(
    () => myPlayers.filter((p) => p.positionId !== null),
    [myPlayers],
  );

  const bench = useMemo(
    () => myPlayers.filter((p) => p.positionId === null),
    [myPlayers],
  );

  const selectedPlayer = useMemo(
    () => myPlayers.find((p) => p.id === selectedPlayerId) ?? null,
    [myPlayers, selectedPlayerId],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const handlePlayerClick = useCallback(
    (player: MatchupPlayerFragment) => {
      if (mutating) return;

      if (!selectedPlayerId) {
        // First selection — pick this player
        setSelectedPlayerId(player.id ?? null);
        return;
      }

      if (selectedPlayerId === player.id) {
        // Deselect
        setSelectedPlayerId(null);
        return;
      }

      // Second selection — swap positions between the two players
      const first = selectedPlayer;
      if (!first) {
        setSelectedPlayerId(null);
        return;
      }

      void (async () => {
        await swapPositions(
          parseId(first.id),
          player.positionId ?? null,
          parseId(player.id),
          first.positionId ?? null,
        );
        setSelectedPlayerId(null);
        await refetchPlayers();
      })();
    },
    [selectedPlayerId, selectedPlayer, mutating, swapPositions, refetchPlayers],
  );

  const handleMoveToBench = useCallback(
    (player: MatchupPlayerFragment) => {
      if (mutating) return;
      void (async () => {
        await updatePosition(parseId(player.id), null);
        setSelectedPlayerId(null);
        await refetchPlayers();
      })();
    },
    [mutating, updatePosition, refetchPlayers],
  );

  const handleAssignPosition = useCallback(
    (player: MatchupPlayerFragment, positionId: number) => {
      if (mutating) return;
      void (async () => {
        await updatePosition(parseId(player.id), positionId);
        setSelectedPlayerId(null);
        await refetchPlayers();
      })();
    },
    [mutating, updatePosition, refetchPlayers],
  );

  // ── Render helpers ──────────────────────────────────────────────────────
  const renderPlayerCard = (
    player: MatchupPlayerFragment,
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
          isSelected
            ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
            : isSwapTarget
              ? withAlpha(BRAND_NAVY_LIGHT, 0.06)
              : undefined
        }
        borderWidth={isSelected ? 2 : 0}
        borderColor={isSelected ? BRAND_NAVY_LIGHT : undefined}
        borderRadius="$3"
        hoverStyle={{
          backgroundColor: isSwapTarget
            ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
            : '$gray3',
          cursor: 'pointer',
        }}
        pressStyle={{ scale: 0.99 }}
        animation="quick"
        onPress={() => handlePlayerClick(player)}
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
            color={isSelected ? BRAND_GOLD_LIGHT : '$gray12'}
            numberOfLines={1}
          >
            {playerName || '—'}
          </Text>
          <Text fontSize="$1" color="$gray10" numberOfLines={1}>
            {player.player?.eligiblePositions?.join(', ') ?? ''}
            {player.season ? ` • Season ${player.season}` : ''}
          </Text>
        </YStack>

        {/* Actions */}
        {isSelected && section === 'starter' && (
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

        {isSelected && section === 'bench' && positionOptions.length > 0 && (
          <XStack gap="$1" flexWrap="wrap" maxWidth={200}>
            {positionOptions.map((opt) => (
              <Button
                key={opt.id}
                size="$2"
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                hoverStyle={{ backgroundColor: BRAND_NAVY }}
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

        {isSwapTarget && (
          <Text fontSize="$1" color={BRAND_GOLD_LIGHT} fontWeight="600">
            Tap to swap
          </Text>
        )}
      </XStack>
    );
  };

  // ── Loading / not editable states ───────────────────────────────────────
  if (matchup.status !== MatchupStatus.Scheduled) {
    return null; // Not editable — the comparison view is sufficient
  }

  if (playersLoading) {
    return (
      <Card
        padding="$4"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$background"
        borderRadius="$6"
      >
        <XStack alignItems="center" gap="$2">
          <Spinner size="small" color={BRAND_NAVY_LIGHT} />
          <Text color="$gray11">Loading roster...</Text>
        </XStack>
      </Card>
    );
  }

  if (myPlayers.length === 0) {
    return null;
  }

  return (
    <Card
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor={BRAND_NAVY_LIGHT}
      backgroundColor="$background"
    >
      {/* Header */}
      <XStack
        padding="$4"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$surfacePanelBorder"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
      >
        <XStack alignItems="center" gap="$2">
          <H4 color={BRAND_GOLD_LIGHT}>Edit Lineup</H4>
          <XStack
            paddingHorizontal="$2"
            paddingVertical="$0.5"
            borderRadius="$10"
            backgroundColor="$green3"
          >
            <Text fontSize="$1" fontWeight="600" color="$green11">
              Unlocked
            </Text>
          </XStack>
        </XStack>

        {selectedPlayerId && (
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
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
        borderBottomWidth={1}
        borderBottomColor="$gray4"
      >
        <Text fontSize="$2" color="$gray11">
          {selectedPlayerId
            ? 'Tap another player to swap positions, or use the action buttons.'
            : 'Tap a player to select them, then tap another to swap positions.'}
        </Text>
      </YStack>

      {mutating && (
        <XStack
          padding="$2"
          justifyContent="center"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        >
          <Spinner size="small" color={BRAND_NAVY_LIGHT} />
          <Text marginLeft="$2" fontSize="$2" color={BRAND_GOLD_LIGHT}>
            Updating lineup...
          </Text>
        </XStack>
      )}

      {/* Starters */}
      <YStack>
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor={BRAND_NAVY_LIGHT}
          />
          <Text
            fontSize="$2"
            fontWeight="700"
            color={BRAND_GOLD_LIGHT}
            letterSpacing={0.3}
          >
            STARTERS ({starters.length})
          </Text>
        </XStack>
        <YStack>{starters.map((p) => renderPlayerCard(p, 'starter'))}</YStack>
      </YStack>

      <Separator />

      {/* Bench */}
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

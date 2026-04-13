import React, { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  isStatsLoading,
  type MatchupPlayerData,
  MatchupRosterEditorView,
  POSITION_SLOT_ORDER,
} from '@legacy-sports/shared-components';
import {
  MatchupStatus,
  type StatsLoadingStatus,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
  useSwapMatchupPlayerPositionsMutation,
  useUpdateMatchupPlayerPositionMutation,
} from '../../../api/db/graphql.generated';

const parseId = (id: string | null | undefined): number | null => {
  if (!id) return null;
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export interface MatchupRosterEditorProps {
  matchupId: number;
  leagueId: number;
  userTeamId: number;
  matchupStatus: MatchupStatus;
  statsLoadingStatus?: StatsLoadingStatus | null;
  locked?: boolean;
}

/**
 * MatchupRosterEditor — Mobile data-fetching wrapper for the shared
 * MatchupRosterEditorView. Mirrors the web wrapper pattern: loads players +
 * positions, wires mutations, and normalises data to the shared interface.
 */
export function MatchupRosterEditor({
  matchupId,
  leagueId,
  userTeamId,
  matchupStatus,
  statsLoadingStatus,
  locked = false,
}: MatchupRosterEditorProps) {
  const {
    data: playersData,
    loading: playersLoading,
    error: playersError,
    refetch: refetchPlayers,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    skip: !matchupId,
  });

  const { data: positionsData } = useGetPositionsForLeagueQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const [updatePositionMutation, { loading: updateLoading }] =
    useUpdateMatchupPlayerPositionMutation();
  const [swapPositionsMutation, { loading: swapLoading }] =
    useSwapMatchupPlayerPositionsMutation();

  const mutating = updateLoading || swapLoading;

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

  const positionOptions = useMemo(
    () =>
      Array.from(positionMap.entries())
        .map(([id, type]) => ({ id, type }))
        .sort(
          (a, b) =>
            (POSITION_SLOT_ORDER[a.type] ?? 99) -
            (POSITION_SLOT_ORDER[b.type] ?? 99),
        ),
    [positionMap],
  );

  const players = useMemo((): MatchupPlayerData[] => {
    if (!playersData?.getMatchupPlayers) return [];
    return playersData.getMatchupPlayers
      .filter(
        (mp: { id?: string | null; teamId?: number | null }) =>
          mp.teamId === userTeamId && mp.id != null && mp.id !== '',
      )
      .map(
        (mp: {
          id?: string | null;
          positionId?: number | null;
          teamId?: number | null;
          season?: number | null;
          player?: {
            firstName?: string | null;
            lastName?: string | null;
            eligiblePositions?: string[] | null;
          } | null;
        }): MatchupPlayerData => ({
          id: mp.id ?? '',
          positionId: mp.positionId ?? null,
          teamId: mp.teamId ?? 0,
          season: mp.season ?? null,
          player: mp.player
            ? {
                firstName: mp.player.firstName ?? null,
                lastName: mp.player.lastName ?? null,
                eligiblePositions: mp.player.eligiblePositions ?? null,
              }
            : null,
        }),
      );
  }, [playersData, userTeamId]);

  const handleSwapPositions = useCallback(
    async (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => {
      const idA = parseId(player1Id);
      const idB = parseId(player2Id);
      if (idA == null || idB == null) {
        LOGGER.warn('swap-positions: invalid player id', {
          player1Id,
          player2Id,
        });
        return;
      }
      try {
        await swapPositionsMutation({
          variables: {
            matchupPlayerIdA: idA,
            positionIdA: newPosition1Id,
            matchupPlayerIdB: idB,
            positionIdB: newPosition2Id,
          },
        });
        await refetchPlayers();
      } catch (err) {
        LOGGER.error('Failed to swap positions', { err });
        Alert.alert('Error', 'Failed to swap positions. Please try again.');
      }
    },
    [swapPositionsMutation, refetchPlayers],
  );

  const handleMoveToPosition = useCallback(
    async (playerId: string, positionId: number | null) => {
      const id = parseId(playerId);
      if (id == null) {
        LOGGER.warn('move-to-position: invalid player id', { playerId });
        return;
      }
      try {
        await updatePositionMutation({
          variables: {
            matchupPlayerId: id,
            positionId,
          },
        });
        await refetchPlayers();
      } catch (err) {
        LOGGER.error('Failed to update position', { err });
        Alert.alert('Error', 'Failed to update position. Please try again.');
      }
    },
    [updatePositionMutation, refetchPlayers],
  );

  if (
    matchupStatus !== MatchupStatus.Scheduled &&
    matchupStatus !== MatchupStatus.InProgress
  ) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray10">
          Lineup editing is only available for scheduled or in-progress
          matchups.
        </Text>
      </YStack>
    );
  }

  if (playersError) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$red10">Error loading roster</Text>
        <Text color="$gray11" marginTop="$2">
          {playersError.message}
        </Text>
      </YStack>
    );
  }

  if (playersLoading || isStatsLoading(statsLoadingStatus)) {
    return (
      <XStack alignItems="center" justifyContent="center" padding="$4" gap="$2">
        <Spinner size="small" />
        <Text color="$gray11">Loading roster...</Text>
      </XStack>
    );
  }

  if (players.length === 0) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray10">No players found for your team.</Text>
      </YStack>
    );
  }

  return (
    <MatchupRosterEditorView
      players={players}
      positionMap={positionMap}
      positionOptions={positionOptions}
      locked={locked}
      mutating={mutating}
      onSwapPositions={handleSwapPositions}
      onMoveToPosition={handleMoveToPosition}
    />
  );
}

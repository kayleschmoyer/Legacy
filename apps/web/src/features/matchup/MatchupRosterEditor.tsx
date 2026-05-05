import React, { useCallback, useMemo } from 'react';
import { Card, Spinner, Text, XStack } from 'tamagui';
import {
  type MatchupPlayerData,
  MatchupRosterEditorView,
  POSITION_SLOT_ORDER,
} from '@legacy-sports/shared-components/roster';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';
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

// Helper to parse matchup player IDs (fragment uses string, mutations need number)
const parseId = (id: string | null | undefined): number => {
  if (!id) return 0;
  return typeof id === 'string' ? parseInt(id, 10) : 0;
};

export interface MatchupRosterEditorProps {
  matchup: MatchupFragment;
  userTeamId: number;
  /**
   * League ID sourced from the URL param — passed explicitly so the positions
   * query never falls back to `matchup.leagueId ?? 0` (which is nullable in the
   * generated GQL types and would silently skip the query, leaving STARTERS empty).
   */
  leagueId: number;
  /** When true the lineup is displayed read-only (e.g. matchup is in-progress). */
  locked?: boolean;
}

/**
 * MatchupRosterEditor — Data-fetching wrapper around the shared MatchupRosterEditorView.
 *
 * Responsible for loading matchup players + league positions via GraphQL, wiring
 * the swap/assign mutations, and passing normalised props to the shared presentational
 * component. All rendering and interaction state lives in MatchupRosterEditorView.
 */
export function MatchupRosterEditor({
  matchup,
  userTeamId,
  leagueId,
  locked = false,
}: MatchupRosterEditorProps) {
  // ── Fetch data ──────────────────────────────────────────────────────────
  const matchupId =
    typeof matchup.id === 'string'
      ? parseInt(matchup.id, 10)
      : (matchup.id ?? 0);

  const {
    data: playersData,
    loading: playersLoading,
    refetch: refetchPlayers,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    skip: !matchupId,
  });

  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
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

  /** Normalise GraphQL fragments to the platform-agnostic MatchupPlayerData shape. */
  const players = useMemo((): MatchupPlayerData[] => {
    if (!playersData?.getMatchupPlayers) return [];
    return playersData.getMatchupPlayers
      .filter((mp: MatchupPlayerFragment) => mp.teamId === userTeamId)
      .map(
        (mp: MatchupPlayerFragment): MatchupPlayerData => ({
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

  // ── Mutation callbacks ──────────────────────────────────────────────────

  const handleSwapPositions = useCallback(
    async (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => {
      await swapPositions(
        parseId(player1Id),
        newPosition1Id,
        parseId(player2Id),
        newPosition2Id,
      );
      await refetchPlayers();
    },
    [swapPositions, refetchPlayers],
  );

  const handleMoveToPosition = useCallback(
    async (playerId: string, positionId: number | null) => {
      await updatePosition(parseId(playerId), positionId);
      await refetchPlayers();
    },
    [updatePosition, refetchPlayers],
  );

  // ── Guard states ────────────────────────────────────────────────────────

  if (
    matchup.status !== MatchupStatus.Scheduled &&
    matchup.status !== MatchupStatus.InProgress
  ) {
    return null;
  }

  if (playersLoading || positionsLoading) {
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

  if (players.length === 0) {
    return null;
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

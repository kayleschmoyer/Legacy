import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Card, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type MatchupPlayerData,
  MatchupRosterEditorView,
  POSITION_SLOT_ORDER,
} from '@legacy-sports/shared-components/roster';
import { LOGGER } from '@legacy-sports/logging';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  Sport,
  useGetMatchupByIdLazyQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { PremiumGate } from '../../components/PremiumGate';
import {
  BRAND_GOLD,
  BRAND_GOLD_PRESS,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  TEXT_ON_GOLD,
} from '../../constants/colors';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import {
  useSetOptimalLineup,
  useSwapMatchupPlayerPositions,
  useUpdateMatchupPlayerPosition,
} from '../../hooks/useMatchup';

// Helper to parse matchup player IDs (fragment uses string, mutations need number)
const parseId = (id: string | null | undefined): number => {
  if (!id) return 0;
  return typeof id === 'string' ? parseInt(id, 10) : 0;
};

/**
 * Max age (ms) of a confirmed-Scheduled pre-flight check before the next
 * swap/move re-verifies over the network (BMD-024). Within this window the
 * server-side check at mutation time remains the authoritative gate.
 */
const PREFLIGHT_CACHE_TTL_MS = 5_000;

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
  /**
   * League sport — gates the premium "Optimize My Lineup" one-click action
   * (LS-6378), which is football-only for now.
   */
  sport?: Sport;
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
  sport,
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
  const { optimizeLineup, loading: optimizeLoading } = useSetOptimalLineup();

  const mutating = updateLoading || swapLoading || optimizeLoading;

  // ── Optimize My Lineup (LS-6378) ───────────────────────────────────────
  // Football-only premium one-click action: sets starters to the
  // combination of rostered players that maximizes total projected points.
  const hasOptimalLineup = useHasEntitlement(ENTITLEMENTS.optimal_lineup);
  const showOptimizer = sport === Sport.Football;

  const [fetchMatchupStatus] = useGetMatchupByIdLazyQuery({
    fetchPolicy: 'network-only',
  });
  // Tracks whether a pre-flight check revealed the matchup is no longer Scheduled.
  const [lockDiscovered, setLockDiscovered] = useState(false);
  // Timestamp (ms) of the last pre-flight check that confirmed Scheduled;
  // 0 until the first check. Skips redundant network round-trips within
  // PREFLIGHT_CACHE_TTL_MS of a confirmed-fresh check.
  const lastVerifiedScheduledAtRef = useRef(0);

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

  // effectiveLocked merges the external prop with any lock discovered via
  // server-side pre-flight check. The ref lets async callbacks always observe
  // the latest value without stale-closure risk.
  const effectiveLocked = locked || lockDiscovered;
  const lockedRef = useRef(effectiveLocked);
  useEffect(() => {
    lockedRef.current = effectiveLocked;
  }, [effectiveLocked]);

  // Pre-flight check shared by swap/move: verifies the matchup is still
  // Scheduled before mutating. Skips the network round-trip when the last
  // confirmed-Scheduled check is still within PREFLIGHT_CACHE_TTL_MS — the
  // server enforces the authoritative lock check at mutation time regardless.
  const ensureMatchupStillScheduled =
    useCallback(async (): Promise<boolean> => {
      const cacheIsFresh =
        Date.now() - lastVerifiedScheduledAtRef.current <
        PREFLIGHT_CACHE_TTL_MS;
      if (cacheIsFresh) return true;
      try {
        const { data } = await fetchMatchupStatus({
          variables: { id: matchupId },
        });
        if (data?.getMatchupById?.status !== MatchupStatus.Scheduled) {
          setLockDiscovered(true);
          return false;
        }
        lastVerifiedScheduledAtRef.current = Date.now();
        return true;
      } catch (error) {
        LOGGER.error(
          'Failed to fetch matchup status before roster mutation',
          error instanceof Error ? error : String(error),
        );
        setLockDiscovered(true);
        return false;
      }
    }, [fetchMatchupStatus, matchupId]);

  const handleSwapPositions = useCallback(
    async (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => {
      if (lockedRef.current) return;
      if (!(await ensureMatchupStillScheduled())) return;
      try {
        await swapPositions(
          parseId(player1Id),
          newPosition1Id,
          parseId(player2Id),
          newPosition2Id,
        );
        await refetchPlayers();
      } catch (error) {
        LOGGER.error(
          'Failed to swap matchup player positions',
          error instanceof Error ? error : String(error),
        );
      }
    },
    [swapPositions, refetchPlayers, ensureMatchupStillScheduled],
  );

  const handleMoveToPosition = useCallback(
    async (playerId: string, positionId: number | null) => {
      if (lockedRef.current) return;
      if (!(await ensureMatchupStillScheduled())) return;
      try {
        await updatePosition(parseId(playerId), positionId);
        await refetchPlayers();
      } catch (error) {
        LOGGER.error(
          'Failed to update matchup player position',
          error instanceof Error ? error : String(error),
        );
      }
    },
    [updatePosition, refetchPlayers, ensureMatchupStillScheduled],
  );

  const handleOptimizeLineup = useCallback(async () => {
    if (lockedRef.current) return;
    if (!(await ensureMatchupStillScheduled())) return;
    try {
      await optimizeLineup(matchupId, userTeamId);
      await refetchPlayers();
    } catch (error) {
      LOGGER.error(
        'Failed to optimize matchup lineup',
        error instanceof Error ? error : String(error),
      );
    }
  }, [
    optimizeLineup,
    matchupId,
    userTeamId,
    refetchPlayers,
    ensureMatchupStillScheduled,
  ]);

  const handleRetry = useCallback(async () => {
    try {
      await refetchPlayers();
    } catch (error) {
      LOGGER.error(
        'Failed to refetch matchup players on retry',
        error instanceof Error ? error : String(error),
      );
    }
  }, [refetchPlayers]);

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
    return (
      <Card
        padding="$4"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$background"
        borderRadius="$6"
      >
        <YStack alignItems="center" gap="$3">
          <Text color="$gray11" textAlign="center">
            No roster found for this matchup. Contact your commissioner.
          </Text>
          <Button
            backgroundColor={BRAND_NAVY_LIGHT}
            color="white"
            pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
            hoverStyle={{ backgroundColor: BRAND_NAVY }}
            onPress={handleRetry}
          >
            Retry
          </Button>
        </YStack>
      </Card>
    );
  }

  return (
    <YStack gap="$3">
      {showOptimizer && !effectiveLocked && (
        <XStack justifyContent="flex-end">
          {hasOptimalLineup ? (
            <Button
              size="$3"
              backgroundColor={BRAND_GOLD}
              color={TEXT_ON_GOLD}
              pressStyle={{ backgroundColor: BRAND_GOLD_PRESS }}
              hoverStyle={{ backgroundColor: BRAND_GOLD_PRESS }}
              disabled={mutating}
              onPress={() => {
                void handleOptimizeLineup();
              }}
            >
              {optimizeLoading ? 'Optimizing…' : 'Optimize My Lineup'}
            </Button>
          ) : (
            <PremiumGate
              isPremium={false}
              featureName="Optimize My Lineup"
              featureDescription="One-click set your starters to the combination of rostered players that maximizes your projected points."
            >
              <Button size="$3" disabled>
                Optimize My Lineup
              </Button>
            </PremiumGate>
          )}
        </XStack>
      )}
      <MatchupRosterEditorView
        players={players}
        positionMap={positionMap}
        positionOptions={positionOptions}
        locked={effectiveLocked}
        mutating={mutating}
        onSwapPositions={handleSwapPositions}
        onMoveToPosition={handleMoveToPosition}
      />
    </YStack>
  );
}

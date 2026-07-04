import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RosterBoard,
  RosterStatusBanners,
  RosterWeekNavigation,
} from '@legacy-sports/shared-components/roster';
import { PendingTradeOfferBanner } from '@legacy-sports/shared-components';
import {
  type LeagueFragment,
  type LeaguePositionFragment,
  Sport,
  type TeamMemberFragment,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { Button, Text, YStack } from 'tamagui';
import { PendingWaiverClaims } from '../../../../features/roster';
import { Empty } from '../Shared';
import { I } from '../Icons';
import { PremiumGate } from '../../../../components/PremiumGate';
import { useHasEntitlement } from '../../../../hooks/useIsPremium';

export interface RosterTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
}

export const RosterTab: React.FC<RosterTabProps> = ({ league, myTeamId }) => {
  const navigate = useNavigate();
  const hasOptimalLineup = useHasEntitlement(ENTITLEMENTS.optimal_lineup);
  const { data: positionsData } = useGetPositionsForLeagueQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id,
  });
  const positions = (positionsData?.leaguePositions ??
    []) as readonly LeaguePositionFragment[];

  const {
    data: teamMembersData,
    loading,
    error,
    refetch,
  } = useGetTeamMembersQuery({
    variables: { teamId: myTeamId ?? 0 },
    skip: !myTeamId,
  });
  const teamPlayers = useMemo<readonly TeamMemberFragment[]>(
    () => (teamMembersData?.teamMembers ?? []) as readonly TeamMemberFragment[],
    [teamMembersData?.teamMembers],
  );

  const [updatePosition] = useUpdateTeamMemberPositionMutation();
  const [swapPositions] = useSwapTeamMemberPositionsMutation();

  const [inFlightPositionIds, setInFlightPositionIds] = useState<
    ReadonlySet<number>
  >(new Set());

  const addInFlight = useCallback((ids: number[]) => {
    setInFlightPositionIds((prev) => new Set([...prev, ...ids]));
  }, []);

  const removeInFlight = useCallback((ids: number[]) => {
    setInFlightPositionIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const handleAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (player.id == null || position.id == null) return;
      if (inFlightPositionIds.has(position.id)) return;
      addInFlight([position.id]);
      try {
        await updatePosition({
          variables: { teamMemberId: player.id, positionId: position.id },
        });
        await refetch();
      } catch (err) {
        LOGGER.error(
          'Failed to assign player to position',
          err instanceof Error ? err : undefined,
          {
            playerId: player.id,
            positionId: position.id,
          },
        );
      } finally {
        removeInFlight([position.id]);
      }
    },
    [updatePosition, refetch, inFlightPositionIds, addInFlight, removeInFlight],
  );

  const handleRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      if (position.id == null) return;
      if (inFlightPositionIds.has(position.id)) return;
      const occupant = teamPlayers.find((p) => p.positionId === position.id);
      if (!occupant?.id) return;
      addInFlight([position.id]);
      try {
        await updatePosition({
          variables: { teamMemberId: occupant.id, positionId: null },
        });
        await refetch();
      } catch (err) {
        LOGGER.error(
          'Failed to remove player from position',
          err instanceof Error ? err : undefined,
          {
            playerId: occupant.id,
            positionId: position.id,
          },
        );
      } finally {
        removeInFlight([position.id]);
      }
    },
    [
      updatePosition,
      refetch,
      teamPlayers,
      inFlightPositionIds,
      addInFlight,
      removeInFlight,
    ],
  );

  const handleSwap = useCallback(
    async (
      incoming: TeamMemberFragment,
      target: LeaguePositionFragment,
      displaced: TeamMemberFragment,
    ) => {
      if (incoming.id == null || displaced.id == null || target.id == null)
        return;
      const affectedIds = [target.id];
      if (incoming.positionId != null) affectedIds.push(incoming.positionId);
      if (affectedIds.some((id) => inFlightPositionIds.has(id))) return;
      addInFlight(affectedIds);
      try {
        await swapPositions({
          variables: {
            teamMemberIdA: incoming.id,
            positionIdA: target.id,
            teamMemberIdB: displaced.id,
            positionIdB: incoming.positionId ?? undefined,
          },
        });
        await refetch();
      } catch (err) {
        LOGGER.error(
          'Failed to swap player positions',
          err instanceof Error ? err : undefined,
          {
            incomingId: incoming.id,
            displacedId: displaced.id,
            positionId: target.id,
          },
        );
      } finally {
        removeInFlight(affectedIds);
      }
    },
    [swapPositions, refetch, inFlightPositionIds, addInFlight, removeInFlight],
  );

  const currentWeek = league.currentWeekNumber ?? 1;
  const totalMatchups = league.totalMatchups ?? currentWeek;
  const [week, setWeek] = useState<number>(currentWeek);
  const isPast = week < currentWeek;
  const isFuture = week > currentWeek;
  const isCurrent = week === currentWeek;

  if (!myTeamId) {
    return (
      <Empty
        icon={<I.Users size={32} />}
        title="No team yet"
        sub="Join this league to manage your roster."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RosterWeekNavigation
        week={week}
        currentWeek={currentWeek}
        totalWeeks={totalMatchups}
        onWeekChange={setWeek}
        onResetToCurrent={() => setWeek(currentWeek)}
      />

      <RosterStatusBanners isPast={isPast} isFuture={isFuture} />

      {isCurrent && league.id != null && (
        <PendingTradeOfferBanner
          teamId={myTeamId}
          onReview={() => navigate(`/baseball/league/${league.id}/trades`)}
        />
      )}

      {(isCurrent || isFuture) && (
        <PendingWaiverClaims teamId={myTeamId} compact={!isCurrent} />
      )}

      {isCurrent && (
        <PremiumGate
          isPremium={hasOptimalLineup}
          featureName="Optimal Lineup"
          featureDescription="Automatically set your best lineup before lock based on projections and optimizer."
        >
          <YStack gap="$2">
            <Text fontWeight="600" fontSize="$3">
              Optimal Lineup
            </Text>
            <Button size="$3" alignSelf="flex-start" disabled>
              Set Optimal Lineup
            </Button>
          </YStack>
        </PremiumGate>
      )}

      <RosterBoard<TeamMemberFragment, LeaguePositionFragment>
        positions={positions}
        teamPlayers={teamPlayers}
        onPlayerAssign={(player, position) => {
          void handleAssign(player, position);
        }}
        onPlayerRemove={(position) => {
          void handleRemove(position);
        }}
        onPlayerSwap={(incoming, target, displaced) => {
          void handleSwap(incoming, target, displaced);
        }}
        onPlayerPress={(player) => {
          const playerId = player.player?.id ?? player.playerId;
          if (playerId != null) {
            navigate(
              league.sport === Sport.Football
                ? `/football/players/${playerId}`
                : `/players/${playerId}`,
            );
          }
        }}
        loading={loading}
        error={error ?? null}
        readOnly={isPast || isFuture}
        disabledPositionIds={inFlightPositionIds}
      />
    </div>
  );
};

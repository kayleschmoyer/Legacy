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
import { PendingWaiverClaims } from '../../../../features/roster';
import { Empty } from '../Shared';
import { I } from '../Icons';

export interface RosterTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
}

export const RosterTab: React.FC<RosterTabProps> = ({ league, myTeamId }) => {
  const navigate = useNavigate();
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

  const handleAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (player.id == null || position.id == null) return;
      await updatePosition({
        variables: { teamMemberId: player.id, positionId: position.id },
      });
      await refetch();
    },
    [updatePosition, refetch],
  );

  const handleRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      const occupant = teamPlayers.find((p) => p.positionId === position.id);
      if (!occupant?.id) return;
      await updatePosition({
        variables: { teamMemberId: occupant.id, positionId: null },
      });
      await refetch();
    },
    [updatePosition, refetch, teamPlayers],
  );

  const handleSwap = useCallback(
    async (
      incoming: TeamMemberFragment,
      target: LeaguePositionFragment,
      displaced: TeamMemberFragment,
    ) => {
      if (incoming.id == null || displaced.id == null || target.id == null)
        return;
      await swapPositions({
        variables: {
          teamMemberIdA: incoming.id,
          positionIdA: target.id,
          teamMemberIdB: displaced.id,
          positionIdB: incoming.positionId ?? undefined,
        },
      });
      await refetch();
    },
    [swapPositions, refetch],
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

      {isCurrent && <PendingWaiverClaims teamId={myTeamId} />}

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
      />
    </div>
  );
};

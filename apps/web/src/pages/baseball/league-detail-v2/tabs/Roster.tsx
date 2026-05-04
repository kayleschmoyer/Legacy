import React, { useCallback, useMemo } from 'react';
import {
  type LeagueFragment,
  type LeaguePositionFragment,
  type TeamMemberFragment,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import { PendingWaiverClaims } from '../../../../features/roster';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { Empty, Section } from '../Shared';
import { I } from '../Icons';

export interface RosterTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
}

export const RosterTab: React.FC<RosterTabProps> = ({ league, myTeamId }) => {
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
          teamMemberIdB: displaced.id,
        },
      });
      await refetch();
    },
    [swapPositions, refetch],
  );

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
    <Section
      title="My Roster"
      sub={`${teamPlayers.length} of ${league.maxRosterSize ?? '?'} players · Lineup, bench, and free-agent moves`}
    >
      <PendingWaiverClaims teamId={myTeamId} />
      <LeagueRosterManagement
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
        loading={loading}
        error={error ?? null}
      />
    </Section>
  );
};

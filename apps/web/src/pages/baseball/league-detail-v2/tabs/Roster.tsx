import React, { useCallback, useMemo, useState } from 'react';
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
import { Banner, Empty } from '../Shared';
import { I } from '../Icons';

export interface RosterTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
}

const WeekChip: React.FC<{
  variant: 'active' | 'final' | 'pre';
  label: string;
}> = ({ variant, label }) => (
  <span
    className={`ls-chip ls-chip-${variant}`}
    style={{ fontSize: 9, padding: '3px 7px' }}
  >
    {label}
  </span>
);

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
      <div className="ls-week-nav">
        <div className="ls-week-nav-left">
          <button
            type="button"
            className="ls-navbtn"
            onClick={() => setWeek(Math.max(1, week - 1))}
            disabled={week === 1}
            aria-label="Previous week"
          >
            <I.ChevronLeft size={16} />
          </button>
          <div>
            <div
              className="ls-week-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              Week {week}
              {isCurrent && <WeekChip variant="active" label="Current" />}
              {isPast && <WeekChip variant="final" label="Frozen" />}
              {isFuture && <WeekChip variant="pre" label="Upcoming" />}
            </div>
          </div>
          <button
            type="button"
            className="ls-navbtn"
            onClick={() => setWeek(Math.min(totalMatchups, week + 1))}
            disabled={week >= totalMatchups}
            aria-label="Next week"
          >
            <I.ChevronRight size={16} />
          </button>
        </div>
        {!isCurrent && (
          <button
            type="button"
            className="ls-btn ls-btn-ghost sm"
            onClick={() => setWeek(currentWeek)}
          >
            Reset to Current
          </button>
        )}
      </div>

      {isPast && (
        <Banner
          kind="info"
          icon={<I.Lock size={18} />}
          title="Historical Mode"
          sub="This matchup is finalized. Lineup changes are locked for past weeks."
        />
      )}
      {isFuture && (
        <Banner
          kind="warning"
          icon={<I.Info size={18} />}
          title="Future Week — Provisional Lineup"
          sub="Changes you make will apply to this week and all future matchups until updated again."
        />
      )}

      {isCurrent && <PendingWaiverClaims teamId={myTeamId} />}

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
        readOnly={isPast}
        leagueId={league.id ?? undefined}
        minCareerGames={league.minCareerGames ?? undefined}
        minCareerSeasons={league.minCareerSeasons ?? undefined}
      />
    </div>
  );
};

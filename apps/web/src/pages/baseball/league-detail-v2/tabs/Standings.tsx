import React, { useMemo } from 'react';
import {
  PlayoffBracket,
  StandingsTable,
} from '@legacy-sports/shared-components';
import {
  type LeagueFragment,
  Sport,
  type TeamFragment,
  useGetLeagueStandingsQuery,
  useGetPlayoffBracketQuery,
} from '@legacy-sports/graphql';

export interface StandingsTabProps {
  league: LeagueFragment;
  teams: readonly TeamFragment[];
  myTeamId: number | null;
  onTeam: (teamId: number) => void;
}

export const StandingsTab: React.FC<StandingsTabProps> = ({
  league,
  teams,
  myTeamId,
  onTeam,
}) => {
  const isFootball = league.sport === Sport.Football;
  const { data: standingsData, loading: standingsLoading } =
    useGetLeagueStandingsQuery({
      variables: { leagueId: league.id ?? 0 },
      skip: !league.id,
      errorPolicy: 'all',
    });
  const standings = useMemo(
    () => standingsData?.getLeagueStandings ?? [],
    [standingsData?.getLeagueStandings],
  );

  const { data: bracketData } = useGetPlayoffBracketQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id || !league.playoffEnabled,
    errorPolicy: 'all',
  });

  // Fall back to unsorted team list when no standings exist yet.
  const standingsForTable = useMemo(() => {
    if (standings.length > 0) return standings;
    return teams
      .filter((t) => t.id != null)
      .map((t) => ({
        __typename: 'TeamStanding' as const,
        teamId: String(t.id),
        teamName: t.name ?? 'Team',
        primaryColor: t.primaryColor ?? null,
        secondaryColor: null,
        avatarUrl: null,
        wins: null,
        losses: null,
        ties: null,
        winPercentage: null,
        pointsFor: null,
        pointsAgainst: null,
        divisionId: null,
        divisionName: null,
      }));
  }, [standings, teams]);

  const showWaiverOrder = league.waiverEnabled === true;

  const waiverOrders = useMemo(() => {
    if (!showWaiverOrder) return undefined;
    const map: Record<string, number> = {};
    for (const team of teams) {
      if (team.id != null && team.waiverOrder != null) {
        map[String(team.id)] = team.waiverOrder;
      }
    }
    return map;
  }, [showWaiverOrder, teams]);

  const subtitle = standingsLoading
    ? 'Loading…'
    : isFootball
      ? `${standingsForTable.length} teams · Sorted by W, then PF`
      : `${standingsForTable.length} teams · Sorted by win percentage`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StandingsTable
        standings={standingsForTable}
        loading={standingsLoading}
        currentUserTeamId={myTeamId}
        onTeamPress={onTeam}
        getTeamUrl={(teamId) => `/baseball/teams/${teamId}`}
        title="League Standings"
        subtitle={subtitle}
        showWaiverOrder={showWaiverOrder}
        waiverOrders={waiverOrders}
      />

      {bracketData?.getPlayoffBracket ? (
        <PlayoffBracket bracket={bracketData.getPlayoffBracket} />
      ) : null}
    </div>
  );
};

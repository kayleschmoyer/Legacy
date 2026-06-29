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

  // Always run the bracket query — do NOT skip on !playoffEnabled. The
  // `league.playoffEnabled` field can be stale/null in the Apollo cache
  // when the league was just created via `createLeagueAndTeams` (whose
  // resolver returns playoffEnabled=null because LeagueService.createLeague
  // omits it from .returning()), so skipping the query here would hide an
  // existing bracket from the user. Render the section if a bracket exists
  // regardless of the flag (see the gate below).
  const { data: bracketData } = useGetPlayoffBracketQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id,
    errorPolicy: 'all',
  });

  // Feed the shared StandingsTable. When standings haven't been computed yet
  // (e.g. a freshly created league before any games), fall back to the team
  // list so members still see their teams instead of an empty table.
  const standingsForTable = useMemo(() => {
    if (standings.length > 0) return standings;
    return teams
      .filter((t) => t.id != null)
      .map((t) => ({
        __typename: 'TeamStanding' as const,
        teamId: t.id != null ? String(t.id) : null,
        teamName: t.name ?? 'Team',
        wins: null,
        losses: null,
        ties: null,
        winPercentage: null,
        pointsFor: null,
        pointsAgainst: null,
        avatarUrl: null,
        primaryColor: t.primaryColor ?? null,
        secondaryColor: null,
        divisionId: null,
      }));
  }, [standings, teams]);

  const teamCount = standingsForTable.length;
  const subtitle = standingsLoading
    ? 'Loading…'
    : isFootball
      ? `${teamCount} teams · Sorted by win percentage, then PF`
      : `${teamCount} teams · Sorted by win percentage`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StandingsTable
        standings={standingsForTable}
        loading={standingsLoading}
        currentUserTeamId={myTeamId}
        onTeamPress={onTeam}
        subtitle={subtitle}
      />

      {bracketData?.getPlayoffBracket ? (
        <PlayoffBracket bracket={bracketData.getPlayoffBracket} />
      ) : null}
    </div>
  );
};

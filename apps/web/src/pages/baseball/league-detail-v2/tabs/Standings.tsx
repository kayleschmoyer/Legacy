import React, { useMemo, useState } from 'react';
import {
  PlayoffBracket,
  StandingsTable,
} from '@legacy-sports/shared-components';
import {
  type LeagueFragment,
  Sport,
  type TeamFragment,
  useGetPlayoffBracketQuery,
} from '@legacy-sports/graphql';
import { useCurrentWeek } from '../../../../hooks/useMatchup';
import { useStandings } from '../../../../hooks/useStandings';

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
  const { currentWeek } = useCurrentWeek(league.id ?? null);

  // null = current (live) standings; a number pins the view to "as of Week N".
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const weekOptions = useMemo(
    () =>
      currentWeek != null && currentWeek > 0
        ? Array.from({ length: currentWeek }, (_, i) => i + 1)
        : [],
    [currentWeek],
  );

  const { standings, loading: standingsLoading } = useStandings(
    league.id,
    selectedWeek,
    { errorPolicy: 'all' },
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
        medianWins: null,
        medianLosses: null,
        medianTies: null,
        winPercentage: null,
        pointsFor: null,
        pointsAgainst: null,
        divisionId: null,
        divisionName: null,
      }));
  }, [standings, teams]);

  const showWaiverOrder = league.waiverEnabled === true;
  const showMedianRecord = league.medianGameEnabled === true;

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

  const asOfSuffix =
    selectedWeek != null ? ` · As of Week ${selectedWeek}` : '';
  const subtitle = standingsLoading
    ? 'Loading…'
    : isFootball
      ? `${standingsForTable.length} teams · Sorted by W, then PF${asOfSuffix}`
      : `${standingsForTable.length} teams · Sorted by win percentage${asOfSuffix}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {weekOptions.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <label htmlFor="standings-week-selector" style={{ fontSize: 13 }}>
            Standings as of
          </label>
          <select
            id="standings-week-selector"
            className="ls-select"
            aria-label="Select week for historical standings"
            value={selectedWeek ?? 'current'}
            onChange={(e) => {
              const { value } = e.target;
              setSelectedWeek(value === 'current' ? null : Number(value));
            }}
          >
            <option value="current">Current</option>
            {weekOptions.map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <StandingsTable
        standings={standingsForTable}
        loading={standingsLoading}
        currentUserTeamId={myTeamId}
        onTeamPress={onTeam}
        getTeamUrl={(teamId) =>
          `/${isFootball ? 'football' : 'baseball'}/teams/${teamId}`
        }
        title="League Standings"
        subtitle={subtitle}
        showWaiverOrder={showWaiverOrder}
        waiverOrders={waiverOrders}
        showMedianRecord={showMedianRecord}
      />

      {bracketData?.getPlayoffBracket ? (
        <PlayoffBracket bracket={bracketData.getPlayoffBracket} />
      ) : null}
    </div>
  );
};

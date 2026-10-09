import React, { useMemo, useState } from 'react';
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  describeStandingsSort,
  PlayoffBracket,
  StandingsTable,
} from '@legacy-sports/shared-components/matchup';
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

  // Mirrors the table's private sort state so the caption names the real order.
  const [sort, setSort] = useState({
    key: DEFAULT_SORT_KEY,
    direction: DEFAULT_SORT_DIRECTION,
  });

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

  // Show the bracket whenever one EXISTS — deliberately not gated on
  // `league.playoffEnabled` (LS-9901). That flag says whether playoffs will be
  // generated, not whether a bracket is already there: a commissioner who
  // turns playoffs off mid-season, or a league whose (nullable) flag resolves
  // to null, would otherwise lose an already-seeded bracket from the UI.
  // Gating on it also made the query depend on asynchronously refetched league
  // data — this page refetches the league on every WebSocket reconnect — so a
  // refetch blip could tear the query down and leave the section blank.
  //
  // `cache-and-network` because `getPlayoffBracket` legitimately resolves to
  // null before a bracket is created, and the default cache-first pins that
  // null (or any other incomplete cached result) for the rest of the browser
  // session: the section then never appears, even after remounting the tab,
  // because no further request is issued. Revalidating on mount also keeps
  // scores and the champion fresh as the bracket advances.
  const { data: bracketData, previousData: bracketPreviousData } =
    useGetPlayoffBracketQuery({
      variables: { leagueId: league.id ?? 0 },
      skip: !league.id,
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    });

  // `errorPolicy: 'all'` surfaces a transient error as `data: null`, so fall
  // back to the last good result rather than blanking a rendered bracket. No
  // mutation removes a bracket once created, so this cannot pin a bracket that
  // legitimately went away.
  const bracket =
    bracketData?.getPlayoffBracket ??
    bracketPreviousData?.getPlayoffBracket ??
    null;

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
    : `${standingsForTable.length} teams · ${describeStandingsSort(sort.key, sort.direction)}${asOfSuffix}`;

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
        onSortChange={(key, direction) => setSort({ key, direction })}
      />

      {bracket ? <PlayoffBracket bracket={bracket} /> : null}
    </div>
  );
};

import { useMemo, useState } from 'react';
import { Divider, Layout, Tab, TabBar, Text } from '@ui-kitten/components';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  computeAverageScoring,
  computeScoring,
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import { useGetMatchupStatsQuery } from '../../../../api/db/matchups/Matchups.generated';
import {
  useGetTeamByIdQuery,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/teams/Teams.generated';
import { LoadingPanel } from '../../../../common/components/LoadingPanel';
import {
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
} from '../../../../api/db/leagues/Leagues.generated';
import {
  isBatter,
  isBattingSlot,
  isPitcher,
  isPitchingSlot,
} from '../../../../common/temporary_models/Models';
import { LineupEditor } from '../../../../features/roster/LineupEditor';
import {
  LeaguePositionFragment,
  MatchupFragment,
  PositionSlot,
  TeamMemberFragment,
  TeamMemberWithPositionsFragment,
} from '../../../../api/db/graphql.generated';
import { handleError } from '../../../../common/utilities/ErrorHandler';

const TABS = Object.freeze(['Lineup', 'Rotation']);

interface TabContentProps {
  matchup: MatchupFragment | null | undefined;
  selectedTab: (typeof TABS)[number];
  rosterSlots: readonly (LeaguePositionFragment | null)[];
  onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment
  ) => void;
  onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  team: readonly (TeamMemberWithPositionsFragment | null)[];
}

function TabContent(props: TabContentProps): JSX.Element | null {
  const {
    team,
    onPlayerAdded,
    onPlayerMoved,
    matchup,
    onPlayerRemoved,
    selectedTab,
    rosterSlots,
  } = props;

  const { data: stats, loading: loadingStats } = useGetMatchupStatsQuery({
    skip: !matchup?.id,
    variables: {
      matchupId: matchup?.id || -1,
      withMatchupStats: true,
      withProjections: true,
    },
  });

  const pitchingSlots = useMemo(
    () => rosterSlots.filter(isPitchingSlot),
    [rosterSlots]
  );

  const lineupSlots = useMemo(
    () => rosterSlots.filter(isBattingSlot),
    [rosterSlots]
  );

  const hitters = useMemo(() => team.filter(isBatter), [team]);

  const pitchers = useMemo(() => team.filter(isPitcher), [team]);

  const hitterProjections = useMemo(() => {
    const result: Record<number, number> = {};

    if (loadingStats) {
      return result;
    }

    for (const hitter of hitters) {
      const proj = stats?.matchupPlayers?.nodes.find(
        (n) => n?.playerId === hitter.playerId
      );

      const value =
        computeAverageScoring(
          proj?.aggregateSeasonBattingByPlayerIdAndSeason,
          DEFAULT_BATTING_SCORING
        ) +
        computeAverageScoring(
          proj?.aggregateSeasonFieldingByPlayerIdAndSeason,
          DEFAULT_FIELDING_SCORING
        );

      result[hitter.playerId] = value * (matchup?.numberOfGames || 1);
    }
    return result;
  }, [stats, hitters, loadingStats, matchup]);

  const pitcherProjections = useMemo(() => {
    const result: Record<number, number> = {};

    if (loadingStats) {
      return result;
    }

    for (const pitcher of pitchers) {
      const proj = stats?.matchupPlayers?.nodes.find(
        (n) => n?.playerId === pitcher.playerId
      );

      const value = computeAverageScoring(
        proj?.aggregateSeasonPitchingByPlayerIdAndSeason,
        DEFAULT_PITCHING_SCORING
      );

      result[pitcher.playerId] = value;
    }
    return result;
  }, [stats, pitchers, loadingStats]);

  const hittersActual = useMemo(() => {
    const result: Record<number, number> = {};

    if (loadingStats) {
      return result;
    }

    for (const hitter of hitters) {
      const mp = stats?.matchupPlayers?.nodes.find(
        (n) => n?.playerId === hitter.playerId
      );

      let sum = computeScoring(mp?.matchupBatting, DEFAULT_BATTING_SCORING);

      const position = lineupSlots.find((l) => l.id === hitter.positionId);
      if (position?.positionType !== PositionSlot.Dh) {
        sum += computeScoring(mp?.matchupFielding, DEFAULT_FIELDING_SCORING);
      }

      result[hitter.playerId] = sum;
    }
    return result;
  }, [stats, hitters, loadingStats, lineupSlots]);

  const pitchersActual = useMemo(() => {
    const result: Record<number, number> = {};

    if (loadingStats) {
      return result;
    }

    for (const pitcher of pitchers) {
      const mp = stats?.matchupPlayers?.nodes.find(
        (n) => n?.playerId === pitcher.playerId
      );

      result[pitcher.playerId] = computeScoring(
        mp?.matchupPitching,
        DEFAULT_PITCHING_SCORING
      );
    }
    return result;
  }, [stats, pitchers, loadingStats]);

  switch (selectedTab) {
    case 'Lineup':
      return (
        <LineupEditor
          availableRosterSlots={lineupSlots}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          projections={hitterProjections}
          team={hitters}
          actual={hittersActual}
        />
      );
    case 'Rotation':
      return (
        <LineupEditor
          availableRosterSlots={pitchingSlots}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          projections={pitcherProjections}
          team={pitchers}
          actual={pitchersActual}
        />
      );
    default:
      return null;
  }
}

export default function Team(): JSX.Element {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();

  const { loading: loadingTeam, data: team } = useGetTeamByIdQuery({
    skip: isNaN(parseInt(teamId, 10)),
    variables: {
      teamId: parseInt(teamId, 10),
      withPositions: true,
    },
  });

  const { data: league, loading: loadingLeague } = useGetLeagueByIdQuery({
    skip: team?.team?.leagueId === undefined,
    variables: {
      id: team?.team?.leagueId || -1,
      withMatchup: true,
      withMembers: true,
      withTeams: true,
    },
  });

  const { loading: loadingPositions, data: positions } =
    useGetPositionsForLeagueQuery({
      skip: team?.team?.leagueId === undefined,
      variables: {
        leagueId: team?.team?.leagueId || -1,
      },
    });

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const [selectedTabIdx, setSelectedTabIdx] = useState(0);

  const onPlayerAdded = (
    player: TeamMemberFragment,
    positionSlot: LeaguePositionFragment
  ) => {
    // The slot is taken, cannot add the player
    if (
      team?.team?.teamMembers.nodes.some(
        (t) => t?.positionId === positionSlot.id
      )
    ) {
      return;
    }

    updateTeamMemberPosition({
      variables: {
        positionId: positionSlot.id,
        teamMemberId: player.id,
      },
    }).catch(handleError);
  };

  const onPlayerRemoved = (position: LeaguePositionFragment) => {
    const player = team?.team?.teamMembers.nodes.find(
      (t) => t?.positionId === position.id
    );

    if (!player) {
      return;
    }

    updateTeamMemberPosition({
      variables: {
        positionId: null,
        teamMemberId: player.id,
      },
    }).catch(handleError);
  };

  const onPlayerMoved = (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment
  ) => {
    updateTeamMemberPosition({
      variables: {
        positionId: playerTwo.positionId,
        teamMemberId: playerOne.id,
      },
    }).catch(handleError);

    updateTeamMemberPosition({
      variables: {
        positionId: playerOne.positionId,
        teamMemberId: playerTwo.id,
      },
    }).catch(handleError);
  };

  if (loadingTeam || loadingPositions || loadingLeague) {
    return <LoadingPanel />;
  }

  if (!team?.team) {
    return <Text status="danger">Could not load team</Text>;
  }

  if (!positions?.leaguePositions) {
    return <Text status="danger">Could not load positions for league</Text>;
  }

  return (
    <ScrollView data-testid="scrollview">
      <Layout data-testid="layout">
        <TabBar selectedIndex={selectedTabIdx} onSelect={setSelectedTabIdx}>
          {TABS.map((t) => (
            <Tab key={t} title={t} />
          ))}
        </TabBar>

        <Divider />
        <TabContent
          matchup={league?.league?.matchupByCurrentMatchup}
          team={team.team.teamMembers.nodes}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          selectedTab={TABS[selectedTabIdx]}
          rosterSlots={positions.leaguePositions.nodes}
        />
      </Layout>
    </ScrollView>
  );
}

export function TeamIdHeader(): JSX.Element {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { data: team } = useGetTeamByIdQuery({
    skip: isNaN(parseInt(teamId, 10)),
    variables: {
      teamId: parseInt(teamId, 10),
    },
  });

  return <Text>{team?.team?.name}</Text>;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-enum-comparison */
// Complex GraphQL type interactions and platform-specific API mismatches require architectural review
import { useMemo, useState } from 'react';
import { Separator, Tabs, Text, YStack } from 'tamagui';
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
  TeamMemberFragment,
} from '../../../../api/db/graphql.generated';
import { PositionSlot } from '../../../../common/temporary_models/Models';
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
  team: readonly (TeamMemberFragment | null)[];
}

function TabContent(props: TabContentProps): React.JSX.Element | null {
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

    if (loadingStats || !stats) {
      return result;
    }

    for (const hitter of hitters) {
      if (!hitter?.playerId) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proj = (stats as any)?.matchupPlayers?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => n?.playerId === hitter.playerId
      );

      const battingStats = proj?.aggregateSeasonBattingByPlayerIdAndSeason;
      const fieldingStats = proj?.aggregateSeasonFieldingByPlayerIdAndSeason;

      const value =
        computeAverageScoring(
          battingStats,
          DEFAULT_BATTING_SCORING
        ) +
        computeAverageScoring(
          fieldingStats,
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
      if (!pitcher?.playerId) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proj = (stats as any)?.matchupPlayers?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => n?.playerId === pitcher.playerId
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
      if (!hitter?.playerId) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mp = (stats as any)?.matchupPlayers?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => n?.playerId === hitter.playerId
      );

      let sum = computeScoring(mp?.matchupBatting, DEFAULT_BATTING_SCORING);

      const position = lineupSlots.find((l) => l?.id === hitter.positionId);
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
      if (!pitcher?.playerId) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mp = (stats as any)?.matchupPlayers?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => n?.playerId === pitcher.playerId
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

export default function Team(): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useLocalSearchParams();
  const teamId = params.teamId;

  const teamIdStr =
    typeof teamId === 'string'
      ? teamId
      : Array.isArray(teamId)
      ? teamId[0]
      : '';
  const numTeamId = parseInt(teamIdStr, 10);

  const { loading: loadingTeam, data: team } = useGetTeamByIdQuery({
    skip: isNaN(numTeamId),
    variables: {
      teamId: numTeamId,
      withPositions: true,
    },
  });

  // League data query removed as matchup feature not currently used
  const loadingLeague = false;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamMembers = (team as any)?.team?.teamMembers || [];
    if (
      teamMembers.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t?.positionId === positionSlot.id
      )
    ) {
      return;
    }

    if (!player.id) return;

    updateTeamMemberPosition({
      variables: {
        positionId: positionSlot.id,
        teamMemberId: player.id,
      },
    }).catch(handleError);
  };

  const onPlayerRemoved = (position: LeaguePositionFragment) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamMembers = (team as any)?.team?.teamMembers || [];
    const player = teamMembers.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t?.positionId === position.id
    );

    if (!player?.id) {
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
    if (!playerOne.id || !playerTwo.id) return;
    
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
    return <Text color="$red10">Could not load team</Text>;
  }

  if (!positions?.leaguePositions) {
    return <Text color="$red10">Could not load positions for league</Text>;
  }

  return (
    <ScrollView data-testid="scrollview">
      <YStack data-testid="layout">
        <Tabs
          value={TABS[selectedTabIdx]}
          onValueChange={(value) => {
            const index = TABS.indexOf(value);
            if (index !== -1) setSelectedTabIdx(index);
          }}
          orientation="horizontal"
        >
          <Tabs.List>
            {TABS.map((tab) => (
              <Tabs.Tab key={tab} value={tab}>
                <Text>{tab}</Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Separator />
        <TabContent
          matchup={null}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          team={(team as any)?.team?.teamMembers || []}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          selectedTab={TABS[selectedTabIdx]}
          rosterSlots={positions?.leaguePositions || []}
        />
      </YStack>
    </ScrollView>
  );
}

export function TeamIdHeader(): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useLocalSearchParams();
  const teamId = params.teamId;

  const teamIdStr =
    typeof teamId === 'string'
      ? teamId
      : Array.isArray(teamId)
      ? teamId[0]
      : '';
  const numTeamId = parseInt(teamIdStr, 10);

  const { data: team } = useGetTeamByIdQuery({
    skip: isNaN(numTeamId),
    variables: {
      teamId: numTeamId,
    },
  });

  return <Text>{team?.team?.name}</Text>;
}

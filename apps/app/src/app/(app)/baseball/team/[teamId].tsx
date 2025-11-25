/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-enum-comparison */
// Complex GraphQL type interactions and platform-specific API mismatches require architectural review
import { useMemo, useState } from 'react';
import { Separator, Tabs, Text, YStack } from 'tamagui';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useUpdateTeamMemberPositionMutation } from '../../../../api/db/teams/Teams.generated';
import { LoadingPanel } from '../../../../common/components/LoadingPanel';
import { useGetPositionsForLeagueQuery } from '../../../../api/db/leagues/Leagues.generated';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueTeamsQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdQuery,
} from '../../../../api/db/graphql.generated';
import {
  isBatter,
  isBattingSlot,
  isPitcher,
  isPitchingSlot,
} from '../../../../common/temporary_models/Models';
import { LineupEditor } from '../../../../features/roster/LineupEditor';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { useTeamMemberProjections } from '../../../../features/scoring/useTeamMemberProjections';

const TABS = Object.freeze(['Lineup', 'Rotation']);

interface TabContentProps {
  readonly selectedTab: (typeof TABS)[number];
  readonly rosterSlots: readonly (LeaguePositionFragment | null)[];
  readonly onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  readonly onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment,
  ) => void;
  readonly onPlayerRemoved: (position: LeaguePositionFragment) => void;
  readonly team: readonly (TeamMemberFragment | null)[];
  readonly isOwner: boolean;
  readonly projections: Record<number, number>;
  readonly actual: Record<number, number>;
}

function TabContent(props: TabContentProps): React.JSX.Element | null {
  const {
    team,
    onPlayerAdded,
    onPlayerMoved,
    onPlayerRemoved,
    selectedTab,
    rosterSlots,
    isOwner,
    projections,
    actual,
  } = props;

  const pitchingSlots = useMemo(
    () => rosterSlots.filter(isPitchingSlot),
    [rosterSlots],
  );

  const lineupSlots = useMemo(
    () => rosterSlots.filter(isBattingSlot),
    [rosterSlots],
  );

  const hitters = useMemo(() => team.filter(isBatter), [team]);

  const pitchers = useMemo(() => team.filter(isPitcher), [team]);

  // TODO: Uncomment when projections are actually used in the UI
  // const hitterProjections = useMemo(() => {
  //   const result: Record<number, number> = {};

  //   if (loadingStats || !stats) {
  //     return result;
  //   }

  //   for (const hitter of hitters) {
  //     if (!hitter?.playerId) continue;

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const proj = (stats as any)?.matchupPlayers?.find(
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       (n: any) => n?.playerId === hitter.playerId,
  //     );

  //     const battingStats = proj?.aggregateSeasonBattingByPlayerIdAndSeason;
  //     const fieldingStats = proj?.aggregateSeasonFieldingByPlayerIdAndSeason;

  //     const value =
  //       computeAverageScoring(battingStats, DEFAULT_BATTING_SCORING) +
  //       computeAverageScoring(fieldingStats, DEFAULT_FIELDING_SCORING);

  //     result[hitter.playerId] = value * (matchup?.numberOfGames || 1);
  //   }
  //   return result;
  // }, [stats, hitters, loadingStats, matchup]);

  // TODO: Uncomment when projections are actually used in the UI
  // const pitcherProjections = useMemo(() => {
  //   const result: Record<number, number> = {};

  //   if (loadingStats) {
  //     return result;
  //   }

  //   for (const pitcher of pitchers) {
  //     if (!pitcher?.playerId) continue;

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const proj = (stats as any)?.matchupPlayers?.find(
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       (n: any) => n?.playerId === pitcher.playerId,
  //     );

  //     const value = computeAverageScoring(
  //       proj?.aggregateSeasonPitchingByPlayerIdAndSeason,
  //       DEFAULT_PITCHING_SCORING,
  //     );

  //     result[pitcher.playerId] = value;
  //   }
  //   return result;
  // }, [stats, pitchers, loadingStats]);

  // TODO: Uncomment when actual stats are actually used in the UI
  // const hittersActual = useMemo(() => {
  //   const result: Record<number, number> = {};

  //   if (loadingStats) {
  //     return result;
  //   }

  //   for (const hitter of hitters) {
  //     if (!hitter?.playerId) continue;

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const mp = (stats as any)?.matchupPlayers?.find(
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       (n: any) => n?.playerId === hitter.playerId,
  //     );

  //     let sum = computeScoring(mp?.matchupBatting, battingSettings);

  //     const position = lineupSlots.find((l) => l?.id === hitter.positionId);
  //     if (position?.positionType !== PositionSlot.Dh) {
  //       sum += computeScoring(mp?.matchupFielding, fieldingSettings);
  //     }

  //     result[hitter.playerId] = sum;
  //   }
  //   return result;
  // }, [stats, hitters, loadingStats, lineupSlots]);

  // TODO: Uncomment when actual stats are actually used in the UI
  // const pitchersActual = useMemo(() => {
  //   const result: Record<number, number> = {};

  //   if (loadingStats) {
  //     return result;
  //   }

  //   for (const pitcher of pitchers) {
  //     if (!pitcher?.playerId) continue;

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const mp = (stats as any)?.matchupPlayers?.find(
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       (n: any) => n?.playerId === pitcher.playerId,
  //     );

  //     result[pitcher.playerId] = computeScoring(
  //       mp?.matchupPitching,
  //       DEFAULT_PITCHING_SCORING,
  //     );
  //   }
  //   return result;
  // }, [stats, pitchers, loadingStats]);

  const noOp = () => {
    // Placeholder function for future implementation
  };

  switch (selectedTab) {
    case 'Lineup':
      return (
        <LineupEditor
          availableRosterSlots={lineupSlots}
          onPlayerAdded={isOwner ? onPlayerAdded : noOp}
          onPlayerMoved={isOwner ? onPlayerMoved : noOp}
          onPlayerRemoved={isOwner ? onPlayerRemoved : noOp}
          projections={projections}
          team={hitters}
          actual={actual}
        />
      );
    case 'Rotation':
      return (
        <LineupEditor
          availableRosterSlots={pitchingSlots}
          onPlayerAdded={isOwner ? onPlayerAdded : noOp}
          onPlayerMoved={isOwner ? onPlayerMoved : noOp}
          onPlayerRemoved={isOwner ? onPlayerRemoved : noOp}
          projections={projections}
          team={pitchers}
          actual={actual}
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

  const { loading: loadingMembers, data: teamMembersData } =
    useGetTeamMembersQuery({
      skip: isNaN(numTeamId),
      variables: {
        teamId: numTeamId,
      },
    });

  const teamMembers = useMemo<TeamMemberFragment[]>(() => {
    const members = teamMembersData?.teamMembers ?? [];
    return members.filter(
      (member): member is TeamMemberFragment => member !== null,
    );
  }, [teamMembersData]);

  const leagueId = useMemo<number | null>(() => {
    const memberLeagueId = teamMembers.find(
      (member) => typeof member.leagueId === 'number',
    )?.leagueId;
    return typeof memberLeagueId === 'number' ? memberLeagueId : null;
  }, [teamMembers]);

  // Get user's team in this league to check ownership
  const { data: userTeamData } = useGetUserTeamIdQuery({
    skip: leagueId === null,
    variables: {
      leagueId: leagueId ?? -1,
    },
  });

  const isOwner = userTeamData?.userTeamId === numTeamId;

  // League data query removed as matchup feature not currently used
  const loadingLeague = false;

  const { loading: loadingPositions, data: positions } =
    useGetPositionsForLeagueQuery({
      skip: leagueId === null,
      variables: {
        leagueId: leagueId ?? -1,
      },
    });

  const {
    projections,
    loading: loadingProjections,
    error: projectionsError,
  } = useTeamMemberProjections(teamMembers, leagueId);

  const actualScores = useMemo<Record<number, number>>(() => ({}), []);

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const [selectedTabIdx, setSelectedTabIdx] = useState(0);

  const onPlayerAdded = (
    player: TeamMemberFragment,
    positionSlot: LeaguePositionFragment,
  ) => {
    const existing = teamMembers.find(
      (member) => member.positionId === positionSlot.id,
    );

    if (existing) {
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
    const member = teamMembers.find((t) => t.positionId === position.id);

    if (!member?.id) {
      return;
    }

    updateTeamMemberPosition({
      variables: {
        positionId: null,
        teamMemberId: member.id,
      },
    }).catch(handleError);
  };

  const onPlayerMoved = (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment,
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

  if (
    loadingMembers ||
    loadingPositions ||
    loadingLeague ||
    loadingProjections
  ) {
    return <LoadingPanel />;
  }

  if (projectionsError) {
    return (
      <Text color="$red10">
        Unable to load scoring data: {projectionsError.message}
      </Text>
    );
  }

  if (leagueId === null) {
    return <Text color="$red10">Could not determine league for team</Text>;
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
          team={teamMembers}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          selectedTab={TABS[selectedTabIdx]}
          rosterSlots={positions?.leaguePositions || []}
          isOwner={isOwner}
          projections={projections}
          actual={actualScores}
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

  const { data: teamMembersData } = useGetTeamMembersQuery({
    skip: isNaN(numTeamId),
    variables: {
      teamId: numTeamId,
    },
  });

  const leagueId = teamMembersData?.teamMembers?.[0]?.leagueId ?? null;

  const { data: leagueTeamsData } = useGetLeagueTeamsQuery({
    skip: leagueId === null,
    variables: {
      leagueId: leagueId ?? -1,
    },
  });

  const teamName = leagueTeamsData?.leagueTeams?.find(
    (team) => team?.id === numTeamId,
  )?.name;

  return <Text>{teamName ?? `Team ${numTeamId}`}</Text>;
}

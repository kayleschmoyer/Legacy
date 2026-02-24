/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-enum-comparison */
// Complex GraphQL type interactions and platform-specific API mismatches require architectural review
import { useMemo, useState } from 'react';
import { Separator, Tabs, Text, YStack } from 'tamagui';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { computeAverageScoring, computeScoring } from '@legacy-sports/scoring';
import { applyMultiplierGroups } from '../../../../common/scoring';
import { useGetMatchupStatsQuery } from '../../../../api/db/matchups/Matchups.generated';
import { useGetTeamByIdQuery } from '../../../../api/db/teams/Teams.generated';
import {
  useGetPositionsForLeagueQuery,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import { LoadingPanel } from '../../../../common/components/LoadingPanel';
import {
  LeaguePositionFragment,
  MatchupFragment,
  TeamMemberFragment,
  useGetLeagueScoringProfileQuery,
  useGetUserTeamIdQuery,
} from '../../../../api/db/graphql.generated';
import {
  isBatter,
  isBattingSlot,
  isPitcher,
  isPitchingSlot,
} from '../../../../common/temporary_models/Models';
import { LineupEditor } from '../../../../features/roster/LineupEditor';
import { PositionSlot } from '../../../../common/temporary_models/Models';
import { handleError } from '../../../../common/utilities/ErrorHandler';

const TABS = Object.freeze(['Lineup', 'Rotation']);

interface TabContentProps {
  matchup: MatchupFragment | null | undefined;
  selectedTab: (typeof TABS)[number];
  rosterSlots: readonly (LeaguePositionFragment | null)[];
  onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment,
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  team: readonly (TeamMemberFragment | null)[];
  isOwner: boolean;
  battingSettings: Partial<Record<string, number>>;
  fieldingSettings: Partial<Record<string, number>>;
  pitchingSettings: Partial<Record<string, number>>;
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
    isOwner,
    battingSettings,
    fieldingSettings,
    pitchingSettings,
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
    [rosterSlots],
  );

  const lineupSlots = useMemo(
    () => rosterSlots.filter(isBattingSlot),
    [rosterSlots],
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
        (n: any) => n?.playerId === hitter.playerId,
      );

      const battingStats = proj?.aggregateSeasonBattingByPlayerIdAndSeason;
      const fieldingStats = proj?.aggregateSeasonFieldingByPlayerIdAndSeason;

      const value =
        computeAverageScoring(battingStats, battingSettings) +
        computeAverageScoring(fieldingStats, fieldingSettings);

      result[hitter.playerId] = value * (matchup?.gamesPerMatchup || 1);
    }
    return result;
  }, [
    stats,
    hitters,
    loadingStats,
    matchup,
    battingSettings,
    fieldingSettings,
  ]);

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
        (n: any) => n?.playerId === pitcher.playerId,
      );

      const value = computeAverageScoring(
        proj?.aggregateSeasonPitchingByPlayerIdAndSeason,
        pitchingSettings,
      );

      // Determine number of games for this pitcher based on position type
      // SP uses spStartsPerMatchup, RP uses gamesPerMatchup
      const posSlot = pitchingSlots.find(
        (s) => s?.id != null && Number(s.id) === pitcher.positionId,
      );
      const pitcherGames =
        posSlot?.positionType === 'SP'
          ? (matchup?.spStartsPerMatchup ?? matchup?.gamesPerMatchup ?? 1)
          : (matchup?.gamesPerMatchup ?? 1);

      result[pitcher.playerId] = value * pitcherGames;
    }
    return result;
  }, [stats, pitchers, loadingStats, pitchingSettings, matchup, pitchingSlots]);

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
        (n: any) => n?.playerId === hitter.playerId,
      );

      let sum = computeScoring(mp?.matchupBatting, battingSettings);

      const position = lineupSlots.find((l) => l?.id === hitter.positionId);
      if (position?.positionType !== PositionSlot.Dh) {
        sum += computeScoring(mp?.matchupFielding, fieldingSettings);
      }

      result[hitter.playerId] = sum;
    }
    return result;
  }, [
    stats,
    hitters,
    loadingStats,
    lineupSlots,
    battingSettings,
    fieldingSettings,
  ]);

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
        (n: any) => n?.playerId === pitcher.playerId,
      );

      result[pitcher.playerId] = computeScoring(
        mp?.matchupPitching,
        pitchingSettings,
      );
    }
    return result;
  }, [stats, pitchers, loadingStats, pitchingSettings]);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noOp = () => {};

  switch (selectedTab) {
    case 'Lineup':
      return (
        <LineupEditor
          availableRosterSlots={lineupSlots}
          onPlayerAdded={isOwner ? onPlayerAdded : noOp}
          onPlayerMoved={isOwner ? onPlayerMoved : noOp}
          onPlayerRemoved={isOwner ? onPlayerRemoved : noOp}
          projections={hitterProjections}
          team={hitters}
          actual={hittersActual}
        />
      );
    case 'Rotation':
      return (
        <LineupEditor
          availableRosterSlots={pitchingSlots}
          onPlayerAdded={isOwner ? onPlayerAdded : noOp}
          onPlayerMoved={isOwner ? onPlayerMoved : noOp}
          onPlayerRemoved={isOwner ? onPlayerRemoved : noOp}
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

  // Get user's team in this league to check ownership
  const { data: userTeamData } = useGetUserTeamIdQuery({
    skip: team?.team?.leagueId === undefined,
    variables: {
      leagueId: team?.team?.leagueId || -1,
    },
  });

  const { data: scoringProfileData, loading: loadingScoringProfile } =
    useGetLeagueScoringProfileQuery({
      skip: team?.team?.leagueId === undefined,
      variables: {
        leagueId: team?.team?.leagueId || -1,
      },
    });

  const isOwner = userTeamData?.userTeamId === numTeamId;

  // League data query removed as matchup feature not currently used
  const loadingLeague = false;

  const { loading: loadingPositions, data: positions } =
    useGetPositionsForLeagueQuery({
      skip: team?.team?.leagueId === undefined,
      variables: {
        leagueId: team?.team?.leagueId || -1,
      },
    });

  const scoringSettings = useMemo(
    () =>
      applyMultiplierGroups(
        scoringProfileData?.leagueScoringProfile?.multiplierGroups,
      ),
    [scoringProfileData?.leagueScoringProfile?.multiplierGroups],
  );

  const battingSettings = scoringSettings.batting;
  const fieldingSettings = scoringSettings.fielding;
  const pitchingSettings = scoringSettings.pitching;

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const [selectedTabIdx, setSelectedTabIdx] = useState(0);

  const onPlayerAdded = (
    player: TeamMemberFragment,
    positionSlot: LeaguePositionFragment,
  ) => {
    // The slot is taken, cannot add the player
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamMembers = (team as any)?.team?.teamMembers || [];
    if (
      teamMembers.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t?.positionId === positionSlot.id,
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
      (t: any) => t?.positionId === position.id,
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
    loadingTeam ||
    loadingPositions ||
    loadingLeague ||
    loadingScoringProfile
  ) {
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
          isOwner={isOwner}
          battingSettings={battingSettings}
          fieldingSettings={fieldingSettings}
          pitchingSettings={pitchingSettings}
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

import { useMemo, useState } from 'react';
import { Button, Input, Label, Separator, Tabs, Text, YStack } from 'tamagui';
import { Alert, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { computeAverageScoring, computeScoring } from '@legacy-sports/scoring';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';
import { applyMultiplierGroups } from '../../../../common/scoring';
import { useGetMatchupStatsQuery } from '../../../../api/db/matchups/Matchups.generated';
import {
  LeaguePositionFragment,
  MatchupFragment,
  TeamMemberFragment,
  useGetLeagueScoringProfileQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetUserTeamIdQuery,
  useUpdateTeamBrandingMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import {
  isBatter,
  isBattingSlot,
  isPitcher,
  isPitchingSlot,
} from '../../../../common/models/Models';
import { LineupEditor } from '../../../../features/roster/LineupEditor';
import { PositionSlot } from '../../../../common/models/Models';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { toIntId } from '../../../../common/utilities/RouteUtils';

/** Shape of a single matchup player returned by GetMatchupStats (not yet in generated types). */
interface MatchupPlayerStats {
  playerId?: number | null;
  aggregateSeasonBattingByPlayerIdAndSeason?: Record<string, number> | null;
  aggregateSeasonFieldingByPlayerIdAndSeason?: Record<string, number> | null;
  aggregateSeasonPitchingByPlayerIdAndSeason?: Record<string, number> | null;
  matchupBatting?: Record<string, number> | null;
  matchupFielding?: Record<string, number> | null;
  matchupPitching?: Record<string, number> | null;
}

/** Narrow the GetMatchupStats query data to its matchupPlayers array. */
function getMatchupPlayers(data: unknown): readonly MatchupPlayerStats[] {
  if (
    data != null &&
    typeof data === 'object' &&
    'matchupPlayers' in data &&
    Array.isArray((data as { matchupPlayers: unknown }).matchupPlayers)
  ) {
    return (data as { matchupPlayers: MatchupPlayerStats[] }).matchupPlayers;
  }
  return [];
}

const ALL_TABS = Object.freeze(['Lineup', 'Rotation', 'Settings'] as const);
type Tab = (typeof ALL_TABS)[number];

interface BrandingSettingsProps {
  teamId: number;
  leagueId: number;
  currentAvatarUrl: string | null | undefined;
  currentBannerUrl: string | null | undefined;
}

function BrandingSettings(props: BrandingSettingsProps): React.JSX.Element {
  const { teamId, leagueId, currentAvatarUrl, currentBannerUrl } = props;
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl ?? '');
  const [bannerUrl, setBannerUrl] = useState(currentBannerUrl ?? '');
  const [updateTeamBranding, { loading }] = useUpdateTeamBrandingMutation();

  const handleSave = () => {
    updateTeamBranding({
      variables: {
        teamId,
        leagueId,
        avatarUrl: avatarUrl || null,
        bannerUrl: bannerUrl || null,
      },
    })
      .then(() => {
        Alert.alert('Saved', 'Team branding updated successfully.');
      })
      .catch(handleError);
  };

  return (
    <YStack padding="$4" gap="$3">
      <Text fontSize="$5" fontWeight="600">
        Team Branding
      </Text>
      <Text fontSize="$3" color="$gray10">
        Enter image URLs for your team logo and banner. Images are displayed
        across the app and must comply with community guidelines.
      </Text>
      <Label htmlFor="avatar-url">Avatar URL</Label>
      <Input
        id="avatar-url"
        value={avatarUrl}
        onChangeText={setAvatarUrl}
        placeholder="https://example.com/avatar.png"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Label htmlFor="banner-url">Banner URL</Label>
      <Input
        id="banner-url"
        value={bannerUrl}
        onChangeText={setBannerUrl}
        placeholder="https://example.com/banner.png"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Button onPress={handleSave} disabled={loading} theme="active">
        {loading ? 'Saving…' : 'Save Branding'}
      </Button>
    </YStack>
  );
}

interface TabContentProps {
  matchup: MatchupFragment | null | undefined;
  selectedTab: Tab;
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
  teamId: number;
  leagueId: number;
  avatarUrl: string | null | undefined;
  bannerUrl: string | null | undefined;
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
    teamId,
    leagueId,
    avatarUrl,
    bannerUrl,
  } = props;

  const { data: statsData, loading: loadingStats } = useGetMatchupStatsQuery({
    skip: !matchup?.id,
    variables: {
      matchupId: matchup?.id || -1,
      withMatchupStats: true,
      withProjections: true,
    },
  }) as { data: unknown; loading: boolean };
  const stats: unknown = statsData;

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

      const proj = getMatchupPlayers(stats).find(
        (n) => n?.playerId === hitter.playerId,
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

      const proj = getMatchupPlayers(stats).find(
        (n) => n?.playerId === pitcher.playerId,
      );

      const value = computeAverageScoring(
        proj?.aggregateSeasonPitchingByPlayerIdAndSeason,
        pitchingSettings,
      );

      // Determine number of games for this pitcher based on position type
      // SP uses pitcherStartsPerMatchup, RP uses gamesPerMatchup
      const posSlot = pitchingSlots.find(
        (s) => s?.id != null && Number(s.id) === pitcher.positionId,
      );
      const pitcherGames =
        posSlot?.positionType === 'SP'
          ? (matchup?.pitcherStartsPerMatchup ?? matchup?.gamesPerMatchup ?? 1)
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

      const mp = getMatchupPlayers(stats).find(
        (n) => n?.playerId === hitter.playerId,
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

      const mp = getMatchupPlayers(stats).find(
        (n) => n?.playerId === pitcher.playerId,
      );

      result[pitcher.playerId] = computeScoring(
        mp?.matchupPitching,
        pitchingSettings,
      );
    }
    return result;
  }, [stats, pitchers, loadingStats, pitchingSettings]);

  const noOp = (): void => {
    /* read-only view: mutations disabled */
  };

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
    case 'Settings':
      return isOwner ? (
        <BrandingSettings
          teamId={teamId}
          leagueId={leagueId}
          currentAvatarUrl={avatarUrl}
          currentBannerUrl={bannerUrl}
        />
      ) : (
        <YStack padding="$4">
          <Text color="$gray10">
            Only the team owner can edit team branding.
          </Text>
        </YStack>
      );
    default:
      return null;
  }
}

export default function Team(): React.JSX.Element {
  const params = useLocalSearchParams();
  const teamId = params.teamId;

  const numTeamId = toIntId(teamId);

  const { loading: loadingTeam, data: team } = useGetTeamByIdQuery({
    skip: numTeamId === null,
    variables: {
      teamId: numTeamId ?? 0,
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

  // Only owners see the Settings tab — non-owners have no branding controls.
  const visibleTabs: Tab[] = isOwner
    ? [...ALL_TABS]
    : ALL_TABS.filter((t) => t !== 'Settings');

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
    if (!player.id) return;

    updateTeamMemberPosition({
      variables: {
        positionId: positionSlot.id,
        teamMemberId: player.id,
      },
    }).catch(handleError);
  };

  const onPlayerRemoved = (_position: LeaguePositionFragment) => {
    // teamMembers are managed via the LineupEditor's own state; no-op here
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
    return <UnifiedLoadingPanel />;
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
          value={visibleTabs[selectedTabIdx] ?? visibleTabs[0]}
          onValueChange={(value) => {
            const index = visibleTabs.indexOf(value as Tab);
            if (index !== -1) setSelectedTabIdx(index);
          }}
          orientation="horizontal"
        >
          <Tabs.List>
            {visibleTabs.map((tab) => (
              <Tabs.Tab key={tab} value={tab}>
                <Text>{tab}</Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Separator />
        <TabContent
          matchup={null}
          team={[]}
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          selectedTab={visibleTabs[selectedTabIdx] ?? visibleTabs[0]}
          rosterSlots={positions?.leaguePositions || []}
          isOwner={isOwner}
          battingSettings={battingSettings}
          fieldingSettings={fieldingSettings}
          pitchingSettings={pitchingSettings}
          teamId={numTeamId ?? 0}
          leagueId={team.team.leagueId}
          avatarUrl={team.team.avatarUrl}
          bannerUrl={team.team.bannerUrl}
        />
      </YStack>
    </ScrollView>
  );
}

export function TeamIdHeader(): React.JSX.Element {
  const params = useLocalSearchParams();
  const teamId = params.teamId;

  const numTeamId = toIntId(teamId);

  const { data: team } = useGetTeamByIdQuery({
    skip: numTeamId === null,
    variables: {
      teamId: numTeamId ?? 0,
    },
  });

  return <Text>{team?.team?.name}</Text>;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

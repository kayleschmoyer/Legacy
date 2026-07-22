import { useMemo, useState } from 'react';
import { Separator, Tabs, Text, XStack, YStack } from 'tamagui';
import { Alert, Image, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { computeAverageScoring, computeScoring } from '@legacy-sports/scoring';
import {
  BRAND_NAVY_LIGHT,
  SecureStorageProvider,
  TeamAssistantManagerSettings,
  TeamBrandingControl,
  type TeamBrandingTeam,
  UnifiedLoadingPanel,
} from '@legacy-sports/shared-components';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { config } from '@legacy-sports/app-config/native';
import {
  AppMatchupFragment,
  AppTeamMemberFragment,
  LeaguePositionFragment,
  useGetLeagueByIdQuery,
  useGetLeagueScoringProfileQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetUserTeamIdQuery,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { applyMultiplierGroups } from '../../../../common/scoring';
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
import { INTERNAL_JWT_KEY } from '../../../../common/auth/jwtRefresh';
import {
  useHasEntitlement,
  useSubscription,
} from '../../../../features/subscription/useSubscription';

interface MatchupPlayerStats {
  playerId?: number | null;
  aggregateSeasonBattingByPlayerIdAndSeason?: Record<string, number> | null;
  aggregateSeasonFieldingByPlayerIdAndSeason?: Record<string, number> | null;
  aggregateSeasonPitchingByPlayerIdAndSeason?: Record<string, number> | null;
  matchupBatting?: Record<string, number> | null;
  matchupFielding?: Record<string, number> | null;
  matchupPitching?: Record<string, number> | null;
}

function getMatchupPlayers(data: unknown): readonly MatchupPlayerStats[] {
  if (
    data != null &&
    typeof data === 'object' &&
    'getMatchupPlayers' in data &&
    Array.isArray(data.getMatchupPlayers)
  ) {
    return (data as { getMatchupPlayers: MatchupPlayerStats[] })
      .getMatchupPlayers;
  }
  return [];
}

const ALL_TABS = Object.freeze(['Lineup', 'Rotation', 'Settings'] as const);
type Tab = (typeof ALL_TABS)[number];

interface TabContentProps {
  matchup: AppMatchupFragment | null | undefined;
  selectedTab: Tab;
  rosterSlots: readonly (LeaguePositionFragment | null)[];
  onPlayerAdded: (
    player: AppTeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerMoved: (
    playerOne: AppTeamMemberFragment,
    playerTwo: AppTeamMemberFragment,
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  team: readonly (AppTeamMemberFragment | null)[];
  isOwner: boolean;
  battingSettings: Partial<Record<string, number>>;
  fieldingSettings: Partial<Record<string, number>>;
  pitchingSettings: Partial<Record<string, number>>;
  teamId: number;
  leagueId: number;
  brandingTeam: TeamBrandingTeam | null;
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
    brandingTeam,
  } = props;

  const { isPremium } = useSubscription();
  const canUploadLogo = useHasEntitlement(ENTITLEMENTS.logo_upload);

  const { data: statsData, loading: loadingStats } = useGetMatchupPlayersQuery({
    skip: !matchup?.id,
    variables: {
      matchupId: Number(matchup?.id) || -1,
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
          projections={isPremium ? hitterProjections : {}}
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
          projections={isPremium ? pitcherProjections : {}}
          team={pitchers}
          actual={pitchersActual}
        />
      );
    case 'Settings':
      return isOwner ? (
        <YStack padding="$4" gap="$4">
          <TeamBrandingControl
            teamId={teamId}
            leagueId={leagueId}
            team={brandingTeam}
            canUploadLogo={canUploadLogo}
            imageUploadUrl={config.imageUploadUrl}
            getAuthToken={() => SecureStorageProvider.getItem(INTERNAL_JWT_KEY)}
            onSaved={() =>
              Alert.alert('Saved', 'Team branding updated successfully.')
            }
            onError={handleError}
          />
          <TeamAssistantManagerSettings teamId={teamId} />
        </YStack>
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

/** Small circular avatar with a letter-fallback, shared by the header and body identity block. */
function TeamAvatarGlyph({
  avatarUrl,
  name,
  size,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  size: number;
}): React.JSX.Element {
  const [imgError, setImgError] = useState(false);
  const showImage = !!avatarUrl && !imgError;

  return (
    <XStack
      width={size}
      height={size}
      borderRadius={size / 2}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      backgroundColor={BRAND_NAVY_LIGHT}
      testID="team-avatar"
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size }}
          onError={() => setImgError(true)}
          testID="team-avatar-image"
        />
      ) : (
        <Text
          color="white"
          fontWeight="700"
          fontSize={Math.round(size * 0.4)}
          testID="team-avatar-fallback"
        >
          {(name || 'T').charAt(0).toUpperCase()}
        </Text>
      )}
    </XStack>
  );
}

interface TeamIdentityBlockProps {
  name: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  leagueId: number;
  isOwner: boolean;
  isCommissioner: boolean;
}

/** Team avatar/banner/league-id/visitor-note identity block, rendered in the screen body (LS-8313). */
function TeamIdentityBlock({
  name,
  avatarUrl,
  bannerUrl,
  leagueId,
  isOwner,
  isCommissioner,
}: TeamIdentityBlockProps): React.JSX.Element {
  return (
    <YStack gap="$3" padding="$4">
      {bannerUrl && (
        <YStack height={120} borderRadius="$4" overflow="hidden">
          <Image
            source={{ uri: bannerUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            testID="team-banner-image"
          />
        </YStack>
      )}
      <XStack gap="$3" alignItems="center">
        <TeamAvatarGlyph avatarUrl={avatarUrl} name={name} size={72} />
        <YStack gap="$1" flex={1}>
          <Text fontSize="$6" fontWeight="bold">
            {name}
          </Text>
          <Text fontSize="$3" color="$gray11" testID="team-league-id">
            League ID: {leagueId}
          </Text>
          {!isOwner && !isCommissioner && (
            <Text
              fontSize="$3"
              color="$gray11"
              fontStyle="italic"
              testID="team-visitor-note"
            >
              You are viewing this team as a visitor. Only the General Manager
              can make changes.
            </Text>
          )}
        </YStack>
      </XStack>
    </YStack>
  );
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

  const { data: leagueData, loading: loadingLeagueDetails } =
    useGetLeagueByIdQuery({
      skip: team?.team?.leagueId === undefined,
      variables: {
        id: team?.team?.leagueId || -1,
      },
    });

  const isCommissioner =
    leagueData?.league?.userMembership?.permissionLevel === 'commissioner';

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
    player: AppTeamMemberFragment,
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
    playerOne: AppTeamMemberFragment,
    playerTwo: AppTeamMemberFragment,
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
    loadingLeagueDetails ||
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
        <TeamIdentityBlock
          name={team.team.name ?? 'Team'}
          avatarUrl={team.team.avatarUrl}
          bannerUrl={team.team.bannerUrl}
          leagueId={team.team.leagueId ?? 0}
          isOwner={isOwner}
          isCommissioner={isCommissioner}
        />
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
          leagueId={team.team.leagueId ?? 0}
          brandingTeam={team.team}
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

  return (
    <XStack gap="$2" alignItems="center">
      <TeamAvatarGlyph
        avatarUrl={team?.team?.avatarUrl}
        name={team?.team?.name}
        size={24}
      />
      <Text>{team?.team?.name}</Text>
    </XStack>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

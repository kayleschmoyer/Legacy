import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Separator, Spinner, Tabs, Text, YStack } from 'tamagui';
import { Alert, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  SecureStorageProvider,
  UnifiedLoadingPanel,
  useTeamLogoUpload,
} from '@legacy-sports/shared-components';
import { MatchupAdditionalSections } from '@legacy-sports/shared-components/matchup';
import type { FootballScoringFormat } from '@legacy-sports/shared-components/football';
import { config } from '@legacy-sports/app-config/native';
import {
  RosterBoard,
  type RosterPlayerStats,
} from '@legacy-sports/shared-components/roster';
import {
  AppTeamMemberFragment,
  GetLeagueScoringProfileQuery,
  LeaguePositionFragment,
  MatchupFragment,
  MatchupScoresQuery,
  useGetLeagueByIdQuery,
  useGetLeagueScoringProfileQuery,
  useGetMatchupByIdQuery,
  useGetNflTeamSeasonMetadataQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdQuery,
  useMatchupScoresQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamBrandingMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { FootballLeagueRosterScreen } from '../../../../screens/leagues/football/FootballLeagueRosterScreen';
import { MatchupCard } from '../../../../features/matchup/components/MatchupCard';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { toIntId } from '../../../../common/utilities/RouteUtils';
import { INTERNAL_JWT_KEY } from '../../../../common/auth/jwtRefresh';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';
import { deriveFootballScoringFormat } from '../../../../common/scoring/footballScoringFormat';
import { LeagueWebSocketContext } from '../../../../context/LeagueWebSocketContext';
import { useLeagueWebSocketLifecycle } from '../../../../hooks/useLeagueWebSocketLifecycle';
import { useLeagueWebSocket } from '../../../../hooks/useLeagueWebSocket';

const SCORING_FORMAT_LABELS: Record<FootballScoringFormat, string> = {
  standard: 'Standard',
  half_ppr: 'Half-PPR',
  ppr: 'PPR',
  custom: 'Custom',
};

const SCORING_STAT_GROUP_LABELS: Record<string, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  kicking: 'Kicking',
  defense: 'Defense',
  idp: 'IDP',
};

function formatMultiplier(multiplier: number): string {
  const rounded = Math.round(multiplier * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

const ALL_TABS = Object.freeze([
  'Roster',
  'Matchup',
  'Lineup',
  'Settings',
] as const);
type Tab = (typeof ALL_TABS)[number];

type MatchupScoreEntry = MatchupScoresQuery['matchupScores'][number];
type FootballMatchupScoreEntry = Extract<
  MatchupScoreEntry,
  { __typename?: 'FootballMatchupStats' }
>;

function isFootballMatchupStats(
  stats: MatchupScoreEntry,
): stats is FootballMatchupScoreEntry {
  return stats.__typename === 'FootballMatchupStats';
}

function buildActualScores(
  matchupScores: readonly MatchupScoreEntry[] | undefined,
  teamId: number,
): Record<number, number> {
  const teamStats = matchupScores
    ?.filter(isFootballMatchupStats)
    .find((stats) => stats.teamId === teamId);

  if (!teamStats) {
    return {};
  }

  return teamStats.players.reduce<Record<number, number>>((acc, player) => {
    acc[player.playerId] = player.totalPoints;
    return acc;
  }, {});
}

interface BrandingSettingsProps {
  teamId: number;
  leagueId: number;
  currentAvatarUrl: string | null | undefined;
  currentBannerUrl: string | null | undefined;
}

interface BrandingImageFieldProps {
  label: string;
  currentUrl: string | null | undefined;
  uploading: boolean;
  uploadError: string | null;
  onPick: () => void;
}

/** Upload button + thumbnail + error text for one team image slot (avatar or banner). */
function BrandingImageField({
  label,
  currentUrl,
  uploading,
  uploadError,
  onPick,
}: BrandingImageFieldProps): React.JSX.Element {
  return (
    <YStack gap="$2">
      <Text fontSize="$3" fontWeight="500">
        {label}
      </Text>
      {currentUrl && (
        <Image
          source={{ uri: currentUrl }}
          style={{ width: 96, height: 96, borderRadius: 8 }}
          testID={`branding-${label.toLowerCase()}-preview`}
        />
      )}
      {uploadError && (
        <Text fontSize="$2" color="$red9" role="alert">
          {uploadError}
        </Text>
      )}
      <Button
        onPress={onPick}
        disabled={uploading}
        theme="active"
        icon={uploading ? <Spinner size="small" /> : undefined}
      >
        {uploading
          ? 'Uploading…'
          : currentUrl
            ? `Change ${label}`
            : `Upload ${label}`}
      </Button>
    </YStack>
  );
}

/**
 * LS-6434: avatar/banner used to be free-text HTTPS URL fields, so a GM could
 * point the team at any external image — bypassing the MIME/size checks and
 * Cloudflare NSFW scan that the image-upload lambda runs on every upload
 * (lambdas/image-upload/src/index.ts), unlike web's TeamDetailPage
 * (LS-1810). Picking from the device library and uploading through that same
 * lambda closes the gap: every accepted image is now actually screened,
 * rather than trusted by URL alone.
 */
function BrandingSettings(props: BrandingSettingsProps): React.JSX.Element {
  const { teamId, leagueId, currentAvatarUrl, currentBannerUrl } = props;
  const [updateTeamBranding] = useUpdateTeamBrandingMutation();

  const persistImage = (imageType: 'avatar' | 'banner') => (url: string) => {
    updateTeamBranding({
      variables: {
        teamId,
        leagueId,
        ...(imageType === 'avatar' ? { avatarUrl: url } : { bannerUrl: url }),
      },
    })
      .then(() => {
        Alert.alert('Saved', 'Team branding updated successfully.');
      })
      .catch(handleError);
  };

  const getAuthToken = () => SecureStorageProvider.getItem(INTERNAL_JWT_KEY);

  const avatarUpload = useTeamLogoUpload({
    teamId,
    imageType: 'avatar',
    imageUploadUrl: config.imageUploadUrl,
    getAuthToken,
    onUploaded: persistImage('avatar'),
  });

  const bannerUpload = useTeamLogoUpload({
    teamId,
    imageType: 'banner',
    imageUploadUrl: config.imageUploadUrl,
    getAuthToken,
    onUploaded: persistImage('banner'),
  });

  return (
    <YStack padding="$4" gap="$4">
      <Text fontSize="$5" fontWeight="600">
        Team Branding
      </Text>
      <Text fontSize="$3" color="$gray10">
        Upload images for your team avatar and banner (PNG, JPEG, or WebP, max 2
        MB). Images are screened for inappropriate content before they&apos;re
        shown across the league.
      </Text>
      <BrandingImageField
        label="Avatar"
        currentUrl={currentAvatarUrl}
        uploading={avatarUpload.uploading}
        uploadError={avatarUpload.uploadError}
        onPick={() => void avatarUpload.pickAndUploadLogo()}
      />
      <BrandingImageField
        label="Banner"
        currentUrl={currentBannerUrl}
        uploading={bannerUpload.uploading}
        uploadError={bannerUpload.uploadError}
        onPick={() => void bannerUpload.pickAndUploadLogo()}
      />
    </YStack>
  );
}

/**
 * Subscribes to page-level WS events for the team screen (LS-6445). Rendered
 * as a child of LeagueWebSocketContext.Provider (not the provider component
 * itself) so it can actually read the context value the provider supplies —
 * mirrors LeagueWSPageHandler in
 * apps/app/src/app/(app)/football/league/[leagueId].tsx.
 */
function TeamWSPageHandler({
  onRosterUpdate,
  onMatchupScoreUpdate,
}: {
  onRosterUpdate: () => void;
  onMatchupScoreUpdate: () => void;
}) {
  useLeagueWebSocket({
    onRosterUpdate,
    onMatchupScoreUpdated: onMatchupScoreUpdate,
  });
  return null;
}

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

interface ScoringFormatCalloutProps {
  scoringFormat: FootballScoringFormat | undefined;
  profile: LeagueScoringProfile | null | undefined;
}

/**
 * LS-6451: badge on the team detail page (visible on every tab) showing the
 * league's scoring format, expandable to a read-only point-value preview
 * grouped by stat category. Reuses the scoring profile already fetched by
 * useGetLeagueScoringProfileQuery for the Lineup-tab badge, so no extra query.
 */
function ScoringFormatCallout({
  scoringFormat,
  profile,
}: ScoringFormatCalloutProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  const groupedStats = useMemo(() => {
    const groups = new Map<string, { label: string; value: string }[]>();
    for (const stat of profile?.stats ?? []) {
      const statGroup = stat?.definition?.statGroup;
      const displayName = stat?.definition?.displayName;
      if (
        !stat ||
        stat.isEnabled === false ||
        !statGroup ||
        !displayName ||
        typeof stat.multiplier !== 'number' ||
        !Number.isFinite(stat.multiplier)
      ) {
        continue;
      }
      const rows = groups.get(statGroup) ?? [];
      rows.push({
        label: displayName,
        value: formatMultiplier(stat.multiplier),
      });
      groups.set(statGroup, rows);
    }
    return Array.from(groups.entries());
  }, [profile?.stats]);

  if (!scoringFormat) {
    return null;
  }

  return (
    <YStack
      testID="team-scoring-format-callout"
      padding="$3"
      backgroundColor="$color2"
      borderRadius="$3"
      margin="$3"
      marginBottom="$1"
      gap="$2"
    >
      <Button
        chromeless
        justifyContent="space-between"
        onPress={() => setExpanded((prev) => !prev)}
        testID="team-scoring-format-toggle"
      >
        <Text fontSize="$3" fontWeight="600">
          {SCORING_FORMAT_LABELS[scoringFormat]} Scoring
        </Text>
        <Text fontSize="$2" color="$gray10">
          {expanded ? 'Hide details ▲' : 'View scoring settings ▼'}
        </Text>
      </Button>
      {expanded && (
        <YStack testID="team-scoring-format-preview" gap="$3" paddingTop="$1">
          {groupedStats.length === 0 && (
            <Text fontSize="$2" color="$gray10">
              No scoring settings available.
            </Text>
          )}
          {groupedStats.map(([group, rows]) => (
            <YStack key={group} gap="$1">
              <Text fontSize="$2" fontWeight="700" color="$gray10">
                {SCORING_STAT_GROUP_LABELS[group] ?? group}
              </Text>
              {rows.map((row) => (
                <YStack
                  key={row.label}
                  flexDirection="row"
                  justifyContent="space-between"
                >
                  <Text fontSize="$2">{row.label}</Text>
                  <Text fontSize="$2" fontWeight="600">
                    {row.value}
                  </Text>
                </YStack>
              ))}
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}

interface MatchupTabProps {
  matchup: MatchupFragment | null | undefined;
  matchupId: number;
  loading: boolean;
  error: unknown;
  leagueId: number;
}

function MatchupTab({
  matchup,
  matchupId,
  loading,
  error,
  leagueId,
}: MatchupTabProps): React.JSX.Element {
  const router = useRouter();

  if (loading) {
    return (
      <YStack alignItems="center" padding="$6">
        <Spinner size="small" color="$brandNavyLight" />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack padding="$4" testID="matchup-tab-content">
        <Text color="$red10">Could not load matchup.</Text>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack padding="$4" testID="matchup-tab-content">
        <Text color="$gray10">No matchup scheduled this week.</Text>
      </YStack>
    );
  }

  return (
    <YStack padding="$4" gap="$4" testID="matchup-tab-content">
      <MatchupCard
        matchup={matchup}
        onPress={() =>
          router.push(
            `/football/matchup?matchupId=${matchupId}&leagueId=${leagueId}`,
          )
        }
      />
      {/* LS-6446: same key-players/head-to-head/league-context analytics
          already shown on the full matchup screen (FootballMatchupScreen),
          surfaced here too so team detail isn't a stripped-down preview of it. */}
      <MatchupAdditionalSections matchup={matchup} leagueId={leagueId} />
    </YStack>
  );
}

interface TabContentProps {
  selectedTab: Tab;
  rosterSlots: readonly (LeaguePositionFragment | null)[];
  team: readonly (AppTeamMemberFragment | null)[];
  onPlayerAssign: (
    player: AppTeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSwap: (
    incoming: AppTeamMemberFragment,
    target: LeaguePositionFragment,
    displaced: AppTeamMemberFragment,
  ) => void;
  isOwner: boolean;
  teamId: number;
  leagueId: number;
  avatarUrl: string | null | undefined;
  bannerUrl: string | null | undefined;
  defensiveFormat: string | null | undefined;
  scoringFormat: FootballScoringFormat | undefined;
  getPlayerStats: (player: AppTeamMemberFragment) => RosterPlayerStats | null;
  matchup: MatchupFragment | null | undefined;
  matchupId: number;
  matchupLoading: boolean;
  matchupError: unknown;
  byeWeeksByTeam: Readonly<Record<string, number>>;
  currentWeek: number | null | undefined;
}

function TabContent(props: TabContentProps): React.JSX.Element | null {
  const {
    onPlayerAssign,
    onPlayerRemove,
    onPlayerSwap,
    selectedTab,
    rosterSlots,
    team,
    isOwner,
    teamId,
    leagueId,
    avatarUrl,
    bannerUrl,
    defensiveFormat,
    scoringFormat,
    getPlayerStats,
    matchup,
    matchupId,
    matchupLoading,
    matchupError,
    byeWeeksByTeam,
    currentWeek,
  } = props;

  switch (selectedTab) {
    case 'Roster':
      return (
        <FootballLeagueRosterScreen
          teamId={teamId}
          defensiveFormat={defensiveFormat}
          rosterSlots={rosterSlots}
          byeWeeksByTeam={byeWeeksByTeam}
          currentWeek={currentWeek}
        />
      );
    case 'Matchup':
      return (
        <MatchupTab
          matchup={matchup}
          matchupId={matchupId}
          loading={matchupLoading}
          error={matchupError}
          leagueId={leagueId}
        />
      );
    case 'Lineup':
      return (
        <YStack padding="$4">
          {scoringFormat && (
            <Text
              testID="lineup-scoring-format-badge"
              color="$gray10"
              fontSize="$2"
              paddingBottom="$2"
            >
              {SCORING_FORMAT_LABELS[scoringFormat]} Scoring
            </Text>
          )}
          <RosterBoard<AppTeamMemberFragment, LeaguePositionFragment>
            positions={rosterSlots.filter(
              (s): s is LeaguePositionFragment => s != null,
            )}
            teamPlayers={team.filter(
              (m): m is AppTeamMemberFragment => m != null,
            )}
            onPlayerAssign={onPlayerAssign}
            onPlayerRemove={onPlayerRemove}
            onPlayerSwap={onPlayerSwap}
            getPlayerStats={getPlayerStats}
            readOnly={!isOwner}
            sport="football"
            byeWeeksByTeam={byeWeeksByTeam}
            currentWeek={currentWeek}
          />
        </YStack>
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

export default function FootballTeam(): React.JSX.Element {
  const params = useLocalSearchParams();
  const teamId = params.teamId;

  const numTeamId = toIntId(teamId);

  const {
    loading: loadingTeam,
    data: team,
    refetch: refetchTeam,
  } = useGetTeamByIdQuery({
    skip: numTeamId === null,
    variables: {
      teamId: numTeamId ?? 0,
    },
  });

  const { data: userTeamData } = useGetUserTeamIdQuery({
    skip: team?.team?.leagueId === undefined,
    variables: {
      leagueId: team?.team?.leagueId || -1,
    },
  });

  const { loading: loadingLeague, data: leagueData } = useGetLeagueByIdQuery({
    skip: team?.team?.leagueId === undefined,
    variables: {
      id: team?.team?.leagueId || -1,
    },
  });

  const { loading: loadingPositions, data: positions } =
    useGetPositionsForLeagueQuery({
      skip: team?.team?.leagueId === undefined,
      variables: {
        leagueId: team?.team?.leagueId || -1,
      },
    });

  const { data: scoringProfileData } = useGetLeagueScoringProfileQuery({
    skip: team?.team?.leagueId === undefined,
    variables: {
      leagueId: team?.team?.leagueId || -1,
    },
  });

  const scoringFormat = deriveFootballScoringFormat(
    scoringProfileData?.leagueScoringProfile,
  );

  const {
    loading: loadingMembers,
    data: membersData,
    refetch: refetchMembers,
  } = useGetTeamMembersQuery({
    skip: numTeamId === null,
    variables: {
      teamId: numTeamId ?? 0,
    },
  });

  const currentWeekNumber = leagueData?.league?.currentWeekNumber;

  // Bye-week warning data (LS-6430) — same pattern as the football league
  // route (apps/app/src/app/(app)/football/league/[leagueId].tsx).
  const { data: nflByeWeekData } = useGetNflTeamSeasonMetadataQuery({
    variables: { season: leagueData?.league?.seasonNumber ?? undefined },
    skip: !leagueData?.league?.seasonNumber,
  });
  const byeWeeksByTeam = useMemo(() => {
    const map: Record<string, number> = {};
    for (const meta of nflByeWeekData?.nflTeamSeasonMetadata ?? []) {
      if (meta?.teamAbbreviation) map[meta.teamAbbreviation] = meta.byeWeek;
    }
    return map;
  }, [nflByeWeekData?.nflTeamSeasonMetadata]);

  const { data: matchupScoresData, refetch: refetchMatchupScores } =
    useMatchupScoresQuery({
      skip: team?.team?.leagueId === undefined || currentWeekNumber == null,
      variables: {
        leagueId: team?.team?.leagueId ?? 0,
        weekNum: currentWeekNumber ?? 0,
      },
    });

  const actualScores = useMemo(
    () => buildActualScores(matchupScoresData?.matchupScores, numTeamId ?? 0),
    [matchupScoresData?.matchupScores, numTeamId],
  );

  const currentMatchupId = leagueData?.league?.currentMatchup;

  const {
    loading: loadingMatchup,
    data: matchupData,
    error: matchupError,
    refetch: refetchMatchup,
  } = useGetMatchupByIdQuery({
    skip: currentMatchupId == null,
    variables: {
      id: currentMatchupId ?? 0,
    },
  });

  // Live score updates during a game (LS-6445): the team screen's matchup
  // score data used to be fetched once on mount, so a user watching their
  // team through a live game saw stale scores until they navigated away and
  // back. This reuses the WS ROSTER_UPDATE / MATCHUP_SCORE_UPDATED pattern
  // already established for the league route
  // (apps/app/src/app/(app)/football/league/[leagueId].tsx) and the baseball
  // matchup screen instead of adding a separate polling mechanism.
  const teamLeagueId = team?.team?.leagueId;
  const [wsToken, setWsToken] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void readKeychainValue(Secret.INTERNAL_JWT).then((token: string | null) => {
      if (active && token) setWsToken(token);
    });
    return () => {
      active = false;
    };
  }, []);

  const wsUrl = config.websocketUrl;
  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({
      url: wsUrl ?? undefined,
      token: wsToken,
      leagueId: teamLeagueId ?? undefined,
    });

  const isOwner = userTeamData?.userTeamId === numTeamId;

  const visibleTabs: Tab[] = isOwner
    ? [...ALL_TABS]
    : ALL_TABS.filter((t) => t !== 'Settings');

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  const [selectedTabIdx, setSelectedTabIdx] = useState(0);

  const teamMembers = membersData?.teamMembers;

  const handlePlayerAssign = useCallback(
    async (player: AppTeamMemberFragment, position: LeaguePositionFragment) => {
      if (typeof player.id !== 'number') {
        handleError(new Error('Missing team member identifier'));
        return;
      }
      // `LeaguePosition.id` is nullable in the schema; a null slot id here
      // would send positionId: null and silently bench the player instead of
      // starting them.
      if (typeof position.id !== 'number') {
        handleError(new Error('Missing roster slot identifier'));
        return;
      }

      // Optimistically reflect the new position immediately — on slow networks
      // the round-trip reads as an unresponsive tap otherwise (LS-6336). Apollo
      // rolls the cache patch back automatically if the mutation errors.
      const existingMember = teamMembers?.find(
        (member) => member?.id === player.id,
      );

      try {
        await updateTeamMemberPosition({
          variables: {
            teamMemberId: player.id,
            positionId: position.id,
          },
          optimisticResponse: existingMember
            ? {
                updateTeamMemberPosition: {
                  ...existingMember,
                  positionId: position.id,
                },
              }
            : undefined,
        });
      } catch (error) {
        handleError(error);
      }
    },
    [updateTeamMemberPosition, teamMembers],
  );

  const handlePlayerRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      // Guard before the lookup: a null slot id would match every benched
      // player, since bench membership is exactly `positionId == null`.
      if (typeof position.id !== 'number') return;

      const assignedPlayer = teamMembers?.find(
        (member) => member?.positionId === position.id,
      );
      if (typeof assignedPlayer?.id !== 'number') return;

      try {
        await updateTeamMemberPosition({
          variables: {
            teamMemberId: assignedPlayer.id,
            positionId: null,
          },
          optimisticResponse: {
            updateTeamMemberPosition: {
              ...assignedPlayer,
              positionId: null,
            },
          },
        });
      } catch (error) {
        handleError(error);
      }
    },
    [updateTeamMemberPosition, teamMembers],
  );

  // Single atomic mutation — two independent updates left the roster in an
  // invalid intermediate state if the second one failed (LS-6431).
  const handlePlayerSwap = useCallback(
    async (
      incoming: AppTeamMemberFragment,
      target: LeaguePositionFragment,
      displaced: AppTeamMemberFragment,
    ) => {
      if (typeof incoming.id !== 'number' || typeof displaced.id !== 'number') {
        handleError(new Error('Missing team member identifier'));
        return;
      }
      if (typeof target.id !== 'number') {
        handleError(new Error('Missing roster slot identifier'));
        return;
      }

      try {
        await swapTeamMemberPositions({
          variables: {
            teamMemberIdA: incoming.id,
            positionIdA: target.id,
            teamMemberIdB: displaced.id,
            positionIdB: incoming.positionId ?? undefined,
          },
        });
      } catch (error) {
        handleError(error);
      }
    },
    [swapTeamMemberPositions],
  );

  const getPlayerStats = useCallback(
    (player: AppTeamMemberFragment): RosterPlayerStats | null => {
      if (player.playerId == null) return null;
      const actual = actualScores[player.playerId];
      return actual == null ? null : { actual };
    },
    [actualScores],
  );

  if (loadingTeam || loadingPositions || loadingLeague || loadingMembers) {
    return <UnifiedLoadingPanel />;
  }

  if (!team?.team) {
    return <Text color="$red10">Could not load team</Text>;
  }

  if (!positions?.leaguePositions) {
    return <Text color="$red10">Could not load positions for league</Text>;
  }

  return (
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <TeamWSPageHandler
        onRosterUpdate={() => {
          void refetchMembers();
          void refetchTeam();
        }}
        onMatchupScoreUpdate={() => {
          void refetchMatchupScores();
          void refetchMatchup();
        }}
      />
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

          <ScoringFormatCallout
            scoringFormat={scoringFormat}
            profile={scoringProfileData?.leagueScoringProfile}
          />

          <Separator />
          <TabContent
            onPlayerAssign={(player, position) => {
              void handlePlayerAssign(player, position);
            }}
            onPlayerRemove={(position) => {
              void handlePlayerRemove(position);
            }}
            onPlayerSwap={(incoming, target, displaced) => {
              void handlePlayerSwap(incoming, target, displaced);
            }}
            selectedTab={visibleTabs[selectedTabIdx] ?? visibleTabs[0]}
            rosterSlots={positions?.leaguePositions || []}
            team={membersData?.teamMembers || []}
            isOwner={isOwner}
            teamId={numTeamId ?? 0}
            leagueId={team.team.leagueId ?? 0}
            avatarUrl={team.team.avatarUrl}
            bannerUrl={team.team.bannerUrl}
            defensiveFormat={leagueData?.league?.defensiveFormat}
            scoringFormat={scoringFormat}
            getPlayerStats={getPlayerStats}
            matchup={matchupData?.getMatchupById}
            matchupId={currentMatchupId ?? 0}
            matchupLoading={loadingMatchup}
            matchupError={matchupError}
            byeWeeksByTeam={byeWeeksByTeam}
            currentWeek={currentWeekNumber}
          />
        </YStack>
      </ScrollView>
    </LeagueWebSocketContext.Provider>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

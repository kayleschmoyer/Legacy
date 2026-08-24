import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Separator,
  Spinner,
  Tabs,
  Text,
  YStack,
} from 'tamagui';
import { Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';
import type { FootballScoringFormat } from '@legacy-sports/shared-components/football';
import {
  RosterBoard,
  type RosterPlayerStats,
} from '@legacy-sports/shared-components/roster';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
  MatchupFragment,
  MatchupScoresQuery,
  useGetLeagueByIdQuery,
  useGetLeagueScoringProfileQuery,
  useGetMatchupByIdQuery,
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
import { deriveFootballScoringFormat } from '../../../../common/scoring/footballScoringFormat';

const SCORING_FORMAT_LABELS: Record<FootballScoringFormat, string> = {
  standard: 'Standard',
  half_ppr: 'Half-PPR',
  ppr: 'PPR',
  custom: 'Custom',
};

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
      <YStack padding="$4">
        <Text color="$red10">Could not load matchup.</Text>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack padding="$4">
        <Text color="$gray10">No matchup scheduled this week.</Text>
      </YStack>
    );
  }

  return (
    <YStack padding="$4">
      <MatchupCard
        matchup={matchup}
        onPress={() =>
          router.push(
            `/football/matchup?matchupId=${matchupId}&leagueId=${leagueId}`,
          )
        }
      />
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
  } = props;

  switch (selectedTab) {
    case 'Roster':
      return (
        <FootballLeagueRosterScreen
          teamId={teamId}
          defensiveFormat={defensiveFormat}
          rosterSlots={rosterSlots}
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

  const { loading: loadingTeam, data: team } = useGetTeamByIdQuery({
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

  const { loading: loadingMembers, data: membersData } = useGetTeamMembersQuery(
    {
      skip: numTeamId === null,
      variables: {
        teamId: numTeamId ?? 0,
      },
    },
  );

  const currentWeekNumber = leagueData?.league?.currentWeekNumber;

  const { data: matchupScoresData } = useMatchupScoresQuery({
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
  } = useGetMatchupByIdQuery({
    skip: currentMatchupId == null,
    variables: {
      id: currentMatchupId ?? 0,
    },
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
        />
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

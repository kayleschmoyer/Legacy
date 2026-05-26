import { useState } from 'react';
import { Button, Input, Label, Separator, Tabs, Text, YStack } from 'tamagui';
import { Alert, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdQuery,
  useUpdateTeamBrandingMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import { FootballLeagueRosterScreen } from '../../../../screens/leagues/football/FootballLeagueRosterScreen';
import { LineupEditor } from '../../../../features/roster/LineupEditor';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { toIntId } from '../../../../common/utilities/RouteUtils';

const ALL_TABS = Object.freeze(['Roster', 'Lineup', 'Settings'] as const);
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
  selectedTab: Tab;
  rosterSlots: readonly (LeaguePositionFragment | null)[];
  team: readonly (TeamMemberFragment | null)[];
  onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment,
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  isOwner: boolean;
  teamId: number;
  leagueId: number;
  avatarUrl: string | null | undefined;
  bannerUrl: string | null | undefined;
  defensiveFormat: string | null | undefined;
}

function TabContent(props: TabContentProps): React.JSX.Element | null {
  const {
    onPlayerAdded,
    onPlayerMoved,
    onPlayerRemoved,
    selectedTab,
    rosterSlots,
    team,
    isOwner,
    teamId,
    leagueId,
    avatarUrl,
    bannerUrl,
    defensiveFormat,
  } = props;

  const noOp = (): void => {
    /* read-only view: mutations disabled */
  };

  switch (selectedTab) {
    case 'Roster':
      return (
        <FootballLeagueRosterScreen
          teamId={teamId}
          defensiveFormat={defensiveFormat}
        />
      );
    case 'Lineup':
      return (
        <LineupEditor
          availableRosterSlots={rosterSlots}
          onPlayerAdded={isOwner ? onPlayerAdded : noOp}
          onPlayerMoved={isOwner ? onPlayerMoved : noOp}
          onPlayerRemoved={isOwner ? onPlayerRemoved : noOp}
          projections={{}}
          team={team}
          actual={{}}
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

  const { loading: loadingMembers, data: membersData } = useGetTeamMembersQuery(
    {
      skip: numTeamId === null,
      variables: {
        teamId: numTeamId ?? 0,
      },
    },
  );

  const isOwner = userTeamData?.userTeamId === numTeamId;

  const visibleTabs: Tab[] = isOwner
    ? [...ALL_TABS]
    : ALL_TABS.filter((t) => t !== 'Settings');

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

  const onPlayerRemoved = (_position: LeaguePositionFragment): void => {
    /* position removal is a no-op in this view */
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
          onPlayerAdded={onPlayerAdded}
          onPlayerMoved={onPlayerMoved}
          onPlayerRemoved={onPlayerRemoved}
          selectedTab={visibleTabs[selectedTabIdx] ?? visibleTabs[0]}
          rosterSlots={positions?.leaguePositions || []}
          team={membersData?.teamMembers || []}
          isOwner={isOwner}
          teamId={numTeamId ?? 0}
          leagueId={team.team.leagueId ?? 0}
          avatarUrl={team.team.avatarUrl}
          bannerUrl={team.team.bannerUrl}
          defensiveFormat={leagueData?.league?.defensiveFormat}
        />
      </YStack>
    </ScrollView>
  );
}

export function FootballTeamHeader(): React.JSX.Element {
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  Card,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { H1, H2, Spinner, Text } from 'tamagui';
import { Check, Copy } from '@tamagui/lucide-icons';
import { gql, useLazyQuery } from '@apollo/client';
import { LeagueScoringEditor } from './LeagueScoringEditor';
import { LeagueScoringSummary } from './LeagueScoringSummary';
import { env } from '../../config/environment';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useStartDraftMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../roster/LeagueRosterManagement';
import { LeagueStandings } from '../roster/LeagueStandings';
import { useLeagueScoringSettings } from '../../lib/scoring';

// Manual GraphQL query for getting user's team ID in a league
const GET_USER_TEAM_ID = gql`
  query GetUserTeamId($leagueId: Int!) {
    userTeamId(leagueId: $leagueId)
  }
`;

// Manual GraphQL query for getting league teams (for standings)
const GET_LEAGUE_TEAMS = gql`
  query GetLeagueTeams($leagueId: Int!) {
    leagueTeams(leagueId: $leagueId) {
      id
      name
      leagueId
    }
  }
`;

// Helper functions for draft status display
function formatDraftStatus(status?: string | null): string {
  if (!status) return 'Unknown';

  switch (status) {
    case 'not-started':
      return 'Not Started';
    case 'queued':
      return 'Queued';
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    default:
      return status.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

function getDraftStatusColor(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return '$gray11';
    case 'queued':
      return '$orange11';
    case 'in-progress':
      return '$blue11';
    case 'completed':
      return '$green11';
    default:
      return '$gray11';
  }
}

function getDraftStatusBgColor(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return '$gray3';
    case 'queued':
      return '$orange3';
    case 'in-progress':
      return '$blue3';
    case 'completed':
      return '$green3';
    default:
      return '$gray3';
  }
}

function canStartDraft(status?: string | null): boolean {
  return status === 'not-started';
}

function getDraftButtonColor(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return '$blue9';
    case 'queued':
      return '$orange9';
    case 'in-progress':
      return '$gray9';
    case 'completed':
      return '$green9';
    default:
      return '$gray9';
  }
}

function getDraftButtonText(status?: string | null, loading = false): string {
  if (loading) {
    return 'Starting...';
  }

  switch (status) {
    case 'not-started':
      return 'Start Draft';
    case 'queued':
      return 'Draft Queued';
    case 'in-progress':
      return 'Draft In Progress';
    case 'completed':
      return 'Draft Completed';
    default:
      return 'Draft Unavailable';
  }
}

export function LeagueDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const leagueId = parseInt(id || '0', 10);
  const [activeTab, setActiveTab] = useState<
    'info' | 'roster' | 'commissioner' | 'standings'
  >('info');
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const { user } = useAuth();

  const { data, loading, error } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId },
    notifyOnNetworkStatusChange: true,
  });

  // Fetch league positions for roster management
  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      skip: isNaN(leagueId),
      variables: { leagueId },
    });

  // Use the proper userTeamId GraphQL query to get the user's team in this league
  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] =
    useLazyQuery(GET_USER_TEAM_ID);

  // Fetch league teams for standings
  const [
    getLeagueTeams,
    { data: leagueTeamsData, loading: leagueTeamsLoading },
  ] = useLazyQuery(GET_LEAGUE_TEAMS);

  // Effect to fetch user's team ID when league ID changes
  useEffect(() => {
    if (!isNaN(leagueId) && user?.id) {
      void getUserTeamId({
        variables: { leagueId },
      });
    }
  }, [leagueId, user?.id, getUserTeamId]);

  // Effect to fetch league teams when on standings tab
  useEffect(() => {
    if (activeTab === 'standings' && !isNaN(leagueId)) {
      void getLeagueTeams({
        variables: { leagueId },
      });
    }
  }, [activeTab, leagueId, getLeagueTeams]);

  const userTeamId = userTeamData?.userTeamId;
  const { data: teamMembersData, loading: teamMembersLoading } =
    useGetTeamMembersQuery({
      skip: !userTeamId,
      variables: {
        teamId: userTeamId || 0,
      },
    });

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  // StartDraft mutation - now returns League object, eliminating need for manual refetch
  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    onCompleted: () => {
      alert('Draft has been started and queued for processing!');
    },
    onError: (error) => {
      console.error('Error starting draft:', error);
      alert(`Failed to start draft: ${error.message}`);
    },
  });

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
    profileName: scoringProfileName,
    profile: scoringProfile,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  // Check if user is league owner/commissioner
  const isCommissioner = useMemo(() => {
    if (!data?.league || !user) return false;
    return data.league.owner === user.id || user.accessLevel === 'admin';
  }, [data?.league, user]);

  const handleStartDraft = useCallback(() => {
    if (!isCommissioner) {
      alert('Only league commissioners can start drafts.');
      return;
    }

    if (
      window.confirm(
        'Are you sure you want to start the draft? This will randomly assign players to all teams.',
      )
    ) {
      void startDraft({
        variables: {
          leagueId: leagueId,
          draftType: 'random-draft',
        },
      });
    }
  }, [startDraft, leagueId, isCommissioner]);

  const handlePlayerAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (!player.id) {
        console.error('Player ID is required');
        return;
      }

      try {
        await updateTeamMemberPosition({
          variables: {
            teamMemberId: player.id,
            positionId: position.id,
          },
        });
      } catch (error) {
        console.error('Error assigning player:', error);
      }
    },
    [updateTeamMemberPosition],
  );

  const handlePlayerRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      try {
        // Find the player assigned to this position
        const assignedPlayer = teamMembersData?.teamMembers?.find(
          (member) => member?.positionId === position.id,
        );

        if (assignedPlayer?.id) {
          await updateTeamMemberPosition({
            variables: {
              teamMemberId: assignedPlayer.id,
              positionId: null,
            },
          });
        }
      } catch (error) {
        console.error('Error removing player:', error);
      }
    },
    [updateTeamMemberPosition, teamMembersData?.teamMembers],
  );

  // Generate the full invite URL for display and copying
  const inviteUrl = useMemo(() => {
    if (!data?.league?.inviteCode) return null;
    const baseUrl = env.baseUrl.endsWith('/')
      ? env.baseUrl.slice(0, -1)
      : env.baseUrl;
    return `${window.location.origin}${baseUrl}/#/baseball/league/join/${data.league.inviteCode}`;
  }, [data?.league?.inviteCode]);

  const handleCopyInviteCode = useCallback(async () => {
    try {
      const inviteCode = data?.league?.inviteCode;
      if (!inviteCode) {
        alert('Invite code not available');
        return;
      }
      await navigator.clipboard.writeText(inviteCode);
      setLinkCopied(true);

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setLinkCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Error copying invite code:', error);
      alert('Failed to copy invite code to clipboard');
    }
  }, [data?.league?.inviteCode]);

  const handleCopyInviteLink = useCallback(async () => {
    try {
      if (!inviteUrl) {
        alert('Invite code not available');
        return;
      }

      await navigator.clipboard.writeText(inviteUrl);
      setInviteLinkCopied(true);

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setInviteLinkCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Error copying invite link:', error);
      alert('Failed to copy invite link to clipboard');
    }
  }, [inviteUrl]);

  if (loading || positionsLoading || teamMembersLoading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6"
        role="main"
        aria-busy="true"
      >
        <Spinner size="large" />
        <Text marginTop="$4" color="$gray10" role="status" aria-live="polite">
          Loading league...
        </Text>
      </YStack>
    );
  }

  if (error || !data?.league) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6"
        role="main"
        aria-live="assertive"
      >
        <Text color="$red10" fontSize="$5" textAlign="center" role="alert">
          {error ? `Error: ${error.message}` : `League not found`}
        </Text>
        <Button
          marginTop="$4"
          onPress={() => window.history.back()}
          aria-label="Go back"
        >
          Go Back
        </Button>
      </YStack>
    );
  }

  const league = data.league;
  const positions = positionsData?.leaguePositions || [];
  const teamMembers = teamMembersData?.teamMembers || [];

  const renderLeagueInfo = () => (
    <YStack
      space="$4"
      role="tabpanel"
      id="panel-info"
      aria-labelledby="tab-info"
    >
      {/* League Info Cards */}
      <XStack gap="$4" flexWrap="wrap">
        {/* Basic Info Card */}
        <Card
          flex={1}
          minWidth={300}
          backgroundColor="$blue2"
          borderColor="$blue6"
          padding="$4"
        >
          <H2 size="$6" color="$blue11" marginBottom="$3">
            League Information
          </H2>
          <YStack space="$2">
            <XStack justifyContent="space-between">
              <Text color="$gray11">Owner:</Text>
              <Text color="$gray12" fontWeight="600">
                User {league.owner}
              </Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Max Roster:</Text>
              <Text color="$gray12" fontWeight="600">
                {league.maxRosterSize} players
              </Text>
            </XStack>
            <XStack justifyContent="space-between" alignItems="center">
              <Text color="$gray11">Draft Status:</Text>
              <XStack
                backgroundColor={getDraftStatusBgColor(league.draftStatus)}
                borderColor={getDraftStatusColor(league.draftStatus)}
                borderWidth={1}
                borderRadius="$3"
                paddingHorizontal="$2"
                paddingVertical="$1"
              >
                <Text
                  color={getDraftStatusColor(league.draftStatus)}
                  fontWeight="600"
                  fontSize="$3"
                  textTransform="capitalize"
                >
                  {formatDraftStatus(league.draftStatus)}
                </Text>
              </XStack>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Current Matchup:</Text>
              <Text color="$gray12" fontWeight="600">
                {league.currentMatchup || 'None'}
              </Text>
            </XStack>
          </YStack>
        </Card>

        {/* Stats Card */}
        <Card
          flex={1}
          minWidth={300}
          backgroundColor="$green2"
          borderColor="$green6"
          padding="$4"
        >
          <H2 size="$6" color="$green11" marginBottom="$3">
            Roster Stats
          </H2>
          <YStack space="$2">
            <XStack justifyContent="space-between">
              <Text color="$gray11">Total Positions:</Text>
              <Text color="$gray12" fontWeight="600">
                {positions.length}
              </Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Players:</Text>
              <Text color="$gray12" fontWeight="600">
                {teamMembers.length}
              </Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Assigned:</Text>
              <Text color="$gray12" fontWeight="600">
                {teamMembers.filter((p) => p?.positionId).length}
              </Text>
            </XStack>
          </YStack>
        </Card>
      </XStack>

      {/* Invite Friends Card */}
      <Card backgroundColor="$purple2" borderColor="$purple6" padding="$4">
        <YStack space="$3">
          <H2 size="$6" color="$purple11" marginBottom="$2">
            <span role="img" aria-label="people">
              👥
            </span>{' '}
            Invite Friends
          </H2>
          <Text color="$gray11" fontSize="$4" marginBottom="$2">
            Share this link or code with friends to join your league:
          </Text>

          {/* Invite Link Section */}
          <YStack space="$2">
            <Text color="$purple11" fontSize="$3" fontWeight="600">
              Invite Link (Click to Join)
            </Text>
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <Card
                flex={1}
                minWidth={250}
                backgroundColor="$purple3"
                borderColor="$purple7"
                padding="$3"
                borderRadius="$3"
              >
                <Text
                  color="$purple11"
                  fontSize="$3"
                  fontFamily="$mono"
                  textAlign="center"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {inviteUrl || 'Loading...'}
                </Text>
              </Card>
              <Button
                backgroundColor={inviteLinkCopied ? '$green9' : '$purple9'}
                color="white"
                onPress={handleCopyInviteLink}
                minWidth={120}
                size="$4"
                icon={
                  inviteLinkCopied ? <Check size={20} /> : <Copy size={20} />
                }
                aria-label="Copy invite link"
              >
                {inviteLinkCopied ? 'Copied!' : 'Copy Link'}
              </Button>
              {/* Live region to announce copy status */}
              <Text className="sr-only" aria-live="polite" role="status">
                {inviteLinkCopied ? 'Invite link copied to clipboard' : ''}
              </Text>
            </XStack>
            <Text color="$gray10" fontSize="$2" fontStyle="italic">
              Friends can click this link to automatically join your league
            </Text>
          </YStack>

          {/* Divider */}
          <YStack height={1} backgroundColor="$purple6" marginVertical="$2" />

          {/* Invite Code Section */}
          <YStack space="$2">
            <Text color="$purple11" fontSize="$3" fontWeight="600">
              Invite Code (Manual Entry)
            </Text>
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <Card
                flex={1}
                minWidth={200}
                backgroundColor="$purple3"
                borderColor="$purple7"
                padding="$3"
                borderRadius="$3"
              >
                <Text
                  color="$purple12"
                  fontSize="$7"
                  fontFamily="$mono"
                  fontWeight="700"
                  letterSpacing={2}
                  textAlign="center"
                >
                  {league.inviteCode || 'Loading...'}
                </Text>
              </Card>
              <Button
                backgroundColor={linkCopied ? '$green9' : '$purple9'}
                color="white"
                onPress={handleCopyInviteCode}
                minWidth={120}
                size="$4"
                icon={linkCopied ? <Check size={20} /> : <Copy size={20} />}
                aria-label="Copy invite code"
              >
                {linkCopied ? 'Copied!' : 'Copy Code'}
              </Button>
              <Text className="sr-only" aria-live="polite" role="status">
                {linkCopied ? 'Invite code copied to clipboard' : ''}
              </Text>
            </XStack>
            <Text color="$gray10" fontSize="$2" fontStyle="italic">
              Friends can enter this code on the join league page
            </Text>
          </YStack>
        </YStack>
      </Card>

      {/* Development Notice */}
      <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$4">
        <H2 size="$5" color="$yellow11" marginBottom="$2">
          <span role="img" aria-label="tools">
            🛠️
          </span>{' '}
          League Features
        </H2>
        <Text color="$yellow11">
          Use the "My Roster" tab to manage your team's lineup and player
          positions. Additional league features like standings, member
          management, and draft tools are coming soon.
        </Text>
      </Card>
    </YStack>
  );

  const renderRosterManagement = () => (
    <YStack space="$5">
      <LeagueRosterManagement
        positions={positions}
        teamPlayers={teamMembers}
        onPlayerAssign={(player, position) =>
          void handlePlayerAssign(player, position)
        }
        onPlayerRemove={(player) => void handlePlayerRemove(player)}
        loading={positionsLoading || teamMembersLoading || userTeamLoading}
      />
      <LeagueScoringSummary
        loading={scoringLoading}
        error={scoringError}
        profileName={scoringProfileName}
        settings={scoringSettings}
      />
    </YStack>
  );

  const renderCommissionerSettings = () => (
    <YStack
      space="$4"
      role="tabpanel"
      id="panel-commissioner"
      aria-labelledby="tab-commissioner"
    >
      <LeagueScoringEditor
        leagueId={leagueId}
        profile={scoringProfile}
        loading={scoringLoading}
        error={scoringError}
        onRefetch={async () => {
          await refetchScoringProfile({ leagueId });
        }}
      />

      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3">
          <H2 size="$6" color="$blue11">
            Draft Management
          </H2>
          <Text color="$gray11" fontSize="$4">
            Start a random draft to automatically assign players to all teams in
            the league.
          </Text>
          <XStack
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap="$3"
          >
            <YStack flex={1} minWidth={300}>
              <Text
                fontSize="$5"
                fontWeight="600"
                color="$blue11"
                marginBottom="$2"
              >
                Random Draft
              </Text>
              <Text fontSize="$3" color="$gray10">
                Randomly assigns players to roster positions for all teams
              </Text>
            </YStack>
            <Button
              backgroundColor={getDraftButtonColor(league.draftStatus)}
              color="white"
              onPress={handleStartDraft}
              disabled={startDraftLoading || !canStartDraft(league.draftStatus)}
              opacity={
                startDraftLoading || !canStartDraft(league.draftStatus)
                  ? 0.6
                  : 1
              }
              minWidth={140}
              size="$4"
              aria-label={getDraftButtonText(
                league.draftStatus,
                startDraftLoading,
              )}
            >
              {getDraftButtonText(league.draftStatus, startDraftLoading)}
            </Button>
          </XStack>
        </YStack>
      </Card>

      <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$4">
        <YStack space="$3">
          <H2 size="$5" color="$yellow11">
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Commissioner Features
          </H2>
          <Text color="$yellow11" fontSize="$4">
            Additional commissioner features like member management, league
            settings, and advanced draft options are coming soon.
          </Text>
        </YStack>
      </Card>
    </YStack>
  );

  return (
    <YStack
      flex={1}
      padding="$6"
      maxWidth={1200}
      alignSelf="center"
      width="100%"
      role="main"
      aria-labelledby="league-title"
    >
      <XStack justifyContent="flex-start" marginBottom="$4">
        <Button
          backgroundColor="$gray9"
          onPress={() => window.history.back()}
          aria-label="Back to leagues"
        >
          <Text color="white">Back to Leagues</Text>
        </Button>
      </XStack>

      {/* Header */}
      <YStack marginBottom="$6">
        <H1 size="$9" color="$blue11" marginBottom="$2" id="league-title">
          {league.name}
        </H1>
        <Text color="$gray10" fontSize="$4">
          League ID: {league.id} • Max Roster Size: {league.maxRosterSize}
        </Text>
      </YStack>

      {/* Tab Navigation */}
      <XStack
        marginBottom="$4"
        gap="$2"
        role="tablist"
        aria-label="League sections"
      >
        <Button
          size="$4"
          variant={activeTab === 'info' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'info' ? '$blue9' : '$gray6'}
          color={activeTab === 'info' ? 'white' : '$gray12'}
          onPress={() => setActiveTab('info')}
          role="tab"
          id="tab-info"
          aria-selected={activeTab === 'info'}
          aria-controls="panel-info"
        >
          League Info
        </Button>
        <Button
          size="$4"
          variant={activeTab === 'roster' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'roster' ? '$blue9' : '$gray6'}
          color={activeTab === 'roster' ? 'white' : '$gray12'}
          onPress={() => setActiveTab('roster')}
          role="tab"
          id="tab-roster"
          aria-selected={activeTab === 'roster'}
          aria-controls="panel-roster"
        >
          My Roster
        </Button>
        <Button
          size="$4"
          variant={activeTab === 'standings' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'standings' ? '$blue9' : '$gray6'}
          color={activeTab === 'standings' ? 'white' : '$gray12'}
          onPress={() => setActiveTab('standings')}
          role="tab"
          id="tab-standings"
          aria-selected={activeTab === 'standings'}
          aria-controls="panel-standings"
        >
          Standings
        </Button>
        {isCommissioner && (
          <Button
            size="$4"
            variant={activeTab === 'commissioner' ? 'primary' : 'secondary'}
            backgroundColor={activeTab === 'commissioner' ? '$blue9' : '$gray6'}
            color={activeTab === 'commissioner' ? 'white' : '$gray12'}
            onPress={() => setActiveTab('commissioner')}
            role="tab"
            id="tab-commissioner"
            aria-selected={activeTab === 'commissioner'}
            aria-controls="panel-commissioner"
          >
            Commissioner
          </Button>
        )}
      </XStack>

      {/* Tab Content */}
      {activeTab === 'info' && renderLeagueInfo()}
      {activeTab === 'roster' && (
        <YStack role="tabpanel" id="panel-roster" aria-labelledby="tab-roster">
          {renderRosterManagement()}
        </YStack>
      )}
      {activeTab === 'standings' && (
        <YStack
          role="tabpanel"
          id="panel-standings"
          aria-labelledby="tab-standings"
        >
          <LeagueStandings
            teams={leagueTeamsData?.leagueTeams || []}
            loading={leagueTeamsLoading}
            userTeamId={userTeamId}
          />
        </YStack>
      )}
      {activeTab === 'commissioner' &&
        isCommissioner &&
        renderCommissionerSettings()}
    </YStack>
  );
}

export default LeagueDetailPage;

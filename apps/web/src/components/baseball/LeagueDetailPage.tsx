import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Card, H1, H2, Spinner, Text } from 'tamagui';
import { Check, Copy } from '@tamagui/lucide-icons';
import { gql, useLazyQuery } from '@apollo/client';
import { LeagueScoringSummary } from './LeagueScoringSummary';
import { LeagueScoringEditor } from './LeagueScoringEditor';
import { env } from '../../config/environment';
import {
  LeagueFragment,
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useUpdateTeamMemberPositionMutation,
} from '../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../roster/LeagueRosterManagement';
import { LeagueStandings } from '../roster/LeagueStandings';
import { useLeagueScoringSettings } from '../../lib/scoring';
import { NextStepControl } from '../commissioner/NextStepControl';
import { DeleteLeagueControl } from '../commissioner/DeleteLeagueControl';
import { useCurrentMatchup } from '../../hooks/useMatchup';
import { MatchupScoreboard } from '../matchup/MatchupScoreboard';
import { GamesRemaining } from '../matchup/GamesRemaining';
import { MatchupRosterComparison } from '../matchup/MatchupRosterComparison';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setIsCommissioner,
  setLeagueData,
  setLeagueId,
  setLeaguePositions,
  setLeagueTeams,
  setTeamMembers,
  setTeamsLoading,
  setUserTeamId,
} from '../../store/leagueSlice';

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

export function LeagueDetailPage(): React.JSX.Element {
  const { id, tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const leagueId = parseInt(id || '0', 10);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Redux state
  const {
    leagueData: reduxLeagueData,
    positions: reduxPositions,
    teamMembers: reduxTeamMembers,
    leagueTeams: reduxLeagueTeams,
    userTeamId: reduxUserTeamId,
    isCommissioner: reduxIsCommissioner,
  } = useAppSelector((state) => state.league);

  // Get initial tab from URL or default to 'info'
  const getTabFromUrl = useCallback(():
    | 'info'
    | 'roster'
    | 'commissioner'
    | 'standings'
    | 'matchup' => {
    const validTabs = [
      'info',
      'roster',
      'commissioner',
      'standings',
      'matchup',
    ] as const;
    if (
      tabParam &&
      validTabs.includes(tabParam as (typeof validTabs)[number])
    ) {
      return tabParam as (typeof validTabs)[number];
    }
    return 'info';
  }, [tabParam]);

  const [activeTab, setActiveTab] = useState<
    'info' | 'roster' | 'commissioner' | 'standings' | 'matchup'
  >(getTabFromUrl());
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const { user } = useAuth();

  // Initialize Redux state when league changes
  useEffect(() => {
    if (!isNaN(leagueId)) {
      dispatch(setLeagueId(leagueId));
    }
  }, [leagueId, dispatch]);

  // Update active tab when URL changes (e.g., back/forward navigation)
  useEffect(() => {
    const tabFromUrl = getTabFromUrl();
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [getTabFromUrl, activeTab]);

  // Helper function to change tab and update URL
  const changeTab = useCallback(
    (newTab: 'info' | 'roster' | 'commissioner' | 'standings' | 'matchup') => {
      setActiveTab(newTab);
      navigate(`/baseball/league/${leagueId}/${newTab}`, { replace: false });
    },
    [navigate, leagueId],
  );

  // Fetch league data only if not in Redux
  const { data, loading, error } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId) || !!reduxLeagueData,
    variables: { id: leagueId },
    notifyOnNetworkStatusChange: true,
    onCompleted: (data) => {
      if (data.league) {
        dispatch(setLeagueData(data.league));
        dispatch(setIsCommissioner(data.league.owner === user?.id));
      }
    },
  });

  // Fetch league positions only if not in Redux
  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      skip: isNaN(leagueId) || reduxPositions.length > 0,
      variables: { leagueId },
      onCompleted: (data) => {
        if (data.leaguePositions) {
          dispatch(
            setLeaguePositions(
              data.leaguePositions as LeaguePositionFragment[],
            ),
          );
        }
      },
    });

  // Use the proper userTeamId GraphQL query to get the user's team in this league
  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] =
    useLazyQuery(GET_USER_TEAM_ID, {
      onCompleted: (data) => {
        if (data.userTeamId !== undefined) {
          dispatch(setUserTeamId(data.userTeamId as number | null));
        }
      },
    });

  // Fetch league teams for standings
  const [
    getLeagueTeams,
    { data: leagueTeamsData, loading: leagueTeamsLoading },
  ] = useLazyQuery(GET_LEAGUE_TEAMS, {
    onCompleted: (data) => {
      if (data.leagueTeams) {
        dispatch(
          setLeagueTeams(
            data.leagueTeams as Array<{
              id: number;
              name: string;
              leagueId: number;
            }>,
          ),
        );
      }
    },
  });

  // Effect to fetch user's team ID when league ID changes (only if not in Redux)
  useEffect(() => {
    if (!isNaN(leagueId) && user?.id && reduxUserTeamId === null) {
      void getUserTeamId({
        variables: { leagueId },
      });
    }
  }, [leagueId, user?.id, reduxUserTeamId, getUserTeamId]);

  // Effect to fetch league teams when on standings tab (only if not in Redux)
  useEffect(() => {
    if (
      activeTab === 'standings' &&
      !isNaN(leagueId) &&
      reduxLeagueTeams.length === 0
    ) {
      dispatch(setTeamsLoading(true));
      void getLeagueTeams({
        variables: { leagueId },
      });
    }
  }, [activeTab, leagueId, reduxLeagueTeams.length, getLeagueTeams, dispatch]);

  // Use Redux data or fallback to GraphQL data
  const userTeamId = reduxUserTeamId ?? userTeamData?.userTeamId;
  const league = reduxLeagueData ?? data?.league;
  const positions =
    reduxPositions.length > 0
      ? reduxPositions
      : (positionsData?.leaguePositions as LeaguePositionFragment[]) || [];
  const leagueTeams =
    reduxLeagueTeams.length > 0
      ? reduxLeagueTeams
      : leagueTeamsData?.leagueTeams || [];
  const isCommissioner = reduxIsCommissioner || league?.owner === user?.id;

  // Fetch team members only if not in Redux
  const { data: teamMembersData, loading: teamMembersLoading } =
    useGetTeamMembersQuery({
      skip: !userTeamId || reduxTeamMembers.length > 0,
      variables: {
        teamId: userTeamId || 0,
      },
      onCompleted: (data) => {
        if (data.teamMembers) {
          dispatch(
            setTeamMembers(
              data.teamMembers.filter(
                (m) => m !== null,
              ) as TeamMemberFragment[],
            ),
          );
        }
      },
    });

  const teamMembers =
    reduxTeamMembers.length > 0
      ? reduxTeamMembers
      : (teamMembersData?.teamMembers?.filter(
          (m) => m !== null,
        ) as TeamMemberFragment[]) || [];

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
    profileName: scoringProfileName,
    profile: scoringProfile,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  // Fetch current matchup for commissioner tools
  const {
    matchup: currentMatchup,
    loading: matchupLoading,
    error: matchupError,
    refetch: refetchMatchup,
  } = useCurrentMatchup(!isNaN(leagueId) ? leagueId : null);

  // State for matchup operation messages
  const [matchupSuccessMessage, setMatchupSuccessMessage] = useState<
    string | null
  >(null);
  const [matchupErrorMessage, setMatchupErrorMessage] = useState<string | null>(
    null,
  );

  const handleMatchupSuccess = useCallback(
    (actionType?: 'selectGame' | 'advance' | 'draft' | 'createWeek1') => {
      if (actionType === 'draft') {
        setMatchupSuccessMessage(
          'Draft started successfully! You can now create Week 1 matchups.',
        );
      } else if (actionType === 'createWeek1') {
        setMatchupSuccessMessage('Week 1 matchups created successfully!');
      } else if (actionType === 'advance') {
        setMatchupSuccessMessage(
          'Week advanced successfully! New matchups created.',
        );
      } else {
        setMatchupSuccessMessage(
          'Game selection triggered! Processing in background...',
        );
      }
      setMatchupErrorMessage(null);
      void refetchMatchup();
      setTimeout(() => setMatchupSuccessMessage(null), 5000);
    },
    [refetchMatchup],
  );

  const handleMatchupError = useCallback((err: Error) => {
    setMatchupErrorMessage(err.message);
    setMatchupSuccessMessage(null);
  }, []);

  const handleLeagueUpdate = useCallback(
    (updatedLeague: LeagueFragment) => {
      // Update Redux state with the league data from mutation response
      dispatch(setLeagueData(updatedLeague));
    },
    [dispatch],
  );

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

  if (error || !league) {
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
      {/* Success/Error Messages */}
      {matchupSuccessMessage && (
        <Card backgroundColor="$green3" borderColor="$green8" padding="$3">
          <Text color="$green11" fontWeight="bold">
            {matchupSuccessMessage}
          </Text>
        </Card>
      )}

      {matchupErrorMessage && (
        <Card backgroundColor="$red3" borderColor="$red8" padding="$3">
          <Text color="$red11" fontWeight="bold">
            Error: {matchupErrorMessage}
          </Text>
        </Card>
      )}

      {/* Matchup Management */}
      {matchupLoading ? (
        <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
          <YStack space="$3" alignItems="center">
            <Spinner size="large" />
            <Text color="$gray11">Loading matchup data...</Text>
          </YStack>
        </Card>
      ) : matchupError ? (
        <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
          <Text color="$red11">
            Error loading matchup: {matchupError.message}
          </Text>
        </Card>
      ) : (
        <NextStepControl
          leagueId={leagueId}
          currentMatchup={currentMatchup}
          gamesPerMatchup={currentMatchup?.gamesPerMatchup ?? 1}
          draftStatus={league.draftStatus}
          onSuccess={handleMatchupSuccess}
          onError={handleMatchupError}
          onLeagueUpdate={handleLeagueUpdate}
        />
      )}

      <LeagueScoringEditor
        leagueId={leagueId}
        profile={scoringProfile}
        loading={scoringLoading}
        error={scoringError}
        onRefetch={async () => {
          await refetchScoringProfile({ leagueId });
        }}
      />

      <DeleteLeagueControl
        leagueId={leagueId}
        leagueName={league.name ?? 'Unknown League'}
        onSuccess={() => {
          // Success message and redirect handled by DeleteLeagueControl
        }}
        onError={(error) => {
          console.error('Delete league error:', error);
          alert(`Error deleting league: ${error.message}`);
        }}
      />

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
          onPress={() => changeTab('info')}
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
          onPress={() => changeTab('roster')}
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
          onPress={() => changeTab('standings')}
          role="tab"
          id="tab-standings"
          aria-selected={activeTab === 'standings'}
          aria-controls="panel-standings"
        >
          Standings
        </Button>
        <Button
          size="$4"
          variant={activeTab === 'matchup' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'matchup' ? '$blue9' : '$gray6'}
          color={activeTab === 'matchup' ? 'white' : '$gray12'}
          onPress={() => changeTab('matchup')}
          role="tab"
          id="tab-matchup"
          aria-selected={activeTab === 'matchup'}
          aria-controls="panel-matchup"
        >
          Current Matchup
        </Button>
        {isCommissioner && (
          <Button
            size="$4"
            variant={activeTab === 'commissioner' ? 'primary' : 'secondary'}
            backgroundColor={activeTab === 'commissioner' ? '$blue9' : '$gray6'}
            color={activeTab === 'commissioner' ? 'white' : '$gray12'}
            onPress={() => changeTab('commissioner')}
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
            teams={leagueTeams}
            loading={leagueTeamsLoading}
            userTeamId={userTeamId}
          />
        </YStack>
      )}
      {activeTab === 'matchup' && (
        <YStack
          role="tabpanel"
          id="panel-matchup"
          aria-labelledby="tab-matchup"
          space="$4"
        >
          {matchupLoading ? (
            <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
              <YStack space="$3" alignItems="center">
                <Spinner size="large" />
                <Text color="$gray11">Loading matchup...</Text>
              </YStack>
            </Card>
          ) : matchupError ? (
            <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
              <Text color="$red11">
                Error loading matchup: {matchupError.message}
              </Text>
            </Card>
          ) : currentMatchup ? (
            <>
              <MatchupScoreboard
                matchup={currentMatchup}
                gamesRemaining={
                  (currentMatchup.gamesPerMatchup ?? 0) -
                  (currentMatchup.selectedGamesCount ?? 0)
                }
              />

              <MatchupRosterComparison matchup={currentMatchup} />

              {currentMatchup.gamesPerMatchup && (
                <GamesRemaining
                  gamesRemaining={
                    (currentMatchup.gamesPerMatchup ?? 0) -
                    (currentMatchup.selectedGamesCount ?? 0)
                  }
                  totalGames={currentMatchup.gamesPerMatchup}
                />
              )}
              <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
                <YStack space="$2">
                  <Text fontSize="$4" fontWeight="bold" color="$blue11">
                    Matchup Information
                  </Text>
                  <YStack space="$1">
                    <Text fontSize="$3" color="$gray11">
                      Week: {currentMatchup.weekNumber}
                    </Text>
                    {currentMatchup.startTime && (
                      <Text fontSize="$3" color="$gray11">
                        Start:{' '}
                        {new Date(currentMatchup.startTime).toLocaleString()}
                      </Text>
                    )}
                    {currentMatchup.endTime && (
                      <Text fontSize="$3" color="$gray11">
                        End: {new Date(currentMatchup.endTime).toLocaleString()}
                      </Text>
                    )}
                  </YStack>
                </YStack>
              </Card>
            </>
          ) : (
            <Card backgroundColor="$gray2" borderColor="$gray6" padding="$4">
              <Text color="$gray11" fontSize="$4">
                No active matchup found. Commissioner can create one in the
                Commissioner tab.
              </Text>
            </Card>
          )}
        </YStack>
      )}
      {activeTab === 'commissioner' &&
        isCommissioner &&
        renderCommissionerSettings()}
    </YStack>
  );
}

export default LeagueDetailPage;

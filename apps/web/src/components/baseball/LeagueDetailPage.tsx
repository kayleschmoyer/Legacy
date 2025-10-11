import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Button, 
  Card, 
  useAuth, 
  XStack,
  YStack
} from '@legacy-sports/shared-components';
import { H1, H2, Spinner, Text } from 'tamagui';
import { gql, useLazyQuery } from '@apollo/client';
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

// Manual GraphQL query for getting user's team ID in a league
const GET_USER_TEAM_ID = gql`
  query GetUserTeamId($leagueId: Int!) {
    userTeamId(leagueId: $leagueId)
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
      return status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
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
  const [activeTab, setActiveTab] = useState<'info' | 'roster' | 'commissioner'>('info');
  const { user } = useAuth();

  const { data, loading, error } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId },
    notifyOnNetworkStatusChange: true,
    onCompleted: (queryData) => {
      console.log('📥 League query completed:', queryData?.league);
    },
    onError: (queryError) => {
      console.error('📥 League query error:', queryError);
    }
  });

  // Debug logging for league data
  console.log('🏟️ LeagueDetailPage render:', {
    leagueId,
    loading,
    error: error?.message,
    leagueData: data?.league,
    draftStatus: data?.league?.draftStatus,
    user: user ? { id: user.id, accessLevel: user.accessLevel } : null
  });

  // Fetch league positions for roster management
  const { data: positionsData, loading: positionsLoading } = useGetPositionsForLeagueQuery({
    skip: isNaN(leagueId),
    variables: { leagueId }
  });

  // Use the proper userTeamId GraphQL query to get the user's team in this league
  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] = useLazyQuery(GET_USER_TEAM_ID);
  
  // Effect to fetch user's team ID when league ID changes
  useEffect(() => {
    if (!isNaN(leagueId) && user?.id) {
      void getUserTeamId({
        variables: { leagueId },
        onCompleted: (data) => {
          console.log('🏀 User team ID query completed:', data);
        },
        onError: (error) => {
          console.error('🚨 User team ID query error:', error);
        }
      });
    }
  }, [leagueId, user?.id, getUserTeamId]);

  const userTeamId = userTeamData?.userTeamId;
  const { data: teamMembersData, loading: teamMembersLoading } = useGetTeamMembersQuery({
    skip: !userTeamId,
    variables: {
      teamId: userTeamId || 0,
    },
  });

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  // StartDraft mutation - now returns League object, eliminating need for manual refetch
  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    onCompleted: (data) => {
      console.log('✅ Draft mutation completed successfully:', data);
      console.log('🎯 Returned League object with updated status:', data.startDraft);
      console.log('📊 Updated draft status:', data.startDraft?.draftStatus);
      console.log('🚀 Apollo Client cache automatically updated - no manual refetch needed!');
      alert('Draft has been started and queued for processing!');
    },
    onError: (error) => {
      console.error('❌ Error starting draft:', error);
      console.error('📋 GraphQL errors:', error.graphQLErrors);
      console.error('🌐 Network error:', error.networkError);
      console.error('🔍 Full error object:', error);
      alert(`Failed to start draft: ${error.message}`);
    },
  });

  // Check if user is league owner/commissioner
  const isCommissioner = useMemo(() => {
    if (!data?.league || !user) return false;
    return data.league.owner === user.id || user.accessLevel === 'admin';
  }, [data?.league, user]);

  const handleStartDraft = useCallback(() => {
    console.log('🚀 handleStartDraft called');
    console.log('👤 User:', user);
    console.log('🏆 League owner:', data?.league?.owner);
    console.log('⚖️ Is commissioner:', isCommissioner);
    console.log('📊 Current draft status:', data?.league?.draftStatus);
    
    if (!isCommissioner) {
      console.log('❌ User is not a commissioner');
      alert('Only league commissioners can start drafts.');
      return;
    }

    if (window.confirm('Are you sure you want to start the draft? This will randomly assign players to all teams.')) {
      console.log('✅ User confirmed, calling startDraft mutation');
      console.log('🎯 Variables:', { leagueId, draftType: 'random-draft' });
      
      void startDraft({
        variables: {
          leagueId: leagueId,
          draftType: 'random-draft'
        }
      });
    } else {
      console.log('❌ User cancelled draft start');
    }
  }, [startDraft, leagueId, isCommissioner, user, data?.league]);

  const handlePlayerAssign = useCallback(async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
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
  }, [updateTeamMemberPosition]);

  const handlePlayerRemove = useCallback(async (position: LeaguePositionFragment) => {
    try {
      // Find the player assigned to this position
      const assignedPlayer = teamMembersData?.teamMembers?.find(
        member => member?.positionId === position.id
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
  }, [updateTeamMemberPosition, teamMembersData?.teamMembers]);

  if (loading || positionsLoading || teamMembersLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Spinner size="large" />
        <Text marginTop="$4" color="$gray10">Loading league...</Text>
      </YStack>
    );
  }

  if (error || !data?.league) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$red10" fontSize="$5" textAlign="center">
          {error ? `Error: ${error.message}` : `League not found`}
        </Text>
        <Button 
          marginTop="$4"
          onPress={() => window.history.back()}
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
    <YStack space="$4">
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
              <Text color="$gray12" fontWeight="600">User {league.owner}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Max Roster:</Text>
              <Text color="$gray12" fontWeight="600">{league.maxRosterSize} players</Text>
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
              <Text color="$gray12" fontWeight="600">{positions.length}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Players:</Text>
              <Text color="$gray12" fontWeight="600">{teamMembers.length}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text color="$gray11">Assigned:</Text>
              <Text color="$gray12" fontWeight="600">
                {teamMembers.filter(p => p?.positionId).length}
              </Text>
            </XStack>
          </YStack>
        </Card>
      </XStack>

      {/* Development Notice */}
      <Card 
        backgroundColor="$yellow2"
        borderColor="$yellow6"
        padding="$4"
      >
        <H2 size="$5" color="$yellow11" marginBottom="$2">
          � League Features
        </H2>
        <Text color="$yellow11">
          Use the "My Roster" tab to manage your team's lineup and player positions. 
          Additional league features like standings, member management, and draft tools are coming soon.
        </Text>
      </Card>
    </YStack>
  );

  const renderRosterManagement = () => (
    <LeagueRosterManagement
      positions={positions}
      teamPlayers={teamMembers}
      onPlayerAssign={(player, position) => void handlePlayerAssign(player, position)}
      onPlayerRemove={(player) => void handlePlayerRemove(player)}
      loading={positionsLoading || teamMembersLoading || userTeamLoading}
    />
  );

  const renderCommissionerSettings = () => (
    <YStack space="$4">
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3">
          <H2 size="$6" color="$blue11">Draft Management</H2>
          <Text color="$gray11" fontSize="$4">
            Start a random draft to automatically assign players to all teams in the league.
          </Text>
          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <YStack flex={1} minWidth={300}>
              <Text fontSize="$5" fontWeight="600" color="$blue11" marginBottom="$2">
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
              opacity={(startDraftLoading || !canStartDraft(league.draftStatus)) ? 0.6 : 1}
              minWidth={140}
              size="$4"
            >
              {getDraftButtonText(league.draftStatus, startDraftLoading)}
            </Button>
          </XStack>
        </YStack>
      </Card>

      <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$4">
        <YStack space="$3">
          <H2 size="$5" color="$yellow11">
            <span role="img" aria-label="Warning">⚠️</span> Commissioner Features
          </H2>
          <Text color="$yellow11" fontSize="$4">
            Additional commissioner features like member management, league settings, 
            and advanced draft options are coming soon.
          </Text>
        </YStack>
      </Card>
    </YStack>
  );

  return (
    <YStack flex={1} padding="$6" maxWidth={1200} alignSelf="center" width="100%">
      {/* Header */}
      <YStack marginBottom="$6">
        <H1 size="$9" color="$blue11" marginBottom="$2">
          {league.name}
        </H1>
        <Text color="$gray10" fontSize="$4">
          League ID: {league.id} • Max Roster Size: {league.maxRosterSize}
        </Text>
      </YStack>

      {/* Tab Navigation */}
      <XStack marginBottom="$4" gap="$2">
        <Button
          size="$4"
          variant={activeTab === 'info' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'info' ? '$blue9' : '$gray6'}
          color={activeTab === 'info' ? 'white' : '$gray12'}
          onPress={() => setActiveTab('info')}
        >
          League Info
        </Button>
        <Button
          size="$4"
          variant={activeTab === 'roster' ? 'primary' : 'secondary'}
          backgroundColor={activeTab === 'roster' ? '$blue9' : '$gray6'}
          color={activeTab === 'roster' ? 'white' : '$gray12'}
          onPress={() => setActiveTab('roster')}
        >
          My Roster
        </Button>
        {isCommissioner && (
          <Button
            size="$4"
            variant={activeTab === 'commissioner' ? 'primary' : 'secondary'}
            backgroundColor={activeTab === 'commissioner' ? '$blue9' : '$gray6'}
            color={activeTab === 'commissioner' ? 'white' : '$gray12'}
            onPress={() => setActiveTab('commissioner')}
          >
            Commissioner
          </Button>
        )}
      </XStack>

      {/* Tab Content */}
      {activeTab === 'info' && renderLeagueInfo()}
      {activeTab === 'roster' && renderRosterManagement()}
      {activeTab === 'commissioner' && isCommissioner && renderCommissionerSettings()}

      {/* Back Button */}
      <XStack justifyContent="center" marginTop="$6">
        <Button 
          backgroundColor="$gray9"
          onPress={() => window.history.back()}
        >
          <Text color="white">Back to Leagues</Text>
        </Button>
      </XStack>
    </YStack>
  );
}

export default LeagueDetailPage;

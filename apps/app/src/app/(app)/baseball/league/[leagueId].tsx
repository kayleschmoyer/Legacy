/* eslint-disable */
import { useGlobalSearchParams, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderTitleProps } from '@react-navigation/elements';
import { Button, Card, H3, Spinner, Text, XStack, YStack } from 'tamagui';
import { Tabs } from '@tamagui/tabs';
import { Alert } from 'react-native';
import { gql, useLazyQuery } from '@apollo/client';
import {
  LeaguePositionFragment,
  StartDraftMutation,
  TeamMemberFragment,
  useStartDraftMutation,
} from '../../../../api/db/graphql.generated';
import { useGetLeagueByIdQuery } from '../../../../api/db/leagues/Leagues.generated';
import { useGetPositionsForLeagueQuery } from '../../../../api/db/leagues/Leagues.generated';
import { 
  useGetTeamMembersQuery, 
  useUpdateTeamMemberPositionMutation 
} from '../../../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';

// Manual GraphQL query for getting user's team ID in a league
const GET_USER_TEAM_ID = gql`
  query GetUserTeamId($leagueId: Int!) {
    userTeamId(leagueId: $leagueId)
  }
`;

// Note: START_DRAFT_MUTATION is available via useStartDraftMutation from generated file if needed

export default function LeagueId(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const [selectedTab, setSelectedTab] = useState('roster');
  const userInfo = useAuthorizedUserInfo();

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
        ? leagueId[0]
        : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  // Fetch league data
  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  // Fetch league positions
  const { data: positionsData, loading: positionsLoading } = useGetPositionsForLeagueQuery({
    skip: isNaN(numLeagueId),
    variables: {
      leagueId: numLeagueId,
    },
  });

  // Get current user info to determine their team in this league
  const currentUser = useAuthorizedUserInfo();
  
  // Use the proper userTeamId GraphQL query to get the user's team in this league
  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] = useLazyQuery(GET_USER_TEAM_ID);
  
  // Effect to fetch user's team ID when league ID changes
  useEffect(() => {
    if (!isNaN(numLeagueId) && userInfo?.id) {
      getUserTeamId({
        variables: { leagueId: numLeagueId },
        onCompleted: (data) => {
          console.log('🏀 User team ID query completed:', data);
        },
        onError: (error) => {
          console.error('🚨 User team ID query error:', error);
        }
      });
    }
  }, [numLeagueId, userInfo?.id, getUserTeamId]);

  const userTeamId = userTeamData?.userTeamId;
  console.log('🔍 Debug team data:', {
    leagueData: leagueData?.league,
    userTeamId,
    userInfo,
    message: 'Using proper userTeamId GraphQL query'
  });
  
  const { data: teamMembersData, loading: teamMembersLoading } = useGetTeamMembersQuery({
    skip: !userTeamId,
    variables: {
      teamId: userTeamId || 0,
    },
    onCompleted: (data) => {
      console.log('🏀 Team members query completed:', data);
    },
    onError: (error) => {
      console.error('🚨 Team members query error:', error);
    }
  });

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  // StartDraft mutation - now returns League object, eliminating need for manual refetch
  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    onCompleted: (data: StartDraftMutation) => {
      console.log('✅ Draft mutation completed successfully:', data);
      console.log('🎯 Returned League object with updated status:', data.startDraft);
      console.log('📊 Updated draft status:', data.startDraft?.draftStatus);
      console.log('🚀 Apollo Client cache automatically updated - no manual refetch needed!');
      Alert.alert('Success', 'Draft has been started and queued for processing!');
    },
    onError: (error: any) => {
      console.error('Error starting draft:', error);
      Alert.alert('Error', error.message || 'Failed to start draft');
    },
  });

  // Check if user is league owner/commissioner
  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);

  const handleStartDraft = useCallback(() => {
    if (!isCommissioner) {
      Alert.alert('Permission Denied', 'Only league commissioners can start drafts.');
      return;
    }

    Alert.alert(
      'Start Draft',
      'Are you sure you want to start the draft? This will randomly assign players to all teams.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Draft',
          style: 'default',
          onPress: () => {
            startDraft({
              variables: {
                leagueId: numLeagueId,
                draftType: 'random-draft'
              }
            });
          }
        }
      ]
    );
  }, [startDraft, numLeagueId, isCommissioner]);

  const handlePlayerAssign = useCallback(async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
    try {
      await updateTeamMemberPosition({
        variables: {
          teamMemberId: player.id,
          positionId: position.id,
        },
      });
    } catch (error) {
      handleError(error);
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
      handleError(error);
    }
  }, [updateTeamMemberPosition, teamMembersData]);

  if (leagueLoading) {
    return <Spinner />;
  }

  const league = leagueData?.league;
  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <YStack flex={1}>
      <Tabs value={selectedTab} onValueChange={setSelectedTab} flexDirection="column" flex={1}>
        <Tabs.List backgroundColor="$background" paddingHorizontal="$4">
          <Tabs.Tab value="roster" flex={1}>
            <Text>My Roster</Text>
          </Tabs.Tab>
          <Tabs.Tab value="standings" flex={1}>
            <Text>Standings</Text>
          </Tabs.Tab>
          {isCommissioner && (
            <Tabs.Tab value="commissioner" flex={1}>
              <Text>Commissioner</Text>
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Content value="roster" flex={1}>
          <LeagueRosterManagement
            positions={positionsData?.leaguePositions || []}
            teamPlayers={teamMembersData?.teamMembers?.filter(member => member !== null) as TeamMemberFragment[] || []}
            onPlayerAssign={handlePlayerAssign}
            onPlayerRemove={handlePlayerRemove}
            loading={positionsLoading || teamMembersLoading || userTeamLoading}
          />
        </Tabs.Content>

        <Tabs.Content value="standings" flex={1}>
          <YStack padding="$4">
            <H3 marginBottom="$3">League Standings</H3>
            <Text color="$gray10">Standings feature coming soon...</Text>
          </YStack>
        </Tabs.Content>

        {isCommissioner && (
          <Tabs.Content value="commissioner" flex={1}>
            <YStack padding="$4" space="$4">
              <H3 marginBottom="$3">Commissioner Settings</H3>
              
              <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
                <YStack space="$3">
                  <Text fontSize="$5" fontWeight="600" color="$blue11">
                    Draft Management
                  </Text>
                  <Text color="$gray11" fontSize="$3">
                    Start a random draft to automatically assign players to all teams in the league.
                  </Text>
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack flex={1}>
                      <Text fontSize="$4" fontWeight="500">Random Draft</Text>
                      <Text fontSize="$2" color="$gray10">
                        Randomly assigns players to roster positions
                      </Text>
                    </YStack>
                    <Button
                      backgroundColor="$blue9"
                      color="white"
                      onPress={handleStartDraft}
                      disabled={startDraftLoading}
                      opacity={startDraftLoading ? 0.6 : 1}
                      minWidth={120}
                    >
                      {startDraftLoading ? 'Starting...' : 'Start Draft'}
                    </Button>
                  </XStack>
                </YStack>
              </Card>

              <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$4">
                <YStack space="$2">
                  <Text fontSize="$4" fontWeight="600" color="$yellow11">
                    ⚠️ Commissioner Features
                  </Text>
                  <Text color="$yellow11" fontSize="$3">
                    Additional commissioner features like member management, league settings, and advanced draft options are coming soon.
                  </Text>
                </YStack>
              </Card>
            </YStack>
          </Tabs.Content>
        )}
      </Tabs>
    </YStack>
  );
}

export function LeagueIdHeader(props: HeaderTitleProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useGlobalSearchParams();
  const leagueId = params.leagueId;

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
        ? leagueId[0]
        : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  const { data } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  return <H3>{data ? data.league?.name : ''}</H3>;
}

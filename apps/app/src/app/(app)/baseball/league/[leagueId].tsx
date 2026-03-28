/* eslint-disable no-restricted-imports, no-restricted-syntax, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-promises -- legacy file with inline gql queries and unsafe types pending refactor */
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderTitleProps } from '@react-navigation/elements';
import { Button, Card, H3, Spinner, Text, XStack, YStack } from 'tamagui';
import { Tabs } from '@tamagui/tabs';
import { Alert, ScrollView, Share } from 'react-native';
import { gql } from '@apollo/client';

import { useLazyQuery } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  CommissionerAuditLog,
  CommissionerNoteControl,
  DeleteLeagueControl,
  LeagueActivityFeed,
  LeagueTradeBlock,
  PendingTradeOffers,
  useWebSocket,
} from '@legacy-sports/shared-components';
import {
  LeaguePositionFragment,
  StartDraftMutation,
  TeamMemberFragment,
  useStartDraftMutation,
} from '../../../../api/db/graphql.generated';
import {
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
} from '../../../../api/db/graphql.generated';
import {
  useGetTeamMembersQuery,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { LeagueStandings } from '../../../../features/roster/LeagueStandings';
import { LeagueChatTab } from '../../../../features/leagues/LeagueChatTab';
import { LeagueScoringEditor } from '../../../../features/scoring/LeagueScoringEditor';
import { LeagueDuesSetup } from '../../../../features/commissioner/LeagueDuesSetup';
import { MatchupList } from '../../../../features/matchup/components/MatchupList';
import { useMatchupsForLeague } from '../../../../features/matchup/hooks/useMatchup';
import { useLeagueScoringSettings } from '../../../../common/scoring';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';
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

// Note: START_DRAFT_MUTATION is available via useStartDraftMutation from generated file if needed

export default function LeagueId(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('overview');
  const userInfo = useAuthorizedUserInfo();
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

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
        ? leagueId[0]
        : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  // Fetch league data
  // Fetch matchups for the league
  const { matchups: rawMatchups, loading: matchupsLoading } =
    useMatchupsForLeague(isNaN(numLeagueId) ? null : numLeagueId);

  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  // Fetch league positions
  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      skip: isNaN(numLeagueId),
      variables: {
        leagueId: numLeagueId,
      },
    });

  // Get current user info to determine their team in this league
  const currentUser = useAuthorizedUserInfo();

  // Use the proper userTeamId GraphQL query to get the user's team in this league
  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] =
    useLazyQuery(GET_USER_TEAM_ID);

  // Effect to fetch user's team ID when league ID changes
  useEffect(() => {
    if (!isNaN(numLeagueId) && userInfo?.id) {
      getUserTeamId({
        variables: { leagueId: numLeagueId },
        onError: (error) => {
          LOGGER.error('User team ID query error:', String(error));
        },
      });
    }
  }, [numLeagueId, userInfo?.id, getUserTeamId]);

  const userTeamId = userTeamData?.userTeamId;

  // Sort matchups so the user's matchup is always first
  const matchups = useMemo(() => {
    if (!userTeamId) return rawMatchups;
    return [...rawMatchups].sort((a, b) => {
      const aIsUser =
        a.team1Id === userTeamId || a.team2Id === userTeamId ? 1 : 0;
      const bIsUser =
        b.team1Id === userTeamId || b.team2Id === userTeamId ? 1 : 0;
      return bIsUser - aIsUser;
    });
  }, [rawMatchups, userTeamId]);

  const { data: teamMembersData, loading: teamMembersLoading } =
    useGetTeamMembersQuery({
      skip: !userTeamId,
      variables: {
        teamId: userTeamId || 0,
      },
      onError: (error) => {
        LOGGER.error('Team members query error:', String(error));
      },
    });

  // Fetch league teams for standings
  const [
    getLeagueTeams,
    { data: leagueTeamsData, loading: leagueTeamsLoading },
  ] = useLazyQuery(GET_LEAGUE_TEAMS);

  // Effect to fetch league teams when on standings tab
  useEffect(() => {
    if (selectedTab === 'standings' && !isNaN(numLeagueId)) {
      getLeagueTeams({
        variables: { leagueId: numLeagueId },
        onError: (error) => {
          LOGGER.error(
            'Error fetching league teams',
            error instanceof Error ? error : new Error(String(error)),
          );
        },
      });
    }
  }, [selectedTab, numLeagueId, getLeagueTeams]);

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  // StartDraft mutation - with refetchQueries to ensure UI updates
  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    refetchQueries: ['GetLeagueById'],
    awaitRefetchQueries: true,
    onCompleted: (_data: StartDraftMutation) => {
      Alert.alert(
        'Success',
        'Draft has been started and queued for processing!',
      );
    },
    onError: (error: any) => {
      LOGGER.error('Error starting draft:', String(error));
      Alert.alert('Error', error.message || 'Failed to start draft');
    },
  });

  // Check if user is league owner/commissioner
  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);

  // Fetch league scoring settings for commissioner scoring editor
  const {
    profile: scoringProfile,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(numLeagueId);

  const league = leagueData?.league;

  // WebSocket for live league updates
  const wsUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;
  const { connected: _wsConnected } = useWebSocket({
    url: wsUrl ?? undefined,
    token: wsToken,
    leagueId: isNaN(numLeagueId) ? undefined : numLeagueId,
    viewContext: 'league',
    autoConnect: !isNaN(numLeagueId) && !!wsUrl && !!wsToken,
    onRosterUpdate: () => {
      // Trigger refetches on roster updates
    },
    onDraftCompleted: () => {
      Alert.alert('Draft Complete', 'The draft has finished!');
    },
  });

  // Invite/share handler
  const handleInviteShare = useCallback(async () => {
    const leagueName = league?.name ?? 'Legacy Sports League';
    const inviteCode = league?.inviteCode ?? '';
    const message = inviteCode
      ? `Join my league "${leagueName}" on Legacy Sports! Use invite code: ${inviteCode}`
      : `Join my league "${leagueName}" on Legacy Sports!`;
    try {
      const result = await Share.share({
        message,
        title: `Join ${leagueName}`,
      });
      if (result.action === Share.dismissedAction) {
        LOGGER.debug('Share dismissed by user');
      }
    } catch (error: unknown) {
      LOGGER.error(
        'Error while sharing league invite',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, [league?.name, league?.inviteCode]);

  const handleStartDraft = useCallback(() => {
    if (!isCommissioner) {
      Alert.alert(
        'Permission Denied',
        'Only league commissioners can start drafts.',
      );
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
                selectionMethod: 'random',
              },
            });
          },
        },
      ],
    );
  }, [startDraft, numLeagueId, isCommissioner]);

  const handlePlayerAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (typeof player.id !== 'number') {
        handleError(new Error('Missing team member identifier'));
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
        handleError(error);
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

        if (typeof assignedPlayer?.id === 'number') {
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
    },
    [updateTeamMemberPosition, teamMembersData],
  );

  if (leagueLoading) {
    return <Spinner />;
  }

  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <YStack flex={1}>
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        flexDirection="column"
        flex={1}
      >
        <Tabs.List
          backgroundColor="$background"
          paddingHorizontal="$2"
          flexWrap="wrap"
        >
          <Tabs.Tab value="overview" flex={1}>
            <Text fontSize="$2">Overview</Text>
          </Tabs.Tab>
          <Tabs.Tab value="roster" flex={1}>
            <Text fontSize="$2">Roster</Text>
          </Tabs.Tab>
          <Tabs.Tab value="matchups" flex={1}>
            <Text fontSize="$2">Matchups</Text>
          </Tabs.Tab>
          <Tabs.Tab value="trades" flex={1}>
            <Text fontSize="$2">Trades</Text>
          </Tabs.Tab>
          <Tabs.Tab value="standings" flex={1}>
            <Text fontSize="$2">Standings</Text>
          </Tabs.Tab>
          <Tabs.Tab value="chat" flex={1}>
            <Text fontSize="$2">Chat</Text>
          </Tabs.Tab>
          {isCommissioner && (
            <Tabs.Tab value="commissioner" flex={1}>
              <Text fontSize="$2">Settings</Text>
            </Tabs.Tab>
          )}
        </Tabs.List>

        {/* Overview Tab — Activity Feed, Invite, Quick Links */}
        <Tabs.Content value="overview" flex={1}>
          <ScrollView>
            <YStack padding="$3" space="$3">
              {/* Invite/Share */}
              <Card backgroundColor="$blue2" borderColor="$blue6" padding="$3">
                <XStack justifyContent="space-between" alignItems="center">
                  <YStack flex={1}>
                    <Text fontSize="$4" fontWeight="600">
                      Invite Friends
                    </Text>
                    <Text fontSize="$2" color="$gray11">
                      Share your league with friends
                    </Text>
                  </YStack>
                  <Button
                    size="$3"
                    backgroundColor="$blue9"
                    color="white"
                    onPress={() => void handleInviteShare()}
                  >
                    Share
                  </Button>
                </XStack>
              </Card>

              {/* Activity Feed */}
              <YStack>
                <Text fontSize="$5" fontWeight="600" marginBottom="$2">
                  Recent Activity
                </Text>
                <LeagueActivityFeed leagueId={numLeagueId} limit={15} />
              </YStack>
            </YStack>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="roster" flex={1}>
          <LeagueRosterManagement
            positions={positionsData?.leaguePositions || []}
            teamPlayers={
              (teamMembersData?.teamMembers?.filter(
                (member) => member !== null,
              ) as TeamMemberFragment[]) || []
            }
            onPlayerAssign={handlePlayerAssign}
            onPlayerRemove={handlePlayerRemove}
            loading={positionsLoading || teamMembersLoading || userTeamLoading}
          />
        </Tabs.Content>

        <Tabs.Content value="matchups" flex={1}>
          <MatchupList
            matchups={matchups}
            loading={matchupsLoading}
            emptyMessage="No matchups found for this league"
            onMatchupPress={(matchup) => {
              if (matchup.id != null) {
                router.navigate({
                  pathname: '/baseball/matchup',
                  params: {
                    matchupId: String(matchup.id),
                    leagueId: String(numLeagueId),
                  },
                });
              }
            }}
          />
        </Tabs.Content>

        {/* Trades Tab — Trade Block + Pending Offers */}
        <Tabs.Content value="trades" flex={1}>
          <ScrollView>
            <YStack padding="$3" space="$4">
              <YStack>
                <Text fontSize="$5" fontWeight="600" marginBottom="$2">
                  Trade Block
                </Text>
                <LeagueTradeBlock
                  leagueId={numLeagueId}
                  userTeamId={userTeamId}
                />
              </YStack>

              {userTeamId && (
                <YStack>
                  <Text fontSize="$5" fontWeight="600" marginBottom="$2">
                    Pending Trade Offers
                  </Text>
                  <PendingTradeOffers teamId={userTeamId} />
                </YStack>
              )}
            </YStack>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="standings" flex={1}>
          <LeagueStandings
            teams={leagueTeamsData?.leagueTeams || []}
            loading={leagueTeamsLoading}
            userTeamId={userTeamId}
          />
        </Tabs.Content>

        <Tabs.Content value="chat" flex={1}>
          <LeagueChatTab leagueId={numLeagueId} userInfo={userInfo} />
        </Tabs.Content>

        {isCommissioner && (
          <Tabs.Content value="commissioner" flex={1}>
            <ScrollView>
              <YStack padding="$4" space="$4">
                <H3 marginBottom="$3">Commissioner Settings</H3>

                {/* Commissioner Note */}
                <CommissionerNoteControl
                  leagueId={numLeagueId}
                  currentNote={league?.lmNotes ?? ''}
                  onSuccess={(msg) => Alert.alert('Success', msg)}
                  onError={(err) => Alert.alert('Error', err.message)}
                />

                {/* League Dues */}
                <LeagueDuesSetup
                  leagueId={numLeagueId}
                  onSuccess={(msg) => Alert.alert('Success', msg)}
                  onError={(err) => Alert.alert('Error', err.message)}
                />

                {/* Draft Management */}
                <Card
                  backgroundColor="$blue2"
                  borderColor="$blue6"
                  padding="$4"
                >
                  <YStack space="$3">
                    <Text fontSize="$5" fontWeight="600" color="$blue11">
                      Draft Management
                    </Text>
                    <Text color="$gray11" fontSize="$3">
                      Start a random draft to automatically assign players to
                      all teams in the league.
                    </Text>
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack flex={1}>
                        <Text fontSize="$4" fontWeight="500">
                          Random Draft
                        </Text>
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

                {/* Scoring Settings */}
                <LeagueScoringEditor
                  leagueId={numLeagueId}
                  profile={scoringProfile}
                  loading={scoringLoading}
                  error={scoringError}
                  onRefetch={async () => {
                    await refetchScoringProfile();
                  }}
                />

                {/* Audit Log */}
                <CommissionerAuditLog leagueId={numLeagueId} />

                {/* Danger Zone */}
                <DeleteLeagueControl
                  leagueId={numLeagueId}
                  leagueName={league?.name ?? ''}
                  onDeleted={() => {
                    Alert.alert(
                      'Deleted',
                      'League has been permanently deleted.',
                    );
                    router.navigate('/');
                  }}
                  onError={(err) => Alert.alert('Error', err.message)}
                />
              </YStack>
            </ScrollView>
          </Tabs.Content>
        )}
      </Tabs>
    </YStack>
  );
}

export function LeagueIdHeader(props: HeaderTitleProps): React.JSX.Element {
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

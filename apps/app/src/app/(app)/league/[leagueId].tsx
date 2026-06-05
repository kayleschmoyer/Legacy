import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import {
  Button,
  Card,
  H3,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Tabs } from '@tamagui/tabs';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import {
  CommissionerAuditLog,
  CommissionerNoteControl,
  DeleteLeagueControl,
  LeagueTradeBlock,
  PendingTradeOffers,
  PendingWaiverClaims,
  StandingsTable,
  useWebSocket,
} from '@legacy-sports/shared-components';
import {
  LeaguePositionFragment,
  StartDraftMutation,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useStartDraftMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../../../features/roster/LeagueRosterManagement';
import { LeagueChatTab } from '../../../features/leagues/LeagueChatTab';
import { LeagueScoringEditor } from '../../../features/scoring/LeagueScoringEditor';
import { LeagueDuesSetup } from '../../../features/commissioner/LeagueDuesSetup';
import { SalaryCapManagementCard } from '../../../features/commissioner/SalaryCapManagementCard';
import { MatchupList } from '../../../features/matchup/components/MatchupList';
import { useMatchupsForLeague } from '../../../features/matchup/hooks/useMatchup';
import { useLeagueScoringSettings } from '../../../common/scoring';
import { handleError } from '../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../common/auth/AuthHooks';
import { toIntId } from '../../../common/utilities/RouteUtils';
import { useStandings } from '../../../features/matchup/hooks/useStandings';
import { LeagueFreeAgents } from '../FreeAgents';

function LeagueTeamsTab({
  leagueId,
  sport,
}: {
  leagueId: number;
  sport: string | null | undefined;
}) {
  const router = useRouter();
  const { data, loading } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });
  const teams = data?.leagueTeams ?? [];

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner />
      </YStack>
    );
  }

  if (teams.length === 0) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$gray10" fontSize="$4" textAlign="center">
          No teams in this league yet.
        </Text>
      </YStack>
    );
  }

  const teamRoute =
    sport === 'football'
      ? '/football/team/[teamId]'
      : '/baseball/team/[teamId]';

  return (
    <ScrollView>
      <YStack padding="$3" gap="$2">
        {teams.map((team, idx) => (
          <Card
            key={team?.id ?? idx}
            backgroundColor="$gray2"
            borderRadius="$4"
            padding="$3"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => {
              if (team?.id != null) {
                router.push({
                  pathname: teamRoute,
                  params: { teamId: String(team.id) },
                });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`View roster for ${team?.name ?? 'Team'}`}
          >
            <Text fontSize="$4" fontWeight="600" color="$color">
              {team?.name ?? 'Unnamed Team'}
            </Text>
          </Card>
        ))}
      </YStack>
    </ScrollView>
  );
}

export default function LeagueContext(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('matchup');
  const userInfo = useAuthorizedUserInfo();
  const [wsToken, setWsToken] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (active && token) setWsToken(token);
      } catch (err: unknown) {
        LOGGER.error(
          'Failed to read WS token from keychain',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const numLeagueId = toIntId(leagueId) ?? NaN;

  const { matchups: rawMatchups, loading: matchupsLoading } =
    useMatchupsForLeague(isNaN(numLeagueId) ? null : numLeagueId);

  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: { id: numLeagueId },
  });

  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      skip: isNaN(numLeagueId),
      variables: { leagueId: numLeagueId },
    });

  const [
    getUserTeamId,
    { data: userTeamData, loading: userTeamLoading, error: userTeamError },
  ] = useGetUserTeamIdLazyQuery();

  useEffect(() => {
    if (userTeamError) LOGGER.error('User team ID query error:', userTeamError);
  }, [userTeamError]);

  useEffect(() => {
    if (!isNaN(numLeagueId) && userInfo?.id) {
      void getUserTeamId({ variables: { leagueId: numLeagueId } });
    }
  }, [numLeagueId, userInfo?.id, getUserTeamId]);

  const userTeamId = userTeamData?.userTeamId;

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

  const {
    data: teamMembersData,
    loading: teamMembersLoading,
    error: teamMembersError,
  } = useGetTeamMembersQuery({
    skip: !userTeamId,
    variables: { teamId: userTeamId || 0 },
  });

  useEffect(() => {
    if (teamMembersError)
      LOGGER.error('Team members query error:', teamMembersError);
  }, [teamMembersError]);

  const {
    standings,
    loading: standingsLoading,
    error: standingsError,
  } = useStandings(isNaN(numLeagueId) ? null : numLeagueId);

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    refetchQueries: ['GetLeagueById'],
    awaitRefetchQueries: true,
    onCompleted: (_data: StartDraftMutation) => {
      Alert.alert(
        'Success',
        'Draft has been started and queued for processing!',
      );
    },
    onError: (error) => {
      LOGGER.error('Error starting draft:', error);
      Alert.alert('Error', error.message || 'Failed to start draft');
    },
  });

  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);

  const {
    profile: scoringProfile,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(numLeagueId);

  const league = leagueData?.league;

  const wsUrl = config.websocketUrl;
  const { connected: _wsConnected } = useWebSocket({
    url: wsUrl ?? undefined,
    token: wsToken,
    leagueId: isNaN(numLeagueId) ? undefined : numLeagueId,
    viewContext: 'league',
    autoConnect: !isNaN(numLeagueId) && !!wsUrl && !!wsToken,
    onRosterUpdate: () => {
      // roster update events handled by Apollo cache
    },
    onDraftCompleted: () => {
      Alert.alert('Draft Complete', 'The draft has finished!');
    },
  });

  const sport: string =
    (league?.sport as string | null | undefined) ?? 'baseball';

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
            void startDraft({
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
          variables: { teamMemberId: player.id, positionId: position.id },
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
        const assignedPlayer = teamMembersData?.teamMembers?.find(
          (member) => member?.positionId === position.id,
        );
        if (typeof assignedPlayer?.id === 'number') {
          await updateTeamMemberPosition({
            variables: { teamMemberId: assignedPlayer.id, positionId: null },
          });
        }
      } catch (error) {
        handleError(error);
      }
    },
    [updateTeamMemberPosition, teamMembersData],
  );

  const matchupPathname =
    sport === 'football' ? '/football/matchup' : '/baseball/matchup';

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
          <Tabs.Tab value="matchup" flex={1}>
            <Text fontSize="$2">Matchup</Text>
          </Tabs.Tab>
          <Tabs.Tab value="roster" flex={1}>
            <Text fontSize="$2">My Team</Text>
          </Tabs.Tab>
          <Tabs.Tab value="players" flex={1}>
            <Text fontSize="$2">Players</Text>
          </Tabs.Tab>
          <Tabs.Tab value="freeagents" flex={1}>
            <Text fontSize="$2">Free Agents</Text>
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
            <Tabs.Tab value="manage" flex={1}>
              <Text fontSize="$2">Manage</Text>
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Content value="matchup" flex={1}>
          <MatchupList
            matchups={matchups}
            loading={matchupsLoading}
            emptyMessage="No matchups found for this league"
            onMatchupPress={(matchup) => {
              if (matchup.id != null) {
                router.navigate({
                  pathname: matchupPathname,
                  params: {
                    matchupId: String(matchup.id),
                    leagueId: String(numLeagueId),
                  },
                });
              }
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="roster" flex={1}>
          <LeagueRosterManagement
            positions={positionsData?.leaguePositions || []}
            teamPlayers={
              (teamMembersData?.teamMembers?.filter(
                (member): member is TeamMemberFragment => member !== null,
              ) as TeamMemberFragment[]) || []
            }
            onPlayerAssign={(player, position) => {
              void handlePlayerAssign(player, position);
            }}
            onPlayerRemove={(position) => {
              void handlePlayerRemove(position);
            }}
            loading={positionsLoading || teamMembersLoading || userTeamLoading}
          />
        </Tabs.Content>

        <Tabs.Content value="players" flex={1}>
          <LeagueTeamsTab leagueId={numLeagueId} sport={league.sport} />
        </Tabs.Content>

        <Tabs.Content value="freeagents" flex={1}>
          <LeagueFreeAgents
            leagueId={numLeagueId}
            leagueName={league.name ?? 'League'}
          />
        </Tabs.Content>

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
              {userTeamId && <PendingWaiverClaims teamId={userTeamId} />}
            </YStack>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="standings" flex={1}>
          <ScrollView>
            <YStack padding="$3">
              <StandingsTable
                standings={standings}
                loading={standingsLoading}
                error={standingsError}
              />
            </YStack>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="chat" flex={1}>
          <LeagueChatTab leagueId={numLeagueId} userInfo={userInfo} />
        </Tabs.Content>

        {isCommissioner && (
          <Tabs.Content value="manage" flex={1}>
            <ScrollView>
              <YStack padding="$4" space="$4">
                <H3 marginBottom="$3">Commissioner Settings</H3>

                <CommissionerNoteControl
                  leagueId={numLeagueId}
                  currentNote={league.lmNotes ?? ''}
                  onSuccess={(msg) => Alert.alert('Success', msg)}
                  onError={(err) => Alert.alert('Error', err.message)}
                />

                <LeagueDuesSetup
                  leagueId={numLeagueId}
                  onSuccess={(msg) => Alert.alert('Success', msg)}
                  onError={(err) => Alert.alert('Error', err.message)}
                />

                <SalaryCapManagementCard
                  leagueId={numLeagueId}
                  sport={sport === 'football' ? 'football' : 'baseball'}
                  salaryCapEnabled={league.salaryCapEnabled ?? false}
                  salaryCap={league.salaryCap ?? null}
                />

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
                    <Separator />
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack flex={1}>
                        <Text fontSize="$4" fontWeight="500">
                          Live Draft
                        </Text>
                        <Text fontSize="$2" color="$gray10">
                          Real-time snake or linear draft with pick timer
                        </Text>
                      </YStack>
                      <Button
                        backgroundColor="$green9"
                        color="white"
                        onPress={() =>
                          router.navigate({
                            pathname: '/DraftBoardPage',
                            params: { leagueId: String(numLeagueId) },
                          })
                        }
                        minWidth={120}
                      >
                        Live Draft
                      </Button>
                    </XStack>
                  </YStack>
                </Card>

                <LeagueScoringEditor
                  leagueId={numLeagueId}
                  profile={scoringProfile}
                  loading={scoringLoading}
                  error={scoringError}
                  onRefetch={async () => {
                    await refetchScoringProfile();
                  }}
                />

                <CommissionerAuditLog leagueId={numLeagueId} />

                <DeleteLeagueControl
                  leagueId={numLeagueId}
                  leagueName={league.name ?? ''}
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

export function LeagueContextHeader(_props: {
  tintColor?: string | object | null;
  children?: string;
}): React.JSX.Element {
  const params = useGlobalSearchParams();
  const leagueId = params.leagueId;
  const numLeagueId = toIntId(leagueId);

  const { data } = useGetLeagueByIdQuery({
    skip: numLeagueId === null,
    variables: { id: numLeagueId ?? 0 },
  });

  return <H3>{data?.league?.name ?? ''}</H3>;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

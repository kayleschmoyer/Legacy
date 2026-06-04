import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Alert, ScrollView, Share } from 'react-native';
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
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useStartDraftMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { LeagueChatTab } from '../../../../features/leagues/LeagueChatTab';
import { LeagueOverviewTab } from '../../../../features/leagues/LeagueOverviewTab';
import { useStandings } from '../../../../features/matchup/hooks/useStandings';
import { LeagueHistoryTab } from '../../../../features/leagues/LeagueHistoryTab';
import { LeagueScoringEditor } from '../../../../features/scoring/LeagueScoringEditor';
import { LeagueDuesSetup } from '../../../../features/commissioner/LeagueDuesSetup';
import { SalaryCapManagementCard } from '../../../../features/commissioner/SalaryCapManagementCard';
import { MatchupList } from '../../../../features/matchup/components/MatchupList';
import { useMatchupsForLeague } from '../../../../features/matchup/hooks/useMatchup';
import { useLeagueScoringSettings } from '../../../../common/scoring';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';
import { toIntId } from '../../../../common/utilities/RouteUtils';

export default function LeagueId(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('overview');
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

  const [
    getUserTeamId,
    { data: userTeamData, loading: userTeamLoading, error: userTeamError },
  ] = useGetUserTeamIdLazyQuery();

  useEffect(() => {
    if (userTeamError) LOGGER.error('User team ID query error:', userTeamError);
  }, [userTeamError]);

  // Effect to fetch user's team ID when league ID changes
  useEffect(() => {
    if (!isNaN(numLeagueId) && userInfo?.id) {
      void getUserTeamId({
        variables: { leagueId: numLeagueId },
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

  const {
    data: teamMembersData,
    loading: teamMembersLoading,
    error: teamMembersError,
  } = useGetTeamMembersQuery({
    skip: !userTeamId,
    variables: {
      teamId: userTeamId || 0,
    },
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
    onError: (error) => {
      LOGGER.error('Error starting draft:', error);
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
  const wsUrl = config.websocketUrl;
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
  const inviteCode = league?.inviteCode ?? '';
  const appBaseUrl = config.appBaseUrl ?? 'https://legacysports.app';
  const inviteUrl = inviteCode
    ? `${appBaseUrl}/baseball/league/join/${inviteCode}`
    : '';

  const handleInviteShare = useCallback(async () => {
    const leagueName = league?.name ?? 'Legacy Sports League';
    const message = inviteUrl
      ? `Join my league "${leagueName}" on Legacy Sports!\n\n${inviteUrl}`
      : `Join my league "${leagueName}" on Legacy Sports!`;
    try {
      const result = await Share.share({
        message,
        title: `Join ${leagueName}`,
        url: inviteUrl || undefined,
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
  }, [league?.name, inviteUrl]);

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

  const rankedStandings = useMemo(() => {
    const formatRecord = (
      w: number | null | undefined,
      l: number | null | undefined,
      t: number | null | undefined,
    ) => {
      const wn = w ?? 0;
      const ln = l ?? 0;
      const tn = t ?? 0;
      return tn > 0 ? `${wn}-${ln}-${tn}` : `${wn}-${ln}`;
    };
    return standings.map((s, idx) => ({
      rank: idx + 1,
      teamId: s.teamId ? Number(s.teamId) : null,
      name: s.teamName ?? 'Team',
      record: formatRecord(s.wins, s.losses, s.ties),
      isMine: s.teamId != null && Number(s.teamId) === userTeamId,
    }));
  }, [standings, userTeamId]);

  const draftStatus = league?.draftStatus ?? 'pre-draft';
  const isDrafting =
    draftStatus === 'in-progress' || draftStatus === 'drafting';
  const startersCount =
    teamMembersData?.teamMembers?.filter((m) => m?.positionId != null).length ??
    0;

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
          <Tabs.Tab value="history" flex={1}>
            <Text fontSize="$2">History</Text>
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

        {/* Overview Tab */}
        <Tabs.Content value="overview" flex={1}>
          <LeagueOverviewTab
            league={league}
            leagueId={numLeagueId}
            isCommissioner={isCommissioner}
            isDrafting={isDrafting}
            rankedStandings={rankedStandings}
            startersCount={startersCount}
            inviteCode={inviteCode}
            onJoinDraft={() =>
              router.navigate({
                pathname: '/DraftBoardPage' as never,
                params: { leagueId: String(numLeagueId) },
              } as never)
            }
            onViewAllStandings={() => setSelectedTab('standings')}
            onInviteShare={() => void handleInviteShare()}
            onPlayerPress={(playerId) =>
              router.push({
                pathname: '/PlayerDetail',
                params: { playerId: String(playerId), playerName: '' },
              })
            }
          />
        </Tabs.Content>

        <Tabs.Content value="roster" flex={1}>
          <LeagueRosterManagement
            positions={positionsData?.leaguePositions || []}
            teamPlayers={
              (teamMembersData?.teamMembers?.filter(
                (member) => member !== null,
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

        <Tabs.Content value="history" flex={1}>
          <LeagueHistoryTab leagueId={numLeagueId} />
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

                {/* Salary Cap Management (web deep link) */}
                <SalaryCapManagementCard
                  leagueId={numLeagueId}
                  sport="baseball"
                  salaryCapEnabled={league?.salaryCapEnabled ?? false}
                  salaryCap={league?.salaryCap ?? null}
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
                            pathname: '/DraftBoardPage' as never,
                            params: { leagueId: String(numLeagueId) },
                          } as never)
                        }
                        minWidth={120}
                      >
                        Live Draft
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

export function LeagueIdHeader(_props: {
  tintColor?: string | object | null;
  children?: string;
}): React.JSX.Element {
  const params = useGlobalSearchParams();
  const leagueId = params.leagueId;

  const numLeagueId = toIntId(leagueId);

  const { data } = useGetLeagueByIdQuery({
    skip: numLeagueId === null,
    variables: {
      id: numLeagueId ?? 0,
    },
  });

  return <H3>{data ? data.league?.name : ''}</H3>;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

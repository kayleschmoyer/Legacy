import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Card, H3, Spinner, Text, YStack } from 'tamagui';
import { Tabs } from '@tamagui/tabs';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import {
  LeagueTabBar,
  type LeagueTabDef,
  LeagueTradeBlock,
  PendingTradeOffers,
  PendingWaiverClaims,
  StandingsTable,
  useWebSocket,
} from '@legacy-sports/shared-components';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { LeagueRosterManagement } from '../../../features/roster/LeagueRosterManagement';
import { LeagueChatTab } from '../../../features/leagues/LeagueChatTab';
import { CommissionerScreen } from '../../../features/commissioner/CommissionerScreen';
import { MatchupList } from '../../../features/matchup/components/MatchupList';
import { useMatchupsForLeague } from '../../../features/matchup/hooks/useMatchup';
import { handleError } from '../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../common/auth/AuthHooks';
import { toIntId } from '../../../common/utilities/RouteUtils';
import { setLastVisitedLeague } from '../../../common/utilities/lastVisitedLeague';
import { useStandings } from '../../../features/matchup/hooks/useStandings';
import { LeagueFreeAgents } from '../FreeAgents';

// This screen predates the sport-aware baseball/football league-detail routes
// and hand-rolled its own tab bar, which wrapped labels across 3 lines at
// default device width (LS-8623). Reusing the shared LeagueTabBar — the same
// horizontally-scrolling component the sport-aware screens use — fixes the
// wrap without duplicating that layout logic here.
const LEAGUE_TABS: readonly LeagueTabDef[] = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'roster', label: 'My Team' },
  { id: 'players', label: 'Players' },
  { id: 'freeagents', label: 'Free Agents' },
  { id: 'trades', label: 'Trades' },
  { id: 'standings', label: 'Standings' },
  { id: 'chat', label: 'Chat' },
  { id: 'manage', label: 'Manage', commishOnly: true },
];

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
  const initialTab =
    typeof params.initialTab === 'string' ? params.initialTab : undefined;
  const [selectedTab, setSelectedTab] = useState(initialTab ?? 'matchup');
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
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);
  const isMember = isCommissioner || userTeamId != null;

  const league = leagueData?.league;

  // Persist this league as the user's most recently opened one so the next
  // login can redirect them straight here instead of the generic `/` route
  // (LS-6694). Best-effort and storage-failure tolerant.
  const leagueSport = league?.sport;
  useEffect(() => {
    if (!isNaN(numLeagueId) && leagueSport) {
      setLastVisitedLeague(numLeagueId, leagueSport);
    }
  }, [numLeagueId, leagueSport]);

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

  const handlePlayerAssign = useCallback(
    async (player: AppTeamMemberFragment, position: LeaguePositionFragment) => {
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
      try {
        await swapTeamMemberPositions({
          variables: {
            teamMemberIdA: incoming.id,
            positionIdA: target.id ?? undefined,
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
        <LeagueTabBar
          tabs={LEAGUE_TABS}
          activeTab={selectedTab}
          onTabChange={setSelectedTab}
          isMember={isMember}
          isCommissioner={isCommissioner}
        />

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
                (member): member is AppTeamMemberFragment => member !== null,
              ) as AppTeamMemberFragment[]) || []
            }
            onPlayerAssign={(player, position) => {
              void handlePlayerAssign(player, position);
            }}
            onPlayerRemove={(position) => {
              void handlePlayerRemove(position);
            }}
            onPlayerSwap={(incoming, target, displaced) => {
              void handlePlayerSwap(incoming, target, displaced);
            }}
            loading={positionsLoading || teamMembersLoading || userTeamLoading}
            leagueId={numLeagueId}
            currentWeek={league?.currentWeekNumber}
            totalWeeks={league?.totalMatchups}
            myTeamId={userTeamId}
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
            <CommissionerScreen
              leagueId={numLeagueId}
              league={league}
              onLeagueDeleted={() => router.navigate('/')}
            />
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

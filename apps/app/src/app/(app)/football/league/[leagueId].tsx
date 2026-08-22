import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { ShoppingCart } from '@tamagui/lucide-icons/icons/ShoppingCart';
import { Alert, ScrollView, Share } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import {
  isDraftPaused,
  isDraftRoomReachable,
  LeagueDetailShell,
  type LeagueRole,
  type LeagueTabDef,
  PendingTradeOfferBanner,
  PendingWaiverClaims,
  PlayoffBracket,
  SegmentedControl,
  StandingsTable,
  TradingCenter,
  usePlayoffBracket,
} from '@legacy-sports/shared-components';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
  useGetLeagueByIdQuery,
  useGetNflTeamSeasonMetadataQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { LeagueChatTab } from '../../../../features/leagues/LeagueChatTab';
import { LeagueOverviewTab } from '../../../../features/leagues/LeagueOverviewTab';
import { usePullToRefresh } from '../../../../common/hooks/usePullToRefresh';
import { useStandings } from '../../../../features/matchup/hooks/useStandings';
import { CommissionerScreen } from '../../../../features/commissioner/CommissionerScreen';
import { MatchupList } from '../../../../features/matchup/components/MatchupList';
import { useMatchupsForLeague } from '../../../../features/matchup/hooks/useMatchup';
import { useLeagueScoringSettings } from '../../../../common/scoring';
import { handleError } from '../../../../common/utilities/ErrorHandler';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';
import { setLastVisitedLeague } from '../../../../common/utilities/lastVisitedLeague';
import { HOME_TAB_HREF } from '../../../../common/utilities/RouteUtils';
import { useSubscription } from '../../../../features/subscription/useSubscription';
import { LeagueWebSocketContext } from '../../../../context/LeagueWebSocketContext';
import { useLeagueWebSocketLifecycle } from '../../../../hooks/useLeagueWebSocketLifecycle';
import { useLeagueWebSocket } from '../../../../hooks/useLeagueWebSocket';

const BASE_FOOTBALL_LEAGUE_TABS: readonly LeagueTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'Roster' },
  { id: 'matchups', label: 'Matchups' },
  { id: 'trades', label: 'Trades' },
  { id: 'standings', label: 'Standings' },
  { id: 'chat', label: 'Chat' },
  { id: 'commissioner', label: 'Settings', commishOnly: true },
];

/**
 * Subscribes to page-level WS events. Rendered as a child of
 * LeagueWebSocketContext.Provider (not the provider component itself) so it
 * can actually read the context value the provider supplies.
 */
function LeagueWSPageHandler({
  onRosterUpdate,
  onTradeOffer,
  onDraftCompleted,
}: {
  onRosterUpdate: () => void;
  onTradeOffer: () => void;
  onDraftCompleted: () => void;
}) {
  useLeagueWebSocket({ onRosterUpdate, onTradeOffer, onDraftCompleted });
  return null;
}

export default function FootballLeagueId(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const router = useRouter();
  const initialTab =
    typeof params.initialTab === 'string' ? params.initialTab : undefined;
  const [selectedTab, setSelectedTab] = useState(initialTab ?? 'overview');
  // Matchups tab list/bracket toggle (FLD-017): the flat matchup list gives
  // no visibility into the premium playoff bracket structure during playoff
  // weeks, so a bracket view is offered alongside it once one exists.
  const [matchupsView, setMatchupsView] = useState<'list' | 'bracket'>('list');
  // View-as role preference (in-memory; mirrors web v2's derive-from-perms
  // logic). `null` means "follow the user's actual highest role".
  const [rolePref, setRolePref] = useState<LeagueRole | null>(null);
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

  const {
    matchups: rawMatchups,
    loading: matchupsLoading,
    refetch: refetchMatchups,
  } = useMatchupsForLeague(isNaN(numLeagueId) ? null : numLeagueId);

  const {
    data: leagueData,
    loading: leagueLoading,
    refetch: refetchLeague,
  } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  const {
    data: positionsData,
    loading: positionsLoading,
    refetch: refetchPositions,
  } = useGetPositionsForLeagueQuery({
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

  useEffect(() => {
    if (!isNaN(numLeagueId) && userInfo?.id) {
      void getUserTeamId({
        variables: { leagueId: numLeagueId },
      });
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
    refetch: refetchTeamMembers,
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
    refetch: refetchStandings,
  } = useStandings(isNaN(numLeagueId) ? null : numLeagueId);

  const { bracket: playoffBracket, refetch: refetchPlayoffBracket } =
    usePlayoffBracket(isNaN(numLeagueId) ? null : numLeagueId);

  const scoring = useLeagueScoringSettings(
    isNaN(numLeagueId) ? undefined : numLeagueId,
  );

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);

  const league = leagueData?.league;

  // FLD-017: the premium 6/8-team playoff format is otherwise invisible in
  // the Matchups tab — only offer the bracket view once the league has a
  // format configured and the bracket has actually seeded matchups.
  const hasPlayoffBracket =
    !!league?.playoffFormat && (playoffBracket?.matchups?.length ?? 0) > 0;

  // Bridge native's league WebSocket to TradingCenter's refetch. TradingCenter
  // registers its refetch via `onSubscribeRefresh`; we stash it in a ref and
  // invoke it on trade-offer / roster-update notifications for real-time updates.
  const tradeRefetchRef = useRef<(() => void) | null>(null);
  const onTradesSubscribeRefresh = useCallback((refetch: () => void) => {
    tradeRefetchRef.current = refetch;
    return () => {
      tradeRefetchRef.current = null;
    };
  }, []);

  // Same bridge for `PendingWaiverClaims`, which renders once per tab (Trades
  // and Waivers both embed it) — separate refs even though this page fully
  // unmounts inactive tabs, matching baseball's wiring for consistency (LS-8862).
  const tradesWaiverRefetchRef = useRef<(() => void) | null>(null);
  const onTradesWaiverSubscribeRefresh = useCallback((refetch: () => void) => {
    tradesWaiverRefetchRef.current = refetch;
    return () => {
      tradesWaiverRefetchRef.current = null;
    };
  }, []);
  const waiversRefetchRef = useRef<(() => void) | null>(null);
  const onWaiversSubscribeRefresh = useCallback((refetch: () => void) => {
    waiversRefetchRef.current = refetch;
    return () => {
      waiversRefetchRef.current = null;
    };
  }, []);

  // Persist this league as the user's most recently opened one so the next
  // login can redirect them straight here instead of the generic `/` route
  // (LS-6694). Sport is fixed by this route.
  const leagueLoaded = !!league;
  useEffect(() => {
    if (!isNaN(numLeagueId) && leagueLoaded) {
      setLastVisitedLeague(numLeagueId, 'football');
    }
  }, [numLeagueId, leagueLoaded]);

  const isMember = isCommissioner || userTeamId != null;

  const leagueTabs = useMemo<readonly LeagueTabDef[]>(() => {
    if (!league?.waiverEnabled) return BASE_FOOTBALL_LEAGUE_TABS;
    const withWaivers = [...BASE_FOOTBALL_LEAGUE_TABS];
    const tradesIdx = withWaivers.findIndex((t) => t.id === 'trades');
    withWaivers.splice(tradesIdx + 1, 0, { id: 'waivers', label: 'Waivers' });
    return withWaivers;
  }, [league?.waiverEnabled]);

  // Effective view-as role: honour the user's toggle when valid, else fall
  // back to their highest actual role.
  const role: LeagueRole = useMemo(() => {
    if (rolePref === 'commish' && isCommissioner) return 'commish';
    if (rolePref === 'member' && isMember) return 'member';
    if (rolePref === 'spectator') return 'spectator';
    return isCommissioner ? 'commish' : isMember ? 'member' : 'spectator';
  }, [rolePref, isCommissioner, isMember]);
  const setRole = useCallback((r: LeagueRole) => setRolePref(r), []);

  const { isPremium } = useSubscription();

  const [season, setSeason] = useState<string>(
    String(league?.seasonNumber ?? new Date().getFullYear()),
  );
  useEffect(() => {
    if (league?.seasonNumber) setSeason(String(league.seasonNumber));
  }, [league?.seasonNumber]);
  // Native intentionally surfaces only the league's active season today, matching
  // canonical web v2 (the shell hides the selector unless seasons.length > 1).
  // Multi-season history isn't exposed by the league API yet; populating this
  // with prior seasons is deferred to the follow-up that adds that data source.
  const seasonOptions = useMemo(
    () => [
      {
        value: String(league?.seasonNumber ?? new Date().getFullYear()),
        label: `Season ${league?.seasonNumber ?? new Date().getFullYear()} · ${
          league?.frozenAt ? 'Final' : 'Active'
        }`,
      },
    ],
    [league?.seasonNumber, league?.frozenAt],
  );

  // Bye-week warning data (LS-6334) — IR-slot enforcement was scoped out of
  // this ticket (product decision: no injury/IR concept on a historical-data
  // platform). Season is numeric here, unlike web's string `season` state.
  const { data: nflByeWeekData } = useGetNflTeamSeasonMetadataQuery({
    variables: { season: league?.seasonNumber ?? undefined },
    skip: !league?.seasonNumber,
  });
  const byeWeeksByTeam = useMemo(() => {
    const map: Record<string, number> = {};
    for (const meta of nflByeWeekData?.nflTeamSeasonMetadata ?? []) {
      if (meta?.teamAbbreviation) map[meta.teamAbbreviation] = meta.byeWeek;
    }
    return map;
  }, [nflByeWeekData?.nflTeamSeasonMetadata]);

  const wsUrl = config.websocketUrl;
  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({
      url: wsUrl ?? undefined,
      token: wsToken,
      leagueId: isNaN(numLeagueId) ? undefined : numLeagueId,
    });

  const inviteCode = league?.inviteCode ?? '';
  const appBaseUrl = config.appBaseUrl ?? 'https://legacysports.app';
  const inviteUrl = inviteCode
    ? `${appBaseUrl}/football/league/join/${inviteCode}`
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

  const handlePlayerAssign = useCallback(
    async (player: AppTeamMemberFragment, position: LeaguePositionFragment) => {
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

  const handlePlayerPress = useCallback(
    (player: {
      player?: { id?: number | null } | null;
      playerId?: number | null;
    }) => {
      const playerId = player.player?.id ?? player.playerId;
      if (playerId != null) {
        router.push(`/football/players/${playerId}`);
      }
    },
    [router],
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
  const isDrafting = isDraftRoomReachable(draftStatus);
  const isPausedDraft = isDraftPaused(draftStatus);
  const startersCount =
    teamMembersData?.teamMembers?.filter((m) => m?.positionId != null).length ??
    0;

  // Pull-to-refresh: this route fully unmounts inactive tabs (unlike the
  // baseball league page's keep-mounted pattern), but each tab still owns
  // only its own queries so the refresh contract stays identical (LS-8847).
  const overviewRefresh = usePullToRefresh([
    () => refetchLeague(),
    () => refetchStandings(),
    () => scoring.refetch(),
  ]);
  const rosterRefresh = usePullToRefresh(
    userTeamId != null
      ? [() => refetchPositions(), () => refetchTeamMembers()]
      : [() => refetchPositions()],
  );
  const matchupsRefresh = usePullToRefresh([() => refetchMatchups()]);
  const standingsRefresh = usePullToRefresh([
    () => refetchStandings(),
    () => refetchPlayoffBracket(),
  ]);
  const tradesRefresh = usePullToRefresh([
    () => Promise.resolve(tradeRefetchRef.current?.()),
    () => Promise.resolve(tradesWaiverRefetchRef.current?.()),
  ]);
  const waiversRefresh = usePullToRefresh([
    () => Promise.resolve(waiversRefetchRef.current?.()),
  ]);

  if (leagueLoading) {
    return <Spinner />;
  }

  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <LeagueWSPageHandler
        onRosterUpdate={() => {
          tradeRefetchRef.current?.();
        }}
        onTradeOffer={() => {
          tradeRefetchRef.current?.();
        }}
        onDraftCompleted={() => {
          Alert.alert('Draft Complete', 'The draft has finished!');
        }}
      />
      <LeagueDetailShell
        sport="football"
        fill
        league={{
          name: league.name ?? 'League',
          scoringLabel: scoring.profileName ?? 'Standard',
          era:
            league.minCareerSeasons || league.minCareerGames
              ? `Career filter · ${league.minCareerSeasons ?? 0}+ seasons`
              : 'All-Time',
          draftStatus: league.draftStatus ?? 'pre-draft',
          currentWeek: league.currentWeekNumber ?? null,
          totalMatchups: league.totalMatchups ?? null,
          teamCount: rankedStandings.length || null,
          inviteCode: league.inviteCode,
        }}
        role={role}
        onRoleChange={setRole}
        season={season}
        onSeasonChange={setSeason}
        seasons={seasonOptions}
        isCommissioner={isCommissioner}
        isMember={isMember}
        tabs={leagueTabs}
        activeTab={selectedTab}
        onTabChange={setSelectedTab}
        onInvite={() => void handleInviteShare()}
      >
        {userTeamId != null && (
          <YStack paddingHorizontal="$2" paddingTop="$2">
            <PendingTradeOfferBanner
              teamId={userTeamId}
              onReview={() => setSelectedTab('trades')}
              isPremium={isPremium}
            />
          </YStack>
        )}
        {selectedTab === 'overview' && (
          <YStack flex={1}>
            <LeagueOverviewTab
              league={league}
              leagueId={numLeagueId}
              isCommissioner={isCommissioner}
              isMember={isMember}
              isDrafting={isDrafting}
              isPaused={isPausedDraft}
              rankedStandings={rankedStandings}
              startersCount={startersCount}
              inviteCode={inviteCode}
              footballScoringProfile={scoring.profile}
              footballScoringLoading={scoring.loading}
              footballScoringError={scoring.error ?? null}
              footballDefensiveFormat={league.defensiveFormat}
              onJoinDraft={() =>
                router.navigate({
                  pathname: '/DraftBoardPage',
                  params: { leagueId: String(numLeagueId) },
                })
              }
              onViewAllStandings={() => setSelectedTab('standings')}
              onInviteShare={() => void handleInviteShare()}
              onPlayerPress={(playerId) => handlePlayerPress({ playerId })}
              refreshControl={overviewRefresh.refreshControl}
            />
          </YStack>
        )}

        {selectedTab === 'roster' && (
          <YStack flex={1}>
            {userTeamId != null ? (
              <LeagueRosterManagement
                positions={positionsData?.leaguePositions || []}
                teamPlayers={
                  teamMembersData?.teamMembers?.filter(
                    (member): member is AppTeamMemberFragment =>
                      member !== null,
                  ) ?? []
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
                onPlayerPress={handlePlayerPress}
                loading={
                  positionsLoading || teamMembersLoading || userTeamLoading
                }
                leagueId={numLeagueId}
                currentWeek={league?.currentWeekNumber}
                totalWeeks={league?.totalMatchups}
                myTeamId={userTeamId}
                refreshControl={rosterRefresh.refreshControl}
                sport="football"
                byeWeeksByTeam={byeWeeksByTeam}
              />
            ) : (
              <YStack flex={1} padding="$3">
                <Text color="$textMuted">
                  Join this league to manage a roster.
                </Text>
              </YStack>
            )}
          </YStack>
        )}

        {selectedTab === 'matchups' && (
          <YStack flex={1}>
            {hasPlayoffBracket && (
              <XStack paddingHorizontal="$3" paddingTop="$3" paddingBottom="$1">
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'list', label: 'List' },
                    { value: 'bracket', label: 'Bracket' },
                  ]}
                  value={matchupsView}
                  onValueChange={(value) =>
                    setMatchupsView(value === 'bracket' ? 'bracket' : 'list')
                  }
                />
              </XStack>
            )}
            {hasPlayoffBracket &&
            matchupsView === 'bracket' &&
            playoffBracket ? (
              <ScrollView
                contentContainerStyle={{ padding: 8 }}
                refreshControl={matchupsRefresh.refreshControl}
              >
                <PlayoffBracket bracket={playoffBracket} />
              </ScrollView>
            ) : (
              <MatchupList
                matchups={matchups}
                loading={matchupsLoading}
                emptyMessage="No matchups found for this league"
                onMatchupPress={(matchup) => {
                  if (matchup.id != null) {
                    router.navigate({
                      pathname: '/football/matchup',
                      params: {
                        matchupId: String(matchup.id),
                        leagueId: String(numLeagueId),
                      },
                    });
                  }
                }}
                refreshing={matchupsRefresh.refreshing}
                onRefresh={matchupsRefresh.onRefresh}
              />
            )}
          </YStack>
        )}

        {/* Trades Tab — full shared Trading Center (propose / history / veto) */}
        {selectedTab === 'trades' && (
          <YStack flex={1}>
            <ScrollView refreshControl={tradesRefresh.refreshControl}>
              <YStack padding="$3" space="$4">
                {userTeamId ? (
                  <>
                    <TradingCenter
                      leagueId={numLeagueId}
                      userTeamId={userTeamId}
                      isCommissioner={isCommissioner}
                      onSubscribeRefresh={onTradesSubscribeRefresh}
                      isPremium={isPremium}
                      onUpgradePremium={() =>
                        router.navigate('subscription-settings')
                      }
                    />
                    <PendingWaiverClaims
                      teamId={userTeamId}
                      onSubscribeRefresh={onTradesWaiverSubscribeRefresh}
                    />
                  </>
                ) : (
                  <Text color="$textMuted">
                    Join this league to propose and manage trades.
                  </Text>
                )}
              </YStack>
            </ScrollView>
          </YStack>
        )}

        {selectedTab === 'waivers' && (
          <YStack flex={1}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              refreshControl={waiversRefresh.refreshControl}
            >
              <YStack padding="$3" gap="$4">
                {userTeamId ? (
                  <>
                    <PendingWaiverClaims
                      teamId={userTeamId}
                      onSubscribeRefresh={onWaiversSubscribeRefresh}
                    />
                    <Button
                      size="$4"
                      onPress={() =>
                        router.navigate({
                          pathname: '/FreeAgents',
                          params: { leagueId: String(numLeagueId) },
                        })
                      }
                      icon={<ShoppingCart size={18} />}
                      accessibilityRole="button"
                    >
                      Browse Free Agents & Submit Claim
                    </Button>
                  </>
                ) : (
                  <Text color="$textMuted">
                    Join this league to view and submit waiver claims.
                  </Text>
                )}
              </YStack>
            </ScrollView>
          </YStack>
        )}

        {selectedTab === 'standings' && (
          <YStack flex={1}>
            <ScrollView refreshControl={standingsRefresh.refreshControl}>
              <YStack padding="$3" space="$4">
                <StandingsTable
                  standings={standings}
                  loading={standingsLoading}
                  error={standingsError}
                  currentUserTeamId={userTeamId ?? null}
                />
                {playoffBracket ? (
                  <PlayoffBracket bracket={playoffBracket} />
                ) : null}
              </YStack>
            </ScrollView>
          </YStack>
        )}

        {selectedTab === 'chat' && (
          <YStack flex={1}>
            <LeagueChatTab leagueId={numLeagueId} userInfo={userInfo} />
          </YStack>
        )}

        {selectedTab === 'commissioner' && isCommissioner && (
          <YStack flex={1}>
            <CommissionerScreen
              leagueId={numLeagueId}
              league={league}
              // Straight to the Home tab. `/` only redirects there, and routing
              // through it left the redirect in the stack (LS-8823).
              onLeagueDeleted={() => router.navigate(HOME_TAB_HREF)}
            />
          </YStack>
        )}
      </LeagueDetailShell>
    </LeagueWebSocketContext.Provider>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

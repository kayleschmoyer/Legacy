import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { ShoppingCart } from '@tamagui/lucide-icons';
import { Alert, ScrollView, Share } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import {
  LeagueDetailShell,
  type LeagueRole,
  type LeagueTabDef,
  PendingTradeOfferBanner,
  PendingWaiverClaims,
  PlayoffBracket,
  StandingsTable,
  TradingCenter,
  usePlayoffBracket,
  useWebSocket,
} from '@legacy-sports/shared-components';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { LeagueRosterManagement } from '../../../../features/roster/LeagueRosterManagement';
import { LeagueChatTab } from '../../../../features/leagues/LeagueChatTab';
import { LeagueOverviewTab } from '../../../../features/leagues/LeagueOverviewTab';
import { useStandings } from '../../../../features/matchup/hooks/useStandings';
import { LeagueHistoryTab } from '../../../../features/leagues/LeagueHistoryTab';
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

const BASE_BASEBALL_LEAGUE_TABS: readonly LeagueTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'Roster' },
  { id: 'matchups', label: 'Matchups' },
  { id: 'trades', label: 'Trades' },
  { id: 'standings', label: 'Standings' },
  { id: 'history', label: 'History' },
  { id: 'chat', label: 'Chat' },
  { id: 'commissioner', label: 'Settings', commishOnly: true },
];

export default function LeagueId(): React.JSX.Element {
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;
  const router = useRouter();
  const initialTab =
    typeof params.initialTab === 'string' ? params.initialTab : undefined;
  const [selectedTab, setSelectedTab] = useState(initialTab ?? 'overview');
  // Track which tabs have been opened so their subtrees stay mounted across
  // switches instead of unmounting (which resets scroll position — LS-7563).
  // Unvisited tabs are never rendered, so their data isn't fetched until first
  // opened; visited-but-inactive tabs are hidden via `display` below, keeping
  // their ScrollView offset intact for when the user returns.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set([initialTab ?? 'overview']),
  );
  // View-as role preference (in-memory; mirrors web v2's derive-from-perms
  // logic). `null` means "follow the user's actual highest role".
  const [rolePref, setRolePref] = useState<LeagueRole | null>(null);
  const userInfo = useAuthorizedUserInfo();
  const [wsToken, setWsToken] = useState<string | undefined>();

  // Read the internal JWT from secure storage to authenticate the league
  // WebSocket. A missing/failed read leaves `wsToken` undefined, which gates
  // `autoConnect` below — the real-time channel simply stays disconnected.
  //
  // Note on the try/catch: `readKeychainValue` already catches every error from
  // secure storage internally and resolves to `null` (see AuthHooks.ts) — a
  // locked device / no-biometric-enrollment / SecureStore-unavailable failure
  // surfaces there as a distinguishable error log, not a rejection here. This
  // local try/catch is therefore defense-in-depth against an unexpected
  // synchronous throw, not the primary failure signal; the observable "secure
  // storage broke" vs "user logged out" distinction lives in AuthHooks (LS-7627).
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

  // Record every tab the user opens (covers both the tab bar and imperative
  // setSelectedTab callers) so the render blocks below can keep-alive visited
  // tabs. LS-7563.
  useEffect(() => {
    setVisitedTabs((prev) =>
      prev.has(selectedTab) ? prev : new Set(prev).add(selectedTab),
    );
  }, [selectedTab]);

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

  const scoring = useLeagueScoringSettings(
    isNaN(numLeagueId) ? undefined : numLeagueId,
  );

  const { bracket: playoffBracket } = usePlayoffBracket(
    isNaN(numLeagueId) ? null : numLeagueId,
  );

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  // Check if user is league owner/commissioner
  const isCommissioner = useMemo(() => {
    if (!leagueData?.league || !userInfo) return false;
    return leagueData.league.owner === userInfo.id || userInfo.isAdmin;
  }, [leagueData?.league, userInfo]);

  const league = leagueData?.league;

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

  // Persist this league as the user's most recently opened one so the next
  // login can redirect them straight here instead of the generic `/` route
  // (LS-6694). Sport is fixed by this route.
  const leagueLoaded = !!league;
  useEffect(() => {
    if (!isNaN(numLeagueId) && leagueLoaded) {
      setLastVisitedLeague(numLeagueId, 'baseball');
    }
  }, [numLeagueId, leagueLoaded]);

  const isMember = isCommissioner || userTeamId != null;

  const leagueTabs = useMemo<readonly LeagueTabDef[]>(() => {
    if (!league?.waiverEnabled) return BASE_BASEBALL_LEAGUE_TABS;
    const withWaivers = [...BASE_BASEBALL_LEAGUE_TABS];
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

  // WebSocket for live league updates
  const wsUrl = config.websocketUrl;
  const { connected: _wsConnected } = useWebSocket({
    url: wsUrl ?? undefined,
    token: wsToken,
    leagueId: isNaN(numLeagueId) ? undefined : numLeagueId,
    viewContext: 'league',
    autoConnect: !isNaN(numLeagueId) && !!wsUrl && !!wsToken,
    onRosterUpdate: () => {
      tradeRefetchRef.current?.();
    },
    onTradeOffer: () => {
      tradeRefetchRef.current?.();
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
    <LeagueDetailShell
      sport="baseball"
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
          />
        </YStack>
      )}
      {visitedTabs.has('overview') && (
        <YStack flex={1} display={selectedTab === 'overview' ? 'flex' : 'none'}>
          <LeagueOverviewTab
            league={league}
            leagueId={numLeagueId}
            isCommissioner={isCommissioner}
            isDrafting={isDrafting}
            rankedStandings={rankedStandings}
            startersCount={startersCount}
            inviteCode={inviteCode}
            scoringLoading={scoring.loading}
            scoringError={scoring.error ?? null}
            scoringProfileName={scoring.profileName}
            scoringSettings={scoring.settings}
            onJoinDraft={() =>
              router.navigate({
                pathname: '/DraftBoardPage',
                params: { leagueId: String(numLeagueId) },
              })
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
        </YStack>
      )}

      {visitedTabs.has('roster') && (
        <YStack flex={1} display={selectedTab === 'roster' ? 'flex' : 'none'}>
          <LeagueRosterManagement
            positions={positionsData?.leaguePositions || []}
            teamPlayers={
              (teamMembersData?.teamMembers?.filter(
                (member) => member !== null,
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
        </YStack>
      )}

      {visitedTabs.has('matchups') && (
        <YStack
          flex={1}
          display={selectedTab === 'matchups' ? 'flex' : 'none'}
          // Mandatory navigation-landing anchor for the Maestro matchups flow
          // (LS-8446). On the Matchups tab regardless of matchup data (pre-season
          // included), so a broken tab fails the flow instead of emitting an
          // empty screenshot; the matchup-card drill-in stays when:-guarded.
          testID="matchup-list"
        >
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
        </YStack>
      )}

      {/* Trades Tab — full shared Trading Center (propose / history / veto) */}
      {visitedTabs.has('trades') && (
        <YStack flex={1} display={selectedTab === 'trades' ? 'flex' : 'none'}>
          <ScrollView>
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
                  <PendingWaiverClaims teamId={userTeamId} />
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

      {visitedTabs.has('waivers') && (
        <YStack flex={1} display={selectedTab === 'waivers' ? 'flex' : 'none'}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <YStack padding="$3" gap="$4">
              {userTeamId ? (
                <>
                  <PendingWaiverClaims teamId={userTeamId} />
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

      {visitedTabs.has('standings') && (
        <YStack
          flex={1}
          display={selectedTab === 'standings' ? 'flex' : 'none'}
        >
          <ScrollView>
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

      {visitedTabs.has('history') && (
        <YStack flex={1} display={selectedTab === 'history' ? 'flex' : 'none'}>
          <LeagueHistoryTab leagueId={numLeagueId} />
        </YStack>
      )}

      {visitedTabs.has('chat') && (
        <YStack flex={1} display={selectedTab === 'chat' ? 'flex' : 'none'}>
          <LeagueChatTab leagueId={numLeagueId} userInfo={userInfo} />
        </YStack>
      )}

      {visitedTabs.has('commissioner') && isCommissioner && (
        <YStack
          flex={1}
          display={selectedTab === 'commissioner' ? 'flex' : 'none'}
        >
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
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

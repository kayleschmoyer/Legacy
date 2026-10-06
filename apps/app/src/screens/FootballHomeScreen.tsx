import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { NFLHome } from '@legacy-sports/shared-components/football';
import type { LastVisitedLeague } from '@legacy-sports/shared-components/utils';
import {
  Sport,
  useFootballPlayersQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../common/auth/AuthorizedUserContext';
import { usePullToRefresh } from '../common/hooks/usePullToRefresh';
import { useSubscription } from '../features/subscription/useSubscription';
import { FREE_TIER_LEAGUE_LIMIT } from '../features/subscription/constants';
import { trackPremiumFeatureClick } from '../utils/analytics';
import { getLastVisitedLeague } from '../common/utilities/lastVisitedLeague';
import { useFootballMatchupHighlights } from '../hooks/useFootballMatchupHighlights';

// Analytics label for the upgrade prompt fired from the league-cap gate (LS-5025).
const LEAGUE_CAP_FEATURE_NAME = 'Unlimited Leagues';

type FootballHomeScreenProps = {
  /**
   * Switches to the baseball home. Owned by the host (`(tabs)/(home)/home.tsx`), which
   * flips its inline sport view rather than navigating — the screen must never
   * push `/baseball` itself, or the user ends up on a second home surface
   * outside the tab shell (LS-8823). Omitted → `NFLHome` hides the switcher.
   */
  onSwitchSport?: (sport: 'baseball') => void;
  /**
   * Returns to the cross-sport sports dashboard (LS-6286 / FBH-032). Owned by
   * the host (`(tabs)/(home)/home.tsx`), which wires this to the same dashboard-return
   * action already used by its system-back handler. Omitted → `NFLHome` hides
   * the "All Sports" option.
   */
  onGoToAllSports?: () => void;
};

/**
 * Mobile data wrapper for the shared `NFLHome`.
 *
 * Not a route: the Home tab mounts it inline so scroll position survives
 * (LS-5814). `/football` is a redirect into that tab, not a second mount point
 * — see `(app)/football/index.tsx` (LS-8823).
 */
export default function FootballHomeScreen({
  onSwitchSport,
  onGoToAllSports,
}: FootballHomeScreenProps) {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const {
    data,
    loading,
    error,
    refetch: refetchLeagues,
  } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  // Top/trending players preview (LS-5411). Pool-wide fantasy points, top 5 —
  // no dedicated "trending" backend metric exists, so this reuses the
  // existing footballPlayers sort support (fpts desc) rather than adding one.
  const {
    data: trendingPlayersData,
    loading: trendingPlayersLoading,
    refetch: refetchTrendingPlayers,
  } = useFootballPlayersQuery({
    variables: { first: 5, sortBy: 'fpts', sortDir: 'desc' },
  });
  const trendingPlayers = trendingPlayersData?.footballPlayers?.nodes ?? [];

  const { refreshControl } = usePullToRefresh([
    () => refetchLeagues(),
    () => refetchTrendingPlayers(),
  ]);

  const { isPremium, loading: subscriptionLoading } = useSubscription();

  // Count all leagues (all sports) against the free-tier cap — mirrors the
  // backend's setActiveLeagues enforcement and the baseball home pattern.
  // `userLeagues` is paginated (LS-9101); `userLeagueCount` is the
  // authoritative, unpaginated total and must be used for the cap gate so it
  // stays correct once a user has more leagues than the page size.
  const userLeagues = data?.userLeagues;
  const leaguesLoadFailed = !loading && userLeagues == null;
  const leaguesLoaded = !loading && !leaguesLoadFailed;
  const showLeagueCap = !subscriptionLoading && !isPremium && leaguesLoaded;
  const activeLeagueCount = data?.userLeagueCount ?? 0;
  const atFreeLeagueLimit =
    showLeagueCap && activeLeagueCount >= FREE_TIER_LEAGUE_LIMIT;

  type LeagueWithId = NonNullable<
    NonNullable<typeof data>['userLeagues'][number]
  > & { id: number };

  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        // Legacy/un-migrated leagues can have a null sport (FBH-001) — treat
        // them as football rather than silently dropping them, since the
        // alternative is the user losing access to the league entirely.
        .filter((l) => l.sport === Sport.Football || l.sport == null)
        .filter((l): l is LeagueWithId => l.id != null)
        .map((l) => ({
          id: l.id,
          name: l.name,
          draftStatus: l.draftStatus,
          currentWeekNumber: l.currentWeekNumber,
          weekAdvanceStatus: l.weekAdvanceStatus,
          maxRosterSize: l.maxRosterSize,
          tierFrozenAt: l.tierFrozenAt,
          frozenAt: l.frozenAt,
          permissionLevel: l.userMembership?.permissionLevel,
          currentMatchup: l.currentMatchup,
          leaguePhase: l.leaguePhase,
        })),
    [data?.userLeagues],
  );

  // This week's matchup highlights (LS-6263 / FBH-009) — mirrors the web
  // Football Home's matchup section (LS-5407), which `NFLHome` already
  // supports via `matchupHighlights`; only the mobile data wiring was
  // missing. Navigates straight to the specific matchup when one exists,
  // or to the league's Matchups tab for a bye-week card with no matchup id.
  const handlePressMatchupLeague = useCallback(
    (leagueId: string | number, matchupId?: number) => {
      if (matchupId != null) {
        router.navigate({
          pathname: '/football/matchup',
          params: { matchupId: String(matchupId), leagueId: String(leagueId) },
        });
      } else {
        router.navigate({
          pathname: '/football/league/[leagueId]',
          params: { leagueId: String(leagueId), initialTab: 'matchups' },
        });
      }
    },
    [router],
  );

  const { highlights: matchupHighlights } = useFootballMatchupHighlights(
    leagues,
    handlePressMatchupLeague,
  );

  const goToUpgrade = useCallback(() => {
    trackPremiumFeatureClick(LEAGUE_CAP_FEATURE_NAME);
    router.navigate('subscription-settings');
  }, [router]);

  const handleCreateLeague = useCallback(() => {
    if (atFreeLeagueLimit) {
      goToUpgrade();
      return;
    }
    router.push('/football/league/create');
  }, [atFreeLeagueLimit, goToUpgrade, router]);

  const handleViewLeague = useCallback(
    (leagueId: string | number) =>
      router.push({
        pathname: '/football/league/[leagueId]',
        params: { leagueId },
      }),
    [router],
  );

  // Resume-last-league shortcut (LS-6294 / FBH-040), reading the last-visited
  // league from the async native storage wrapper (LS-6694). Resolved via
  // effect since AsyncStorage reads are Promise-based, unlike the web
  // wrapper's synchronous localStorage read.
  const [lastVisitedLeague, setLastVisitedLeague] =
    useState<LastVisitedLeague | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const league = await getLastVisitedLeague();
      if (!cancelled) setLastVisitedLeague(league);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only shown when the last-visited league is football and still among the
  // leagues this user belongs to, so the card never points at a league they
  // left.
  const resumeLeague = useMemo(() => {
    if (!lastVisitedLeague || lastVisitedLeague.sport !== 'football') {
      return undefined;
    }
    const match = leagues.find(
      (l) => String(l.id) === String(lastVisitedLeague.leagueId),
    );
    if (!match) return undefined;
    return {
      id: match.id,
      name: match.name,
      onPress: () => handleViewLeague(match.id),
    };
  }, [lastVisitedLeague, leagues, handleViewLeague]);

  return (
    <NFLHome
      refreshControl={refreshControl}
      leagues={leagues}
      loading={loading && !data}
      error={!!error}
      isAuthenticated={!!userInfo?.id}
      isPremium={isPremium}
      onSignIn={() => router.navigate('/login')}
      onRetry={() => void refetchLeagues()}
      onCreateLeague={handleCreateLeague}
      onJoinLeague={() => router.push('/football/league/join')}
      onBrowseLeagues={() => router.push('/league-discovery')}
      onBrowsePlayers={() => router.push('/football/players')}
      onViewLeague={handleViewLeague}
      trendingPlayers={trendingPlayers}
      trendingPlayersLoading={trendingPlayersLoading}
      matchupHighlights={matchupHighlights}
      onSwitchSport={onSwitchSport}
      onGoToAllSports={onGoToAllSports}
      leagueCap={
        showLeagueCap
          ? {
              count: activeLeagueCount,
              limit: FREE_TIER_LEAGUE_LIMIT,
              atLimit: atFreeLeagueLimit,
              onUpgrade: goToUpgrade,
            }
          : undefined
      }
      hasUnlimitedLeagues={!subscriptionLoading && isPremium}
      resumeLeague={resumeLeague}
    />
  );
}

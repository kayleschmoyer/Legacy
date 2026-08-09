import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { Sport, useGetUserLeaguesQuery } from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../common/auth/AuthorizedUserContext';
import { useSubscription } from '../features/subscription/useSubscription';
import { FREE_TIER_LEAGUE_LIMIT } from '../features/subscription/constants';
import { trackPremiumFeatureClick } from '../utils/analytics';

// Analytics label for the upgrade prompt fired from the league-cap gate (LS-5025).
const LEAGUE_CAP_FEATURE_NAME = 'Unlimited Leagues';

/**
 * Mobile data wrapper for the shared `NFLHome`.
 *
 * Not a route: the Home tab mounts it inline so scroll position survives
 * (LS-5814). `/football` is a redirect into that tab, not a second mount point
 * — see `(app)/football/index.tsx` (LS-8823).
 */
export default function FootballHomeScreen() {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  const { isPremium, loading: subscriptionLoading } = useSubscription();

  // Count all leagues (all sports) against the free-tier cap — mirrors the
  // backend's setActiveLeagues enforcement and the baseball home pattern.
  const userLeagues = data?.userLeagues;
  const rawLeagues = userLeagues ?? [];
  const leaguesLoadFailed = !loading && userLeagues == null;
  const leaguesLoaded = !loading && !leaguesLoadFailed;
  const showLeagueCap = !subscriptionLoading && !isPremium && leaguesLoaded;
  const atFreeLeagueLimit =
    showLeagueCap && rawLeagues.length >= FREE_TIER_LEAGUE_LIMIT;

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
        })),
    [data?.userLeagues],
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

  return (
    <NFLHome
      leagues={leagues}
      loading={loading && !data}
      error={!!error}
      isAuthenticated={!!userInfo?.id}
      onSignIn={() => router.navigate('/login')}
      onCreateLeague={handleCreateLeague}
      onJoinLeague={() => router.push('/football/league/join')}
      onBrowseLeagues={() => router.push('/league-discovery')}
      onViewLeague={(id) =>
        router.push({
          pathname: '/football/league/[leagueId]',
          params: { leagueId: id },
        })
      }
    />
  );
}

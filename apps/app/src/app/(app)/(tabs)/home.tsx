import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDisplayName,
  type HomeLeagueSummary,
  MobileHomeScreen,
} from '@legacy-sports/shared-components';
import { OnThisDayFeed } from '@legacy-sports/shared-components/leagues';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetArchivedUserLeagueSummariesQuery,
  useGetUserLeagueSummariesQuery,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import { useThemeContext } from '../../../context/ThemeContext';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { useSystemBackAction } from '../../../common/hooks/useSystemBackAction';
import { toPlayerDetailIdParam } from '../../../common/utilities/RouteUtils';
import BaseballHomeScreen from '../baseball/index';
import FootballHomeScreen from '../football/index';

type ActiveSport = 'baseball' | 'football';

/**
 * The Home tab renders `MobileHomeScreen` from `lib/shared-components` — the
 * compact "Scoreboard First" layout (LS-8794) — wired to mobile's GraphQL data
 * layer and expo-router navigation. `MobileHomeScreen` delegates its loading,
 * error and new-user states back to the shared `HomeScreen`, which still owns
 * the web dashboard unchanged (shared-components-first, LS-7790).
 *
 * Sport switching uses local state rather than router.push so that the baseball
 * and football home screens stay mounted once visited — preserving scroll
 * position and component state when the user switches between sports or returns
 * to a sport view (LS-5814).
 */
export default function HomeTab() {
  const router = useRouter();
  const { top: topInset } = useSafeAreaInsets();
  const userInfo = useAuthorizedUserInfo();
  const { resolvedTheme } = useThemeContext();
  const [showArchived, setShowArchived] = useState(false);

  // Active sport is tracked locally; no router navigation is used for sport
  // switching so state and scroll position are preserved across visits.
  const [activeSport, setActiveSport] = useState<ActiveSport | null>(null);
  // Once a sport screen is mounted we keep it alive to preserve scroll position.
  const [mountedSports, setMountedSports] = useState<Set<ActiveSport>>(
    new Set(),
  );

  const { data, loading, error, refetch } = useGetUserLeagueSummariesQuery({
    fetchPolicy: 'cache-and-network',
  });

  const [fetchArchived, { data: archivedData, loading: archivedLoading }] =
    useGetArchivedUserLeagueSummariesLazyQuery({
      fetchPolicy: 'cache-and-network',
    });

  const { data: archivedCachedData } = useGetArchivedUserLeagueSummariesQuery({
    fetchPolicy: 'cache-only',
  });
  const archivedCount =
    archivedCachedData?.getArchivedUserLeagueSummaries?.length ?? null;

  const leagues = useMemo<HomeLeagueSummary[]>(
    () => data?.getUserLeagueSummaries ?? [],
    [data?.getUserLeagueSummaries],
  );
  const archivedLeagues = useMemo<HomeLeagueSummary[]>(
    () => archivedData?.getArchivedUserLeagueSummaries ?? [],
    [archivedData?.getArchivedUserLeagueSummaries],
  );

  const handleShowArchived = useCallback(() => {
    setShowArchived(true);
    void fetchArchived();
  }, [fetchArchived]);

  const handleHideArchived = useCallback(() => {
    setShowArchived(false);
  }, []);

  const viewLeague = useCallback(
    (s: HomeLeagueSummary) => {
      const params = { leagueId: String(s.leagueId) };
      if (s.sport === 'football') {
        router.push({ pathname: '/football/league/[leagueId]', params });
      } else {
        router.push({ pathname: '/baseball/league/[leagueId]', params });
      }
    },
    [router],
  );

  const handleViewSport = useCallback((sport: ActiveSport) => {
    setMountedSports((prev) => {
      if (prev.has(sport)) return prev;
      const next = new Set(prev);
      next.add(sport);
      return next;
    });
    setActiveSport(sport);
  }, []);

  const handleBackFromSport = useCallback(() => {
    setActiveSport(null);
  }, []);

  // System back (hardware button / edge-swipe): dismiss the inline sport view
  // and return to the sports dashboard. Only registered when a sport view is
  // active — this is the only way back now that the sport views no longer
  // render their own back bar (LS-8766).
  useSystemBackAction(activeSport !== null, handleBackFromSport);

  const viewMatchup = useCallback(
    (s: HomeLeagueSummary) => {
      if (s.matchupId == null) {
        viewLeague(s);
        return;
      }
      const params = {
        matchupId: String(s.matchupId),
        leagueId: String(s.leagueId),
      };
      if (s.sport === 'football') {
        router.push({ pathname: '/football/matchup', params });
      } else {
        router.push({ pathname: '/baseball/matchup', params });
      }
    },
    [router, viewLeague],
  );

  const userName = formatDisplayName(userInfo.username || 'Manager');

  const handlePlayerPress = useCallback(
    (id: number) => {
      // Validate the id before navigating (LS-8627) — a blind String(id)
      // coercion let a missing/invalid id reach PlayerDetail, which fails
      // to parse it and always shows "Player Not Found".
      const playerId = toPlayerDetailIdParam(id);
      if (playerId === null) {
        LOGGER.warn(
          '[Home] skipping PlayerDetail navigation for invalid player id',
          { id },
        );
        return;
      }
      router.push({
        pathname: '/PlayerDetail',
        params: { playerId, playerName: '' },
      });
    },
    [router],
  );

  // Full feed — rendered by the delegated new-user / error states.
  const onThisDay = <OnThisDayFeed onPlayerPress={handlePlayerPress} />;
  // Condensed feed — a single top entry plus "More ›" — for the compact
  // returning-user layout (LS-8794).
  const onThisDayCondensed = (
    <OnThisDayFeed condensed onPlayerPress={handlePlayerPress} />
  );

  return (
    <>
      {/* Main sports dashboard — hidden while a sport view is active */}
      <View
        style={{ display: activeSport !== null ? 'none' : 'flex', flex: 1 }}
      >
        <MobileHomeScreen
          userName={userName}
          isLight={resolvedTheme === 'light'}
          topInset={topInset}
          leagues={leagues}
          archivedLeagues={archivedLeagues}
          archivedCount={archivedCount}
          showArchived={showArchived}
          archivedLoading={archivedLoading}
          loading={loading}
          error={Boolean(error && !data?.getUserLeagueSummaries)}
          onThisDay={onThisDay}
          onThisDayCondensed={onThisDayCondensed}
          onShowArchived={handleShowArchived}
          onHideArchived={handleHideArchived}
          onRetry={() => void refetch()}
          onViewLeague={viewLeague}
          onViewMatchup={viewMatchup}
          onSetLineup={viewLeague}
          onSeeAllLeagues={() => router.navigate('/leagues')}
          onOpenProfile={() => router.navigate('/you')}
          onMockDraft={() => router.push('/baseball/mock-draft')}
          onCreateLeague={() => router.navigate('/baseball/league/create')}
          onJoinLeague={() => router.navigate('/baseball/league/join')}
          onBrowseStats={() => router.navigate('PlayerStats')}
          onViewSport={handleViewSport}
          onStartMockDraft={() => router.push('/baseball/mock-draft')}
        />
      </View>

      {/* Sport home screens — lazily mounted, kept alive once visited so scroll
          position and component state are preserved across sport switches. */}
      {mountedSports.has('baseball') && (
        <View
          style={{
            display: activeSport === 'baseball' ? 'flex' : 'none',
            flex: 1,
            // The sport views used to get their status-bar clearance from the
            // back bar removed in LS-8766; pad the container instead.
            paddingTop: topInset,
          }}
        >
          <BaseballHomeScreen />
        </View>
      )}
      {mountedSports.has('football') && (
        <View
          style={{
            display: activeSport === 'football' ? 'flex' : 'none',
            flex: 1,
            paddingTop: topInset,
          }}
        >
          <FootballHomeScreen />
        </View>
      )}
    </>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

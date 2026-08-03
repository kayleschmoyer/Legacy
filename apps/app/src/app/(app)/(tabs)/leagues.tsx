import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HomeLeagueSummary } from '@legacy-sports/shared-components';
import { LeaguesLedgerScreen } from '@legacy-sports/shared-components/leagues';
import { useGetUserLeagueSummariesQuery } from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { usePullToRefresh } from '../../../common/hooks/usePullToRefresh';

/**
 * The Leagues tab renders the shared "Clubhouse Ledger" screen from
 * `lib/shared-components` (LS-8795) — a dense standings table of every league
 * the user manages — wired to mobile's GraphQL data layer and expo-router
 * navigation. UI is shared across platforms (shared-components-first).
 *
 * Data comes from `getUserLeagueSummaries`, the same query the Home tab uses:
 * the plain `userLeagues` query returns only id/name/sport, which cannot fill
 * the ledger's record, rank, live-matchup, and draft columns.
 */
export default function LeaguesTab() {
  const router = useRouter();
  const { top: topInset } = useSafeAreaInsets();
  const userInfo = useAuthorizedUserInfo();

  const { data, loading, refetch } = useGetUserLeagueSummariesQuery({
    fetchPolicy: 'cache-and-network',
    skip: !userInfo?.id,
  });

  const { refreshControl } = usePullToRefresh([() => refetch()]);

  const leagues = useMemo<HomeLeagueSummary[]>(
    () => data?.getUserLeagueSummaries ?? [],
    [data?.getUserLeagueSummaries],
  );

  const viewLeague = useCallback(
    (summary: HomeLeagueSummary) => {
      if (summary.leagueId == null) return;
      const params = { leagueId: String(summary.leagueId) };
      if (summary.sport === 'football') {
        router.push({ pathname: '/football/league/[leagueId]', params });
      } else {
        router.push({ pathname: '/baseball/league/[leagueId]', params });
      }
    },
    [router],
  );

  return (
    <LeaguesLedgerScreen
      leagues={leagues}
      // cache-and-network re-runs on every focus; only show the spinner when
      // there is nothing cached to render, so returning to the tab does not
      // flash an empty screen over good data.
      loading={loading && leagues.length === 0}
      topInset={topInset}
      onViewLeague={viewLeague}
      onCreateLeague={() => router.navigate('/league/create')}
      onJoinLeague={() => router.navigate('/league/join')}
      onBrowseLeagues={() => router.navigate('/league-discovery')}
      refreshControl={refreshControl}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

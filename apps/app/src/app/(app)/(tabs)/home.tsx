import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  formatDisplayName,
  type HomeLeagueSummary,
  HomeScreen,
} from '@legacy-sports/shared-components';
import { OnThisDayFeed } from '@legacy-sports/shared-components/leagues';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetArchivedUserLeagueSummariesQuery,
  useGetUserLeagueSummariesQuery,
} from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';

/**
 * The Home tab renders the shared, cross-platform `HomeScreen` dashboard from
 * `lib/shared-components`, wired to mobile's GraphQL data layer and expo-router
 * navigation. UI is shared across web and native and adapts by viewport
 * (shared-components-first, LS-7790).
 */
export default function HomeTab() {
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();
  const [showArchived, setShowArchived] = useState(false);

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

  const userName = formatDisplayName(userInfo.username || 'Manager');

  const onThisDay = (
    <OnThisDayFeed
      onPlayerPress={(id) =>
        router.push({
          pathname: '/PlayerDetail',
          params: { playerId: String(id), playerName: '' },
        })
      }
    />
  );

  return (
    <HomeScreen
      userName={userName}
      leagues={leagues}
      archivedLeagues={archivedLeagues}
      archivedCount={archivedCount}
      showArchived={showArchived}
      archivedLoading={archivedLoading}
      loading={loading}
      error={Boolean(error && !data?.getUserLeagueSummaries)}
      onThisDay={onThisDay}
      onShowArchived={handleShowArchived}
      onRetry={() => void refetch()}
      onViewLeague={viewLeague}
      onSetLineup={viewLeague}
      onMockDraft={() => router.push('/baseball/mock-draft')}
      onCreateLeague={() => router.navigate('/baseball/league/create')}
      onJoinLeague={() => router.navigate('/baseball/league/join')}
      onBrowseStats={() => router.navigate('PlayerStats')}
      onViewSport={(sport) =>
        router.navigate(sport === 'football' ? '/football' : '/baseball')
      }
      onStartMockDraft={() => router.push('/baseball/mock-draft')}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { Text, XStack } from 'tamagui';
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
import { colors } from '@legacy-sports/design-tokens';
import { LOGGER } from '@legacy-sports/logging';
import { useThemeContext } from '../../../context/ThemeContext';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { toPlayerDetailIdParam } from '../../../common/utilities/RouteUtils';
import BaseballHomeScreen from '../baseball/index';
import FootballHomeScreen from '../football/index';

type ActiveSport = 'baseball' | 'football';

const SPORT_TITLES: Record<ActiveSport, string> = {
  baseball: 'Baseball Home',
  football: 'Football Home',
};

/**
 * Minimal navigation bar rendered at the top of the inline sport views.
 * Replicates the Stack navigator header back affordance so iOS users have a
 * clear way to return to the sports dashboard without a hardware back button.
 */
function SportBackBar({
  sport,
  topInset,
  onBack,
}: {
  sport: ActiveSport;
  topInset: number;
  onBack: () => void;
}) {
  // The XStack/Text below resolve `$token` props against the active Tamagui
  // theme. ChevronLeft is a non-Tamagui icon, so it needs a resolved hex value
  // — read from the design-token package (the theme's source of truth) keyed
  // by the active light/dark theme.
  const { resolvedTheme } = useThemeContext();
  const iconColor = colors[resolvedTheme].text.fg1;

  return (
    <XStack
      alignItems="center"
      backgroundColor="$background"
      borderBottomWidth={1}
      borderBottomColor="$surfacePanelBorder"
      paddingTop={topInset}
      paddingHorizontal="$4"
      paddingVertical="$3"
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back to Sports"
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <ChevronLeft size={24} color={iconColor} />
        <Text color="$color" fontSize="$4">
          Sports
        </Text>
      </Pressable>
      <Text
        flex={1}
        textAlign="center"
        fontWeight="600"
        color="$color"
        fontSize="$5"
        marginRight="$8"
      >
        {SPORT_TITLES[sport]}
      </Text>
    </XStack>
  );
}

/**
 * The Home tab renders the shared, cross-platform `HomeScreen` dashboard from
 * `lib/shared-components`, wired to mobile's GraphQL data layer and expo-router
 * navigation. UI is shared across web and native and adapts by viewport
 * (shared-components-first, LS-7790).
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

  // Android hardware back: dismiss the inline sport view and return to the
  // sports dashboard. Only registered when a sport view is active.
  useFocusEffect(
    useCallback(() => {
      if (!activeSport) return;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          setActiveSport(null);
          return true;
        },
      );
      return () => subscription.remove();
    }, [activeSport]),
  );

  const userName = formatDisplayName(userInfo.username || 'Manager');

  const onThisDay = (
    <OnThisDayFeed
      onPlayerPress={(id) => {
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
      }}
    />
  );

  return (
    <>
      {/* Main sports dashboard — hidden while a sport view is active */}
      <View
        style={{ display: activeSport !== null ? 'none' : 'flex', flex: 1 }}
      >
        <HomeScreen
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
          onShowArchived={handleShowArchived}
          onHideArchived={handleHideArchived}
          onRetry={() => void refetch()}
          onViewLeague={viewLeague}
          onSetLineup={viewLeague}
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
          }}
        >
          <SportBackBar
            sport="baseball"
            topInset={topInset}
            onBack={handleBackFromSport}
          />
          <BaseballHomeScreen />
        </View>
      )}
      {mountedSports.has('football') && (
        <View
          style={{
            display: activeSport === 'football' ? 'flex' : 'none',
            flex: 1,
          }}
        >
          <SportBackBar
            sport="football"
            topInset={topInset}
            onBack={handleBackFromSport}
          />
          <FootballHomeScreen />
        </View>
      )}
    </>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

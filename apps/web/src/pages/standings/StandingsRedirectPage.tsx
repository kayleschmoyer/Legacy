import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner, Text, YStack } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useGetUserLeaguesQuery } from '@legacy-sports/graphql';
import { getLastVisitedLeague } from '../../lib/last-visited-league';

interface StandingsLeague {
  id?: number | null;
  sport?: string | null;
}

/**
 * Pick the league the `/standings` shortcut should open (LS-10440): the
 * last-visited league when the user is still a member of it, else the first
 * league. Callers already inside a league link straight to that league's
 * standings tab (see `MobileNavDrawer`), so this only covers the
 * no-league-context case.
 */
export function pickStandingsLeague<T extends StandingsLeague>(
  leagues: readonly T[],
  lastVisitedLeagueId: number | null,
): (T & { id: number }) | null {
  const withIds = leagues.filter((l): l is T & { id: number } => l.id != null);
  if (lastVisitedLeagueId !== null) {
    const lastVisited = withIds.find((l) => l.id === lastVisitedLeagueId);
    if (lastVisited) return lastVisited;
  }
  return withIds[0] ?? null;
}

/** `/{sport}/league/{id}/standings` for a league record. */
export function leagueStandingsPath(
  league: StandingsLeague & { id: number },
): string {
  const sport = league.sport === 'football' ? 'football' : 'baseball';
  return `/${sport}/league/${league.id}/standings`;
}

export function StandingsRedirectPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = Boolean(user);

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !isLoggedIn,
    notifyOnNetworkStatusChange: true,
  });

  if (error && !data?.userLeagues) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        minHeight={400}
        gap="$3"
      >
        <Text fontSize="$6" fontWeight="bold">
          Couldn&apos;t load standings
        </Text>
        <Text color="$gray11" textAlign="center" maxWidth={400}>
          We couldn&apos;t load your leagues. Please refresh and try again.
        </Text>
      </YStack>
    );
  }

  if (authLoading || loading || (isLoggedIn && !data?.userLeagues)) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" />
        <Text marginTop="$2" color="$gray11">
          Loading standings...
        </Text>
      </YStack>
    );
  }

  const leagues = data?.userLeagues ?? [];
  const target = pickStandingsLeague(
    leagues,
    getLastVisitedLeague()?.leagueId ?? null,
  );

  if (target) {
    return <Navigate to={leagueStandingsPath(target)} replace />;
  }

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      minHeight={400}
      gap="$3"
    >
      <Text fontSize="$6" fontWeight="bold">
        No leagues found
      </Text>
      <Text color="$gray11" textAlign="center" maxWidth={400}>
        You are not a member of any leagues yet. Join or create a league to view
        standings.
      </Text>
    </YStack>
  );
}

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner, Text, YStack } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

export function StandingsRedirectPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = Boolean(user);

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !isLoggedIn,
  });

  if (authLoading || loading || (isLoggedIn && !data)) {
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
  const firstLeague = leagues[0];

  if (firstLeague) {
    return (
      <Navigate to={`/baseball/league/${firstLeague.id}/standings`} replace />
    );
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

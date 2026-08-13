import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { ShoppingCart } from '@tamagui/lucide-icons/icons/ShoppingCart';
import { PendingWaiverClaims } from '@legacy-sports/shared-components';
import { useGetUserTeamIdQuery } from '@legacy-sports/graphql';
import { toIntId } from '../../common/utilities/RouteUtils';

export default function WaiversPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);

  const { data, loading } = useGetUserTeamIdQuery({
    skip: leagueId == null,
    variables: { leagueId: leagueId ?? 0 },
  });
  const userTeamId = data?.userTeamId ?? null;

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" color="$color" />
      </YStack>
    );
  }

  if (leagueId == null) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$textMuted" fontSize="$4" textAlign="center">
          No league selected.
        </Text>
      </YStack>
    );
  }

  if (userTeamId == null) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <ShoppingCart size={32} color="$textMuted" />
        <Text
          color="$textMuted"
          fontSize="$4"
          textAlign="center"
          marginTop="$3"
        >
          You do not have a team in this league.
        </Text>
        <Text color="$textMuted" fontSize="$3" textAlign="center">
          Join this league to view and submit waiver claims.
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack padding="$4" gap="$4">
        <PendingWaiverClaims teamId={userTeamId} />
        <Button
          size="$4"
          onPress={() =>
            router.navigate({
              pathname: '/FreeAgents',
              params: { leagueId: String(leagueId) },
            })
          }
          icon={<ShoppingCart size={18} />}
          accessibilityRole="button"
        >
          Browse Free Agents & Submit Claim
        </Button>
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert, FlatList } from 'react-native';
import { Button, Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronRight, Plus, Trophy } from '@tamagui/lucide-icons';

import { useGetUserLeaguesQuery } from '../../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';

function sportBadge(sport: string | null | undefined): string {
  return sport === 'football' ? '🏈' : '⚾';
}

function sportLabel(sport: string | null | undefined): string {
  if (sport === 'football') return 'Football';
  return 'Baseball';
}

export default function LeaguesTab() {
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  const leagues = data?.userLeagues ?? [];

  const showAddActions = useCallback(() => {
    Alert.alert('Add League', '', [
      {
        text: 'Browse Leagues',
        onPress: () => router.navigate('/league-discovery'),
      },
      {
        text: 'Join a League',
        onPress: () =>
          Alert.alert('Select Sport', '', [
            {
              text: 'Baseball',
              onPress: () => router.navigate('/baseball/league/join'),
            },
            {
              text: 'Football',
              onPress: () => router.navigate('/football/league/join'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      {
        text: 'Create a League',
        onPress: () =>
          Alert.alert('Select Sport', '', [
            {
              text: 'Baseball',
              onPress: () => router.navigate('/baseball/league/create'),
            },
            {
              text: 'Football',
              onPress: () => router.navigate('/football/league/create'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [router]);

  if (loading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
      >
        <Spinner size="large" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Screen header */}
      <XStack
        paddingHorizontal="$4"
        paddingTop="$6"
        paddingBottom="$3"
        alignItems="center"
        justifyContent="space-between"
      >
        <Text fontSize="$8" fontWeight="700" color="$color">
          Leagues
        </Text>
        <XStack
          testID="leagues-add-button"
          onPress={showAddActions}
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') showAddActions();
          }}
          backgroundColor="$blue10"
          borderRadius="$10"
          width={36}
          height={36}
          alignItems="center"
          justifyContent="center"
          pressStyle={{ opacity: 0.7 }}
          accessibilityRole="button"
          accessibilityLabel="Browse, join, or create a league"
        >
          <Plus size={20} color="white" />
        </XStack>
      </XStack>

      {leagues.length === 0 ? (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          gap="$4"
          padding="$8"
        >
          <Trophy size={48} color="$gray8" />
          <Text fontSize="$5" color="$gray10" textAlign="center">
            You are not in any leagues yet.
          </Text>
          <Button
            testID="leagues-browse-cta"
            backgroundColor="$blue10"
            borderRadius="$4"
            onPress={() => router.navigate('/league-discovery')}
            accessibilityRole="button"
          >
            <Text color="white" fontWeight="600">
              Browse Leagues
            </Text>
          </Button>
        </YStack>
      ) : (
        <FlatList
          testID="leagues-list"
          data={leagues}
          keyExtractor={(item, idx) =>
            item.id != null ? String(item.id) : `league-${idx}`
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }) => {
            if (item.id == null) return null;
            const leagueId = item.id;
            return (
              <Card
                testID={`league-row-${leagueId}`}
                backgroundColor="$gray2"
                borderRadius="$4"
                padding="$4"
                marginBottom="$3"
                pressStyle={{ opacity: 0.7, scale: 0.99 }}
                onPress={() =>
                  router.push({
                    pathname: '/league/[leagueId]',
                    params: { leagueId: String(leagueId) },
                  })
                }
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    router.push({
                      pathname: '/league/[leagueId]',
                      params: { leagueId: String(leagueId) },
                    });
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open league ${item.name ?? 'Unnamed'}`}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <XStack alignItems="center" gap="$3">
                    <Text fontSize="$7">{sportBadge(item.sport)}</Text>
                    <YStack gap="$0.5">
                      <Text fontSize="$4" fontWeight="600" color="$color">
                        {item.name ?? 'Unnamed League'}
                      </Text>
                      <Text fontSize="$2" color="$gray10">
                        {sportLabel(item.sport)}
                      </Text>
                    </YStack>
                  </XStack>
                  <ChevronRight size={18} color="$gray9" />
                </XStack>
              </Card>
            );
          }}
        />
      )}
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

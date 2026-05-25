import React from 'react';
import { Link } from 'expo-router';
import {
  Button,
  H1,
  H2,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { formatDraftStatusForCard } from '@legacy-sports/shared-components/utils';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import {
  Sport,
  useGetUserLeaguesQuery,
} from '../../../api/db/graphql.generated';

export default function FootballHome() {
  const userInfo = useAuthorizedUserInfo();

  const {
    data,
    loading: loadingLeagues,
    error,
  } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  type LeagueWithId = NonNullable<
    NonNullable<typeof data>['userLeagues'][number]
  > & { id: number };

  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        .filter((l) => l.sport === Sport.Football)
        .filter((l): l is LeagueWithId => l.id != null),
    [data?.userLeagues],
  );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$5"
      >
        {/* Hero */}
        <YStack
          alignItems="center"
          backgroundColor="$glassSurface"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$glassBorder"
          padding="$6"
          marginBottom="$3"
        >
          <H1
            color="$orange9"
            fontSize="$9"
            fontWeight="bold"
            textAlign="center"
          >
            🏈 Football Fantasy
          </H1>
          <Text color="$color" fontSize="$5" marginTop="$2" textAlign="center">
            Manage your leagues and drafts
          </Text>
        </YStack>

        {/* League management actions */}
        <H2 color="$orange9" fontSize="$7" fontWeight="bold" marginBottom="$2">
          Manage Your Leagues
        </H2>
        <XStack justifyContent="space-between" space="$3" width="100%">
          <Link href="/football/league/create" asChild>
            <Button flex={1} backgroundColor="$orange9" borderRadius="$3">
              <Text color="$white" fontSize="$4" fontWeight="bold">
                Create League
              </Text>
            </Button>
          </Link>
          <Link href="/football/leagues" asChild>
            <Button flex={1} backgroundColor="$orange9" borderRadius="$3">
              <Text color="$white" fontSize="$4" fontWeight="bold">
                Browse Leagues
              </Text>
            </Button>
          </Link>
        </XStack>

        {/* Current Leagues */}
        <H2
          color="$orange9"
          fontSize="$7"
          fontWeight="bold"
          marginVertical="$3"
        >
          Your Football Leagues
        </H2>
        <YStack
          backgroundColor="$gray2"
          borderRadius="$3"
          padding="$3"
          space="$2"
        >
          {loadingLeagues ? (
            <Spinner />
          ) : error ? (
            <YStack alignItems="center" padding="$5" space="$3">
              <Text fontSize="$6" textAlign="center">
                ⚠️
              </Text>
              <Text color="$color" fontSize="$5" textAlign="center">
                Could not load your leagues
              </Text>
              <Text color="$gray10" fontSize="$3" textAlign="center">
                There was a problem fetching your league data.
              </Text>
            </YStack>
          ) : leagues.length === 0 ? (
            <YStack alignItems="center" padding="$5" space="$3">
              <Text fontSize="$6" textAlign="center">
                🏈
              </Text>
              <Text color="$color" fontSize="$5" textAlign="center">
                No football leagues yet
              </Text>
              <Text color="$gray10" fontSize="$3" textAlign="center">
                Create your first football league to get started.
              </Text>
            </YStack>
          ) : (
            leagues.map((l) => (
              <Link
                href={{
                  params: { leagueId: l.id },
                  pathname: '/football/league/[leagueId]',
                }}
                asChild
                key={l.id}
              >
                <YStack
                  backgroundColor="$glassSurface"
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor="$glassBorder"
                  marginBottom="$2"
                >
                  <Text color="$orange9" fontSize="$6" fontWeight="600">
                    {l.name ?? 'Unnamed League'}
                  </Text>
                  <XStack space="$2" marginTop="$1">
                    <Text
                      color="$gray10"
                      fontSize="$3"
                      backgroundColor="$glassSurface"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$3"
                    >
                      🏈 Football
                    </Text>
                    {l.draftStatus && (
                      <Text
                        color="$gray10"
                        fontSize="$3"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                      >
                        {l.draftStatus === 'not-started' ||
                        l.draftStatus === 'queued'
                          ? 'Draft Pending'
                          : l.draftStatus === 'completed'
                            ? l.currentWeekNumber != null
                              ? `Week ${l.currentWeekNumber}`
                              : 'In Season'
                            : formatDraftStatusForCard(l.draftStatus)}
                      </Text>
                    )}
                  </XStack>
                </YStack>
              </Link>
            ))
          )}
        </YStack>
      </YStack>
    </ScrollView>
  );
}

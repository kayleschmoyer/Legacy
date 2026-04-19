import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Card,
  H3,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetPublicLeaguesQuery,
  useJoinPublicLeagueMutation,
} from '../../api/db/graphql.generated';
import { useIsMounted } from '../../common/hooks/useIsMounted';

const DRAFT_STATUS_FILTERS = ['All', 'Open', 'Queued', 'In Progress'] as const;

const STATUS_FILTER_TO_API: Record<string, string> = {
  Open: 'not-started',
  'In Progress': 'in-progress',
  Queued: 'queued',
};

export default function LeagueDiscoveryScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('');
  const [joinTargetId, setJoinTargetId] = useState<number | null>(null);

  const draftStatus =
    statusFilter === 'All' ? undefined : STATUS_FILTER_TO_API[statusFilter];

  const { data, loading, error, refetch } = useGetPublicLeaguesQuery({
    variables: {
      search: search.trim() || undefined,
      draftStatus,
      limit: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [joinMutation] = useJoinPublicLeagueMutation();
  const isMounted = useIsMounted();

  const leagues = data?.publicLeagues ?? [];

  const handleJoin = useCallback(
    async (leagueId: number) => {
      if (!teamName.trim()) return;
      setJoiningId(leagueId);
      try {
        const result = await joinMutation({
          variables: { leagueId, teamName: teamName.trim() },
        });
        if (!isMounted()) return;
        if (result.data?.joinPublicLeague?.success) {
          setJoinTargetId(null);
          setTeamName('');
          await refetch();
          const joinedLeagueId = result.data.joinPublicLeague.leagueId;
          if (joinedLeagueId) {
            router.navigate({
              pathname: '/baseball/league/[leagueId]' as never,
              params: { leagueId: String(joinedLeagueId) },
            } as never);
          }
        } else {
          const errorMessage =
            result.data?.joinPublicLeague?.message ?? 'Unknown error';
          LOGGER.warn('Join failed:', errorMessage);
          Alert.alert('Join Failed', errorMessage);
        }
      } catch (err) {
        if (!isMounted()) return;
        LOGGER.error('Failed to join league:', String(err));
        Alert.alert(
          'Join Failed',
          'An unexpected error occurred. Please try again.',
        );
      } finally {
        if (isMounted()) setJoiningId(null);
      }
    },
    [joinMutation, teamName, refetch, router, isMounted],
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Search */}
      <YStack padding="$3" space="$2">
        <Input
          size="$4"
          placeholder="Search leagues..."
          value={search}
          onChangeText={setSearch}
        />

        {/* Status filters */}
        <XStack space="$1" flexWrap="wrap">
          {DRAFT_STATUS_FILTERS.map((status) => (
            <Pressable key={status} onPress={() => setStatusFilter(status)}>
              <YStack
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius="$3"
                backgroundColor={statusFilter === status ? '$blue9' : '$gray3'}
              >
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color={statusFilter === status ? 'white' : '$gray11'}
                >
                  {status}
                </Text>
              </YStack>
            </Pressable>
          ))}
        </XStack>
      </YStack>

      {/* Results */}
      {loading && leagues.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner size="large" />
          <Text marginTop="$2" color="$gray10">
            Searching leagues...
          </Text>
        </YStack>
      ) : error ? (
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding="$4"
        >
          <Text color="$red10">Failed to load leagues</Text>
          <Button size="$3" marginTop="$2" onPress={() => void refetch()}>
            Retry
          </Button>
        </YStack>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item: league }) => (
            <Card padding="$3" marginBottom="$2" bordered>
              <YStack space="$2">
                <XStack justifyContent="space-between" alignItems="flex-start">
                  <YStack flex={1}>
                    <Text fontWeight="700" fontSize="$4">
                      {league.name}
                    </Text>
                  </YStack>
                  <YStack alignItems="flex-end">
                    <Text
                      fontSize="$1"
                      fontWeight="600"
                      color={league.isFull ? '$red9' : '$green9'}
                    >
                      {league.isFull
                        ? 'FULL'
                        : `${league.availableSpots ?? 0} spots`}
                    </Text>
                  </YStack>
                </XStack>

                <XStack space="$2" flexWrap="wrap">
                  <Text
                    fontSize="$1"
                    color="$blue9"
                    backgroundColor="$blue2"
                    paddingHorizontal="$1.5"
                    paddingVertical={2}
                    borderRadius="$2"
                    fontWeight="600"
                  >
                    {league.draftStatus ?? 'Open'}
                  </Text>
                  {league.playerPool && (
                    <Text
                      fontSize="$1"
                      color="$gray10"
                      backgroundColor="$gray3"
                      paddingHorizontal="$1.5"
                      paddingVertical={2}
                      borderRadius="$2"
                    >
                      {league.playerPool}
                    </Text>
                  )}
                  <Text
                    fontSize="$1"
                    color="$gray10"
                    backgroundColor="$gray3"
                    paddingHorizontal="$1.5"
                    paddingVertical={2}
                    borderRadius="$2"
                  >
                    {league.maxRosterSize ?? 0} roster
                  </Text>
                </XStack>

                {league.isAlreadyMember ? (
                  <Button
                    size="$3"
                    backgroundColor="$gray6"
                    color="$gray11"
                    disabled
                  >
                    Already a Member
                  </Button>
                ) : league.isFull ? (
                  <Button size="$3" backgroundColor="$gray6" disabled>
                    League Full
                  </Button>
                ) : joinTargetId === league.id ? (
                  <YStack space="$2">
                    <Input
                      size="$3"
                      placeholder="Enter your team name"
                      value={teamName}
                      onChangeText={setTeamName}
                    />
                    <XStack space="$2">
                      <Button
                        flex={1}
                        size="$3"
                        backgroundColor="$green9"
                        color="white"
                        disabled={
                          !teamName.trim() ||
                          joiningId === league.id ||
                          league.id == null
                        }
                        onPress={() => {
                          if (league.id != null) {
                            void handleJoin(league.id);
                          }
                        }}
                      >
                        {joiningId === league.id ? 'Joining...' : 'Join'}
                      </Button>
                      <Button
                        size="$3"
                        chromeless
                        onPress={() => {
                          setJoinTargetId(null);
                          setTeamName('');
                        }}
                      >
                        Cancel
                      </Button>
                    </XStack>
                  </YStack>
                ) : (
                  <Button
                    size="$3"
                    backgroundColor="$blue9"
                    color="white"
                    disabled={league.id == null}
                    onPress={() => setJoinTargetId(league.id ?? null)}
                  >
                    Join League
                  </Button>
                )}
              </YStack>
            </Card>
          )}
          ListEmptyComponent={
            <YStack padding="$6" alignItems="center">
              <H3 color="$gray10">No leagues found</H3>
              <Text color="$gray9" marginTop="$1" textAlign="center">
                {search
                  ? 'Try a different search term'
                  : 'No public leagues are available right now'}
              </Text>
            </YStack>
          }
        />
      )}
    </YStack>
  );
}

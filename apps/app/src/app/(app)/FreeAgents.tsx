import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView } from 'react-native';
import { Button, Card, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, Search, UserPlus, Users } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';

import {
  type GetFreeAgentPlayersQuery,
  useClaimFreeAgentMutation,
  useGetFreeAgentPlayersQuery,
  useGetLeagueByIdQuery,
  useGetTeamMembersQuery,
  useGetUserLeaguesQuery,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { useIsMounted } from '../../common/hooks/useIsMounted';

type FreeAgentPlayer = NonNullable<
  GetFreeAgentPlayersQuery['freeAgents']
>[number];

const POSITIONS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'];

function LeagueFreeAgents({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const isSearchDebouncing = search !== debouncedSearch;
  const [claimingPlayerId, setClaimingPlayerId] = useState<number | null>(null);
  const [faabBid, setFaabBid] = useState('');

  // Debounce search input to avoid re-querying on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: teamData } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });
  const userTeamId = teamData?.userTeamId;

  const { data: leagueData } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
  });
  const waiverEnabled = leagueData?.league?.waiverEnabled ?? false;
  const maxRosterSize = leagueData?.league?.maxRosterSize ?? Infinity;
  // waiverType available via leagueData?.league?.waiverType for future FAAB vs priority logic

  const { data: rosterData } = useGetTeamMembersQuery({
    variables: { teamId: userTeamId ?? 0 },
    skip: !userTeamId,
  });

  // The freeAgents query performs server-side filtering: it excludes all
  // players already on a roster in the league, so no client-side workaround
  // is needed. Search and position filters are applied client-side on the
  // already-filtered result set.
  const { data, loading, refetch } = useGetFreeAgentPlayersQuery({
    variables: { leagueId },
  });

  const isMounted = useIsMounted();

  const [claimFreeAgent, { loading: claiming }] = useClaimFreeAgentMutation({
    onCompleted: () => {
      Alert.alert('Success', 'Waiver claim submitted successfully.');
      if (!isMounted()) return;
      setClaimingPlayerId(null);
      setFaabBid('');
      void refetch();
    },
    onError: (error) => {
      LOGGER.error('Failed to claim free agent:', error.message);
      Alert.alert('Error', error.message);
    },
  });

  // The user's own roster size, used to check if the roster is full before
  // claiming a player.
  const userRosterSize = rosterData?.teamMembers?.length ?? 0;

  const handleClaim = useCallback(
    (playerId: number) => {
      // Block the claim when the user's roster is already at max capacity.
      // The server requires a `dropPlayerId` in this case, but the UI does
      // not yet support selecting a player to drop.
      if (userRosterSize >= maxRosterSize) {
        Alert.alert(
          'Roster Full',
          `Your roster is at the maximum size (${maxRosterSize}). ` +
            'You must drop a player before claiming a new one. ' +
            'Visit your roster to release a player first.',
        );
        return;
      }

      let bidAmount: number | undefined;
      if (faabBid) {
        const parsed = parseInt(faabBid, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          Alert.alert('Invalid Bid', 'Please enter a valid FAAB bid amount.');
          return;
        }
        bidAmount = parsed;
      }
      void claimFreeAgent({
        variables: {
          leagueId,
          playerId,
          faabBid: bidAmount,
        },
      });
    },
    [claimFreeAgent, leagueId, faabBid, userRosterSize, maxRosterSize],
  );

  const handleAddDirectly = useCallback(
    (playerId: number) => {
      // TODO: Wire up a direct add mutation once the backend supports it.
      // For now, show informational alert — claimFreeAgent rejects when
      // waivers are disabled, so we must not call it here.
      Alert.alert(
        'Add Player',
        'Direct free-agent adds are not yet supported. Ask your commissioner to enable waivers.',
      );
      LOGGER.warn('Attempted direct add with waivers disabled', {
        playerId,
        leagueId,
      });
    },
    [leagueId],
  );

  // The server already filters out rostered players. Apply client-side
  // search and position filters on the pre-filtered free-agent list.
  const players = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase();
    return (data?.freeAgents ?? []).filter((p) => {
      if (
        searchLower &&
        !`${p.firstName ?? ''} ${p.lastName ?? ''}`
          .toLowerCase()
          .includes(searchLower)
      ) {
        return false;
      }
      if (
        position !== 'ALL' &&
        !(p.eligiblePositions ?? []).includes(position)
      ) {
        return false;
      }
      return true;
    });
  }, [data?.freeAgents, debouncedSearch, position]);

  const renderPlayer = ({ item }: { item: FreeAgentPlayer }) => {
    const isClaiming = claimingPlayerId === item.id;
    const positions = item.eligiblePositions?.join(', ') ?? '';
    const ppg = item.scoring?.avgPointsPerGame?.toFixed(1) ?? '—';

    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$4"
        padding="$3"
        marginBottom="$2"
      >
        <XStack alignItems="center" justifyContent="space-between">
          <YStack flex={1} gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              {item.firstName} {item.lastName}
            </Text>
            <XStack gap="$2">
              <Text fontSize="$2" color="$textMuted">
                {positions}
              </Text>
              <Text fontSize="$2" color="$blue10" fontWeight="600">
                {ppg} PPG
              </Text>
            </XStack>
          </YStack>

          {item.id != null && (
            <YStack alignItems="flex-end" gap="$1">
              {isClaiming ? (
                <YStack gap="$1" alignItems="flex-end">
                  {waiverEnabled && (
                    <Input
                      size="$2"
                      width={80}
                      placeholder="FAAB $"
                      value={faabBid}
                      onChangeText={setFaabBid}
                      keyboardType="numeric"
                    />
                  )}
                  <XStack gap="$1">
                    <Button
                      size="$2"
                      backgroundColor="$green3"
                      borderColor="$green7"
                      borderWidth={1}
                      borderRadius="$2"
                      disabled={claiming}
                      onPress={() => item.id != null && handleClaim(item.id)}
                      icon={claiming ? <Spinner size="small" /> : undefined}
                    >
                      <Text fontSize="$1" color="$green10" fontWeight="600">
                        Confirm
                      </Text>
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="$gray3"
                      borderRadius="$2"
                      onPress={() => {
                        setClaimingPlayerId(null);
                        setFaabBid('');
                      }}
                    >
                      <Text fontSize="$1" color="$textMuted">
                        Cancel
                      </Text>
                    </Button>
                  </XStack>
                </YStack>
              ) : (
                <Button
                  size="$2"
                  backgroundColor="$blue3"
                  borderColor="$blue7"
                  borderWidth={1}
                  borderRadius="$2"
                  onPress={() => {
                    if (!waiverEnabled && item.id != null) {
                      // Waivers disabled — direct add (no claim mutation)
                      handleAddDirectly(item.id);
                    } else if (item.id != null) {
                      if (item.id !== claimingPlayerId) {
                        setFaabBid('');
                      }
                      setClaimingPlayerId(item.id);
                    }
                  }}
                  icon={<UserPlus size={12} color="$blue10" />}
                >
                  <Text fontSize="$1" color="$blue10" fontWeight="600">
                    {waiverEnabled ? 'Claim' : 'Add'}
                  </Text>
                </Button>
              )}
            </YStack>
          )}
        </XStack>
      </Card>
    );
  };

  return (
    <YStack flex={1}>
      <XStack alignItems="center" gap="$2" padding="$4" paddingBottom="$2">
        <Text
          onPress={onBack}
          color="$blue10"
          fontSize="$4"
          pressStyle={{ opacity: 0.7 }}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${leagueName}`}
        >
          <ChevronLeft size={16} color="$blue10" /> {leagueName}
        </Text>
      </XStack>

      {/* Search */}
      <XStack padding="$3" paddingTop="$1" gap="$2" alignItems="center">
        {isSearchDebouncing ? (
          <Spinner size="small" color="$color" />
        ) : (
          <Search size={16} color="$textMuted" />
        )}
        <Input
          flex={1}
          size="$3"
          placeholder="Search players..."
          value={search}
          onChangeText={setSearch}
        />
      </XStack>

      {/* Position filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
      >
        <XStack gap="$1.5">
          {POSITIONS.map((pos) => (
            <Text
              key={pos}
              onPress={() => setPosition(pos)}
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$10"
              backgroundColor={position === pos ? '$blue10' : '$gray3'}
              color={position === pos ? 'white' : '$gray11'}
              fontSize="$2"
              fontWeight={position === pos ? '700' : '500'}
              accessibilityRole="button"
              accessibilityLabel={pos === 'ALL' ? 'All positions' : pos}
              accessibilityState={{ selected: position === pos }}
            >
              {pos}
            </Text>
          ))}
        </XStack>
      </ScrollView>

      {/* Player list */}
      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color="$color" />
        </YStack>
      ) : (
        <FlatList
          data={players}
          renderItem={renderPlayer}
          keyExtractor={(item, index) =>
            item.id != null ? String(item.id) : `free-agent-${index}`
          }
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <YStack alignItems="center" padding="$6" gap="$2">
              <Users size={32} color="$textMuted" />
              <Text color="$textMuted" fontSize="$4">
                No free agents found
              </Text>
            </YStack>
          }
        />
      )}
    </YStack>
  );
}

export default function FreeAgentsScreen() {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  if (selectedLeague != null) {
    return (
      <LeagueFreeAgents
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onBack={() => setSelectedLeague(null)}
      />
    );
  }

  const leagues = data?.userLeagues ?? [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <Users size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Free Agents &amp; Waivers
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to browse free agents and submit waiver claims.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Users size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;
          return (
            <Card
              key={leagueId}
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$5"
              padding="$4"
              pressStyle={{ opacity: 0.8, scale: 0.98 }}
              onPress={() =>
                setSelectedLeague({
                  id: leagueId,
                  name: league.name ?? 'League',
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Browse free agents for ${league.name ?? 'League'}`}
            >
              <XStack alignItems="center" gap="$3">
                <YStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Users size={18} color="$color" />
                </YStack>
                <YStack flex={1}>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {league.name}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

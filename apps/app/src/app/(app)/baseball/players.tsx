import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { useBaseballRosteredPlayerIds } from './hooks/useBaseballRosteredPlayerIds';
import type { BaseballPlayersQuery } from '../../../api/db/graphql.generated';
import {
  Sport,
  useBaseballPlayersQuery,
  useGetUserLeaguesQuery,
} from '../../../api/db/graphql.generated';

type BaseballPlayerNode = NonNullable<
  NonNullable<BaseballPlayersQuery['players']>[number]
>;

type BaseballPosition =
  | 'All'
  | 'P'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'OF'
  | 'DH';

const POSITIONS: BaseballPosition[] = [
  'All',
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'DH',
];

const POSITION_COLORS: Record<string, string> = {
  P: '#C41E3A',
  C: '#E67E22',
  '1B': '#27AE60',
  '2B': '#27AE60',
  '3B': '#27AE60',
  SS: '#27AE60',
  OF: '#4A90D9',
  DH: '#9B59B6',
  RP: '#C41E3A',
  SP: '#C41E3A',
};

const PITCHER_POSITIONS = new Set(['SP', 'RP', 'P']);

const PAGE_SIZE = 50;

function isPitcher(positions: string[] | null | undefined): boolean {
  if (!positions || positions.length === 0) return false;
  return PITCHER_POSITIONS.has(positions[0]);
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(3).replace(/^0/, '');
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <XStack gap={3} alignItems="baseline">
      <Text
        fontSize={13}
        fontWeight="700"
        color="$color"
        fontVariant={['tabular-nums']}
      >
        {value}
      </Text>
      <Text fontSize={11} color="$gray10">
        {label}
      </Text>
    </XStack>
  );
}

function PlayerStats({ player }: { player: BaseballPlayerNode }) {
  const pitcher = isPitcher(player.eligiblePositions);

  if (pitcher) {
    const p = player.careerPitching;
    if (!p) {
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    }
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={p.era ?? '—'} label="ERA" />
        <StatChip value={`${fmt(p.wins)}-${fmt(p.losses)}`} label="W-L" />
        <StatChip value={fmt(p.strikeouts)} label="SO" />
        <StatChip value={fmt(p.saves)} label="SV" />
      </XStack>
    );
  }

  const b = player.careerBatting;
  if (!b) {
    return (
      <Text fontSize={12} color="$gray9">
        No stats available
      </Text>
    );
  }
  return (
    <XStack flexWrap="wrap" gap={10}>
      <StatChip value={fmtAvg(b.battingAverage)} label="AVG" />
      <StatChip value={fmt(b.homeRuns)} label="HR" />
      <StatChip value={fmt(b.rbi)} label="RBI" />
      <StatChip value={fmt(b.stolenBases)} label="SB" />
    </XStack>
  );
}

function PlayerRow({
  player,
  onPress,
}: {
  player: BaseballPlayerNode;
  onPress: () => void;
}) {
  const positions = player.eligiblePositions ?? [];
  const primaryPos = positions[0] ?? '?';
  const accentColor = POSITION_COLORS[primaryPos] ?? '#1B3A5C';

  return (
    <YStack
      backgroundColor="$glassSurface"
      borderWidth={1}
      borderColor="$glassBorder"
      borderRadius="$3"
      padding="$3"
      marginBottom="$2"
      gap="$2"
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      testID={`player-row-${player.id ?? 0}`}
      accessibilityRole="button"
      accessibilityLabel={`View ${player.firstName ?? ''} ${player.lastName ?? ''}`}
    >
      <XStack gap="$3" alignItems="flex-start">
        <YStack flex={1} gap="$1">
          <Text fontSize={15} fontWeight="700" color="$color" numberOfLines={1}>
            {[player.firstName, player.lastName].filter(Boolean).join(' ') ||
              'Unknown Player'}
          </Text>
          <XStack gap="$2" alignItems="center">
            {positions.slice(0, 3).map((pos) => (
              <YStack
                key={pos}
                paddingHorizontal={7}
                paddingVertical={2}
                borderRadius="$1"
                backgroundColor={`${POSITION_COLORS[pos] ?? '#1B3A5C'}26`}
                borderWidth={1}
                borderColor={`${POSITION_COLORS[pos] ?? '#1B3A5C'}80`}
              >
                <Text
                  fontSize={11}
                  fontWeight="700"
                  color={POSITION_COLORS[pos] ?? accentColor}
                >
                  {pos}
                </Text>
              </YStack>
            ))}
          </XStack>
        </YStack>
      </XStack>

      <PlayerStats player={player} />
    </YStack>
  );
}

function PositionPill({
  pos,
  selected,
  onPress,
}: {
  pos: BaseballPosition;
  selected: boolean;
  onPress: () => void;
}) {
  const accentColor =
    pos === 'All' ? '#1B3A5C' : (POSITION_COLORS[pos] ?? '#1B3A5C');
  return (
    <YStack
      paddingHorizontal={14}
      paddingVertical={10}
      minHeight={44}
      borderRadius={20}
      borderWidth={1}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      backgroundColor={selected ? `${accentColor}4D` : '$glassSurface'}
      borderColor={selected ? accentColor : '$glassBorder'}
      justifyContent="center"
      alignItems="center"
      testID={`position-pill-${pos}`}
      accessibilityLabel={`Filter by ${pos}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        fontSize={13}
        fontWeight="600"
        color={selected ? accentColor : '$gray10'}
      >
        {pos}
      </Text>
    </YStack>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setDebounced(value);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, delay]);
  return debounced;
}

export default function BaseballPlayers(): React.JSX.Element {
  const router = useRouter();
  const [position, setPosition] = useState<BaseballPosition>('All');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [allNodes, setAllNodes] = useState<BaseballPlayerNode[]>([]);
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'free_agents' | 'rostered'
  >('all');

  // Check if user has baseball leagues — availability filter only shown when true.
  const { data: leaguesData } = useGetUserLeaguesQuery();
  const hasBaseballLeagues = useMemo(
    () =>
      (leaguesData?.userLeagues ?? []).some((l) => l.sport === Sport.Baseball),
    [leaguesData],
  );
  const { playerIds: rosteredPlayerIds, loading: rosterLoading } =
    useBaseballRosteredPlayerIds(
      !hasBaseballLeagues || availabilityFilter === 'all',
    );

  const debouncedSearch = useDebounce(searchInput, 300);

  const prevFiltersRef = useRef({ position, debouncedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.position !== position ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      prevFiltersRef.current = { position, debouncedSearch };
      setOffset(0);
      setAllNodes([]);
      setIsFilterChanging(true);
    }
  }, [position, debouncedSearch]);

  const { data, loading, error } = useBaseballPlayersQuery({
    variables: {
      search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
      position: position !== 'All' ? position : undefined,
      limit: PAGE_SIZE,
      offset,
    },
    notifyOnNetworkStatusChange: true,
  });

  const prevOffsetRef = useRef(offset);
  useEffect(() => {
    const newNodes = data?.players;
    if (!newNodes) return;
    if (prevOffsetRef.current !== offset) {
      setAllNodes((prev) => [...prev, ...newNodes]);
    } else {
      setAllNodes(newNodes);
    }
    prevOffsetRef.current = offset;
    setIsFilterChanging(false);
  }, [data, offset]);

  const hasMore = (data?.players?.length ?? 0) === PAGE_SIZE;

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const isInitialLoad = loading && allNodes.length === 0;
  const isLoadingMore = loading && allNodes.length > 0;

  const displayNodes = useMemo(() => {
    if (!hasBaseballLeagues || availabilityFilter === 'all') return allNodes;
    if (availabilityFilter === 'free_agents') {
      return allNodes.filter(
        (p) => p.id != null && !rosteredPlayerIds.has(p.id),
      );
    }
    return allNodes.filter((p) => p.id != null && rosteredPlayerIds.has(p.id));
  }, [allNodes, hasBaseballLeagues, availabilityFilter, rosteredPlayerIds]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
        {/* Position filter pills */}
        <FlatList
          data={POSITIONS}
          horizontal
          showsHorizontalScrollIndicator={true}
          fadingEdgeLength={32}
          initialNumToRender={POSITIONS.length}
          keyExtractor={(item) => item}
          renderItem={({ item: pos }) => (
            <PositionPill
              pos={pos}
              selected={pos === position}
              onPress={() => setPosition(pos)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
          style={{ flexGrow: 0 }}
        />

        {/* Availability filter — shown when user is in at least one baseball league (LS-7042) */}
        {hasBaseballLeagues && (
          <XStack
            paddingHorizontal={12}
            paddingBottom={8}
            gap={8}
            alignItems="center"
            flexWrap="wrap"
          >
            <Text
              fontSize={11}
              fontWeight="700"
              color="$gray9"
              letterSpacing={0.5}
            >
              AVAILABILITY
            </Text>
            {(
              [
                ['all', 'All'],
                ['free_agents', 'Free Agents'],
                ['rostered', 'Rostered'],
              ] as const
            ).map(([value, label]) => {
              const active = availabilityFilter === value;
              return (
                <YStack
                  key={value}
                  paddingHorizontal={12}
                  paddingVertical={6}
                  borderRadius={20}
                  borderWidth={1}
                  onPress={() => setAvailabilityFilter(value)}
                  pressStyle={{ opacity: 0.7 }}
                  backgroundColor={active ? '#1B3A5C4D' : '$glassSurface'}
                  borderColor={active ? '#1B3A5C' : '$glassBorder'}
                  justifyContent="center"
                  alignItems="center"
                  testID={`availability-pill-${value}`}
                  accessibilityLabel={`Filter by ${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    fontSize={13}
                    fontWeight="600"
                    color={active ? '#4A90D9' : '$gray10'}
                  >
                    {label}
                  </Text>
                </YStack>
              );
            })}
            {rosterLoading && availabilityFilter !== 'all' && (
              <Spinner size="small" color="$gray10" />
            )}
          </XStack>
        )}

        {/* Search input */}
        <XStack paddingHorizontal={12} paddingBottom={10} alignItems="center">
          <XStack
            flex={1}
            backgroundColor="$glassSurface"
            borderWidth={1}
            borderColor="$glassBorder"
            borderRadius="$2"
            paddingHorizontal={10}
            height={44}
            alignItems="center"
          >
            <TextInput
              placeholder="Search players..."
              placeholderTextColor="#666"
              value={searchInput}
              onChangeText={setSearchInput}
              accessibilityLabel="Search players"
              style={{ flex: 1, color: '#fff', fontSize: 14, height: 44 }}
            />
          </XStack>
        </XStack>

        {/* Error banner */}
        {error && (
          <YStack
            marginHorizontal={12}
            marginBottom={8}
            padding={12}
            borderRadius="$2"
            backgroundColor="$red2"
            borderWidth={1}
            borderColor="$red6"
          >
            <Text fontSize={13} color="$red10">
              Failed to load players. Please try again.
            </Text>
          </YStack>
        )}

        {/* Player list */}
        {isInitialLoad || isFilterChanging ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Spinner size="large" color="$orange9" />
          </YStack>
        ) : (
          <FlatList
            data={displayNodes}
            keyExtractor={(item, index) => String(item.id ?? `idx-${index}`)}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                onPress={() => {
                  if (item.id == null) return;
                  router.push({
                    pathname: '/PlayerDetail',
                    params: {
                      playerId: String(item.id),
                      playerName: [item.firstName, item.lastName]
                        .filter(Boolean)
                        .join(' '),
                    },
                  });
                }}
              />
            )}
            windowSize={10}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={
              !loading ? (
                <YStack alignItems="center" padding={40} gap="$3">
                  <Text fontSize={16} color="$gray10">
                    No players found
                  </Text>
                  <Text fontSize={13} color="$gray9">
                    Try adjusting your filters or search.
                  </Text>
                </YStack>
              ) : null
            }
            ListFooterComponent={
              hasMore ? (
                <YStack alignItems="center" paddingVertical={16}>
                  {isLoadingMore ? (
                    <Spinner size="small" color="$orange9" />
                  ) : (
                    <YStack
                      paddingHorizontal={24}
                      paddingVertical={10}
                      borderRadius="$3"
                      backgroundColor="$glassSurface"
                      borderWidth={1}
                      borderColor="$glassBorder"
                      onPress={loadMore}
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text fontSize={14} color="$color" fontWeight="600">
                        Load more
                      </Text>
                    </YStack>
                  )}
                </YStack>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

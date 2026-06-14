import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronDown } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import type { NflTeam } from '@legacy-sports/shared-components';
import { NFL_TEAMS } from '@legacy-sports/shared-components';
import { StatCategory } from '@legacy-sports/shared-components/football';
import type { FootballPlayersQuery } from '../../../api/db/graphql.generated';
import { useFootballPlayersQuery } from '../../../api/db/graphql.generated';

type FootballPlayerNode = NonNullable<
  NonNullable<FootballPlayersQuery['footballPlayers']>['nodes'][number]
>;

type FootballPosition =
  | 'All'
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'FLEX'
  | 'K'
  | 'DST'
  | 'DL'
  | 'LB'
  | 'DB';

const POSITIONS: FootballPosition[] = [
  'All',
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
];

const POSITION_COLORS: Record<string, string> = {
  QB: '#4A90D9',
  RB: '#27AE60',
  WR: '#9B59B6',
  TE: '#E67E22',
  FLEX: '#C49A6C',
  K: '#95A5A6',
  DST: '#C41E3A', // seam red (team defense unit)
  DL: '#C25A2A', // burnt orange-red (defensive line)
  LB: '#9B7A3D', // amber-brown (linebackers)
  DB: '#6B3FA0', // deep purple (defensive backs)
};

const TEAM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'All', label: 'All Teams' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
  ...Object.values(NFL_TEAMS)
    .filter((t): t is NflTeam => t != null)
    .map((t) => ({
      value: t.abbreviation,
      label: `${t.abbreviation} — ${t.fullName}`,
    })),
];

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
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

function PlayerStats({ player }: { player: FootballPlayerNode }) {
  const pos = player.position;
  const isDst = player.isDst;
  const isIdp = pos === 'DL' || pos === 'LB' || pos === 'DB';
  const stats = player.careerStats;

  if (!stats) {
    return (
      <Text fontSize={12} color="$gray9">
        No stats available
      </Text>
    );
  }

  if (isDst) {
    const d = stats.defense;
    if (!d)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={fmtFloat(d.sacks)} label="Sacks" />
        <StatChip value={fmt(d.int)} label="INT" />
        <StatChip value={fmtFloat(d.ptsAllowedPerG)} label="Pts/G" />
      </XStack>
    );
  }

  if (isIdp) {
    const idp = stats.idp;
    if (!idp)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={fmt(idp.soloTkl)} label="Solo" />
        <StatChip value={fmtFloat(idp.sacks)} label="Sacks" />
        <StatChip value={fmt(idp.int)} label="INT" />
        <StatChip value={fmt(idp.ff)} label="FF" />
      </XStack>
    );
  }

  // Offense: render a labeled row for every category with a non-null record,
  // independent of the nominal position, so multi-category players (QB with
  // rushing, RB with receiving, hybrid TE/WR) surface all their stats (LS-6242).
  const { passing, rushing, receiving, kicking } = stats;
  // Server-provided FG% (LS-6244) — single source of truth, no client recompute.
  const fgPct = kicking?.fgPct ?? null;

  if (!passing && !rushing && !receiving && !kicking) {
    return (
      <Text fontSize={12} color="$gray9">
        No stats available
      </Text>
    );
  }

  return (
    <YStack gap={6}>
      {passing && (
        <StatCategory label="Pass">
          <StatChip value={fmt(passing.yds)} label="YDS" />
          <StatChip value={fmt(passing.td)} label="TD" />
          <StatChip value={fmt(passing.int)} label="INT" />
          <StatChip value={fmtFloat(passing.rating)} label="RTG" />
        </StatCategory>
      )}
      {rushing && (
        <StatCategory label="Rush">
          <StatChip value={fmt(rushing.yds)} label="YDS" />
          <StatChip value={fmt(rushing.td)} label="TD" />
        </StatCategory>
      )}
      {receiving && (
        <StatCategory label="Rec">
          <StatChip value={fmt(receiving.rec)} label="REC" />
          <StatChip value={fmt(receiving.yds)} label="YDS" />
          <StatChip value={fmt(receiving.td)} label="TD" />
        </StatCategory>
      )}
      {kicking && (
        <StatCategory label="Kick">
          <StatChip
            value={`${fmt(kicking.fgm)}/${fmt(kicking.fga)}`}
            label="FG"
          />
          <StatChip value={`${fmtFloat(fgPct)}%`} label="" />
        </StatCategory>
      )}
    </YStack>
  );
}

function PlayerRow({
  player,
  onPress,
}: {
  player: FootballPlayerNode;
  onPress?: () => void;
}) {
  const pos = player.position;
  const isDst = player.isDst;
  const displayPos = isDst ? 'DST' : (pos ?? '?');
  const accentColor = POSITION_COLORS[displayPos] ?? '#1B3A5C';
  const teamData = player.nflTeam ? NFL_TEAMS[player.nflTeam] : null;
  const teamBg = teamData?.primaryColor ?? '#1B3A5C';
  const teamFg = teamData?.secondaryColor ?? '#C5A55A';

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
      pressStyle={onPress ? { opacity: 0.7 } : undefined}
    >
      <XStack gap="$3" alignItems="flex-start">
        {/* Team badge */}
        <YStack
          width={44}
          height={44}
          borderRadius="$2"
          backgroundColor={teamBg}
          alignItems="center"
          justifyContent="center"
          borderWidth={1}
          borderColor={teamFg}
          flexShrink={0}
        >
          <Text
            fontSize={isDst ? 8 : 11}
            fontWeight="800"
            color={teamFg}
            textAlign="center"
          >
            {player.nflTeam ?? '?'}
          </Text>
        </YStack>

        <YStack flex={1} gap="$1">
          <Text fontSize={15} fontWeight="700" color="$color" numberOfLines={1}>
            {[player.firstName, player.lastName].filter(Boolean).join(' ') ||
              'Unknown Player'}
          </Text>
          <XStack gap="$2" alignItems="center">
            {/* Position badge */}
            <YStack
              paddingHorizontal={7}
              paddingVertical={2}
              borderRadius="$1"
              backgroundColor={`${accentColor}26`}
              borderWidth={1}
              borderColor={`${accentColor}80`}
            >
              <Text fontSize={11} fontWeight="700" color={accentColor}>
                {displayPos}
              </Text>
            </YStack>
            {player.nflTeam && (
              <Text fontSize={12} color="$textMuted">
                {isDst && teamData
                  ? teamData.city
                  : (teamData?.abbreviation ?? player.nflTeam ?? '')}
              </Text>
            )}
          </XStack>
        </YStack>
      </XStack>

      <YStack paddingLeft={56}>
        <PlayerStats player={player} />
      </YStack>
    </YStack>
  );
}

function PositionPill({
  pos,
  selected,
  onPress,
}: {
  pos: FootballPosition;
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

export default function FootballPlayers(): React.JSX.Element {
  const router = useRouter();
  const [position, setPosition] = useState<FootballPosition>('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<FootballPlayerNode[]>([]);
  const [isFilterChanging, setIsFilterChanging] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 300);

  const prevFiltersRef = useRef({ position, teamFilter, debouncedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.position !== position ||
      prev.teamFilter !== teamFilter ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      prevFiltersRef.current = { position, teamFilter, debouncedSearch };
      setCursor(undefined);
      setAllNodes([]);
      setIsFilterChanging(true);
    }
  }, [position, teamFilter, debouncedSearch]);

  const isConference = teamFilter === 'AFC' || teamFilter === 'NFC';

  const { data, loading, error } = useFootballPlayersQuery({
    variables: {
      position: position === 'All' ? undefined : position,
      nflTeam: !isConference && teamFilter !== 'All' ? teamFilter : undefined,
      conference: isConference ? teamFilter : undefined,
      search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
      after: cursor,
    },
    notifyOnNetworkStatusChange: true,
  });

  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    const newNodes = data?.footballPlayers?.nodes;
    if (!newNodes) return;
    if (prevCursorRef.current !== cursor) {
      setAllNodes((prev) => [...prev, ...newNodes]);
    } else {
      setAllNodes(newNodes);
    }
    prevCursorRef.current = cursor;
    setIsFilterChanging(false);
  }, [data, cursor]);

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (pageInfo?.endCursor) {
      setCursor(pageInfo.endCursor);
    }
  }, [pageInfo?.endCursor]);

  const isInitialLoad = loading && allNodes.length === 0;
  const isLoadingMore = loading && allNodes.length > 0;

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

        {/* Search + team filter row */}
        <XStack
          paddingHorizontal={12}
          paddingBottom={10}
          gap={8}
          alignItems="center"
        >
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

          <Select
            value={teamFilter}
            onValueChange={setTeamFilter}
            disablePreventBodyScroll
            renderValue={(v) => {
              if (v === 'All') return 'All Teams';
              if (v === 'AFC' || v === 'NFC') return v;
              return NFL_TEAMS[v]?.abbreviation ?? v;
            }}
          >
            <Select.Trigger
              width={130}
              borderColor="$glassBorder"
              backgroundColor="$glassSurface"
              color="$color"
              iconAfter={ChevronDown}
              borderRadius="$2"
              paddingHorizontal={8}
              height={36}
            >
              <Select.Value
                placeholder="All Teams"
                color="$color"
                fontSize={13}
              />
            </Select.Trigger>

            <Select.Content zIndex={200000}>
              <Select.ScrollUpButton />
              <Select.Viewport
                backgroundColor="$background"
                borderColor="$glassBorder"
                borderWidth={1}
                borderRadius="$3"
                minWidth={220}
              >
                <Select.Group>
                  {TEAM_OPTIONS.map((opt, i) => (
                    <Select.Item
                      key={opt.value}
                      index={i}
                      value={opt.value}
                      backgroundColor="$background"
                      hoverStyle={{ backgroundColor: '$glassSurface' }}
                    >
                      <Select.ItemText color="$color" fontSize={13}>
                        {opt.label}
                      </Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Viewport>
              <Select.ScrollDownButton />
            </Select.Content>
          </Select>
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
            data={allNodes}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                onPress={() => router.push(`/football/players/${item.id}`)}
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

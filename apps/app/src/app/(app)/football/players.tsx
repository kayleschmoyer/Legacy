import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, SafeAreaView, TextInput } from 'react-native';
import { Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronDown } from '@tamagui/lucide-icons';
import type { NflTeam } from '@legacy-sports/shared-components';
import { NFL_TEAMS } from '@legacy-sports/shared-components';
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
  K: '#95A5A6',
  DST: '#C0392B',
  DL: '#C0392B',
  LB: '#C0392B',
  DB: '#C0392B',
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

  if (pos === 'QB') {
    const p = stats.passing;
    if (!p)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={fmt(p.yds)} label="YDS" />
        <StatChip value={fmt(p.td)} label="TD" />
        <StatChip value={fmt(p.int)} label="INT" />
        <StatChip value={fmtFloat(p.rating)} label="RTG" />
      </XStack>
    );
  }

  if (pos === 'RB') {
    const r = stats.rushing;
    if (!r)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={fmt(r.yds)} label="YDS" />
        <StatChip value={fmt(r.td)} label="TD" />
      </XStack>
    );
  }

  if (pos === 'WR' || pos === 'TE') {
    const r = stats.receiving;
    if (!r)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={fmt(r.rec)} label="REC" />
        <StatChip value={fmt(r.yds)} label="YDS" />
        <StatChip value={fmt(r.td)} label="TD" />
      </XStack>
    );
  }

  if (pos === 'K') {
    const k = stats.kicking;
    if (!k)
      return (
        <Text fontSize={12} color="$gray9">
          No stats available
        </Text>
      );
    const fgPct = k.fga && k.fga > 0 ? ((k.fgm ?? 0) / k.fga) * 100 : null;
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatChip value={`${fmt(k.fgm)}/${fmt(k.fga)}`} label="FG" />
        <StatChip value={`${fmtFloat(fgPct)}%`} label="" />
      </XStack>
    );
  }

  return (
    <Text fontSize={12} color="$gray9">
      No stats available
    </Text>
  );
}

function PlayerRow({ player }: { player: FootballPlayerNode }) {
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
              <Text fontSize={12} color="$gray10">
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
      paddingVertical={7}
      borderRadius={20}
      borderWidth={1}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      backgroundColor={selected ? `${accentColor}26` : '$glassSurface'}
      borderColor={selected ? accentColor : '$glassBorder'}
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
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function FootballPlayers(): React.JSX.Element {
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

  const { data, loading, error } = useFootballPlayersQuery({
    variables: {
      position: position === 'All' ? undefined : position,
      nflTeam:
        teamFilter === 'All'
          ? undefined
          : teamFilter === 'AFC' || teamFilter === 'NFC'
            ? undefined
            : teamFilter,
      search: debouncedSearch || undefined,
      after: cursor,
    },
    notifyOnNetworkStatusChange: true,
  });

  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    const newNodes = data?.footballPlayers?.nodes;
    if (!newNodes) return;
    const filtered =
      teamFilter === 'AFC' || teamFilter === 'NFC'
        ? newNodes.filter(
            (p) => p.nflTeam && NFL_TEAMS[p.nflTeam]?.conference === teamFilter,
          )
        : newNodes;
    if (prevCursorRef.current !== cursor) {
      setAllNodes((prev) => [...prev, ...filtered]);
    } else {
      setAllNodes(filtered);
    }
    prevCursorRef.current = cursor;
    setIsFilterChanging(false);
  }, [data, cursor, teamFilter]);

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (pageInfo?.endCursor) {
      setCursor(pageInfo.endCursor);
    }
  }, [pageInfo?.endCursor]);

  const isInitialLoad = loading && allNodes.length === 0;
  const isLoadingMore = loading && allNodes.length > 0;

  const selectedTeamLabel =
    teamFilter === 'All'
      ? 'All Teams'
      : teamFilter === 'AFC' || teamFilter === 'NFC'
        ? teamFilter
        : (NFL_TEAMS[teamFilter]?.abbreviation ?? teamFilter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
      {/* Position filter pills */}
      <FlatList
        data={POSITIONS}
        horizontal
        showsHorizontalScrollIndicator={false}
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
          height={36}
          alignItems="center"
        >
          <TextInput
            placeholder="Search players..."
            placeholderTextColor="#666"
            value={searchInput}
            onChangeText={setSearchInput}
            style={{ flex: 1, color: '#fff', fontSize: 14, height: 36 }}
          />
        </XStack>

        <Select
          value={teamFilter}
          onValueChange={setTeamFilter}
          disablePreventBodyScroll
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
            <Select.Value placeholder="All Teams" color="$color" fontSize={13}>
              {selectedTeamLabel}
            </Select.Value>
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
          renderItem={({ item }) => <PlayerRow player={item} />}
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
  );
}

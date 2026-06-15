import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronDown, Star } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFeatureIsOn } from '@growthbook/growthbook-react';
import {
  BRAND_GOLD,
  NFL_TEAMS,
  TEAM_FILTER_OPTIONS_BY_SPORT,
} from '@legacy-sports/shared-components';
import { StatCategory } from '@legacy-sports/shared-components/football';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useMyRosterPlayerIds } from './hooks/useMyRosterPlayerIds';
import type { FootballPlayersQuery } from '../../../api/db/graphql.generated';
import {
  Sport,
  useFootballPlayersQuery,
  useGetUserLeaguesQuery,
} from '../../../api/db/graphql.generated';
import { useHasEntitlement } from '../../../features/subscription/useSubscription';
import PlayerStatsScreen from '../PlayerStats';

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
  | 'DB'
  | 'SUPERFLEX'
  | 'IDP';

const BASE_POSITIONS: FootballPosition[] = [
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

const PREMIUM_POSITIONS: FootballPosition[] = ['SUPERFLEX', 'IDP'];

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
  SUPERFLEX: '#D4AF37', // gold — premium composite (QB+Flex)
  IDP: '#5B7FA6', // steel blue — premium composite (DL+LB+DB)
};

const CONFERENCE_ORDER: Record<string, number> = { AFC: 0, NFC: 1 };
const DIVISION_ORDER: Record<string, number> = {
  East: 0,
  North: 1,
  South: 2,
  West: 3,
};

const TEAM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'All', label: 'All Teams' },
  { value: 'FREE_AGENT', label: 'Free Agents' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
  ...TEAM_FILTER_OPTIONS_BY_SPORT['football']
    .filter(
      (opt) =>
        opt.value !== 'All' && opt.value !== 'AFC' && opt.value !== 'NFC',
    )
    .sort((a, b) => {
      const ta = NFL_TEAMS[a.value];
      const tb = NFL_TEAMS[b.value];
      if (!ta || !tb) return 0;
      const cDiff =
        (CONFERENCE_ORDER[ta.conference] ?? 99) -
        (CONFERENCE_ORDER[tb.conference] ?? 99);
      if (cDiff !== 0) return cDiff;
      const dDiff =
        (DIVISION_ORDER[ta.division] ?? 99) -
        (DIVISION_ORDER[tb.division] ?? 99);
      if (dDiff !== 0) return dDiff;
      return ta.city.localeCompare(tb.city);
    }),
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

function ProjectionChip({ value }: { value: number | null | undefined }) {
  const display = value != null ? value.toFixed(1) : '—';
  return (
    <XStack gap={4} alignItems="center">
      <YStack
        paddingHorizontal={6}
        paddingVertical={2}
        borderRadius={4}
        backgroundColor={`${BRAND_GOLD}26`}
        borderWidth={1}
        borderColor={`${BRAND_GOLD}80`}
      >
        <Text
          fontSize={10}
          fontWeight="700"
          color={BRAND_GOLD}
          letterSpacing={0.5}
        >
          PROJ
        </Text>
      </YStack>
      <Text
        fontSize={13}
        fontWeight="700"
        color={BRAND_GOLD}
        fontVariant={['tabular-nums']}
      >
        {display}
      </Text>
      <Text fontSize={11} color="$gray10">
        pts
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
  onLongPress,
  isPremium,
}: {
  player: FootballPlayerNode;
  onPress?: () => void;
  onLongPress?: (name: string) => void;
  isPremium: boolean;
}) {
  const pos = player.position;
  const isDst = player.isDst;
  const displayPos = isDst ? 'DST' : (pos ?? '?');
  const accentColor = POSITION_COLORS[displayPos] ?? '#1B3A5C';
  const teamData = player.nflTeam ? NFL_TEAMS[player.nflTeam] : null;
  const teamBg = teamData?.primaryColor ?? '#1B3A5C';
  const teamFg = teamData?.secondaryColor ?? '#C5A55A';

  const playerName =
    [player.firstName, player.lastName].filter(Boolean).join(' ') ||
    'Unknown Player';

  return (
    <YStack
      testID={`player-row-${player.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Player: ${playerName}`}
      backgroundColor="$glassSurface"
      borderWidth={1}
      borderColor="$glassBorder"
      borderRadius="$3"
      padding="$3"
      marginBottom="$2"
      gap="$2"
      onPress={onPress}
      onLongPress={onLongPress ? () => onLongPress(playerName) : undefined}
      pressStyle={(onPress ?? onLongPress) ? { opacity: 0.7 } : undefined}
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

      <YStack paddingLeft={56} gap="$2">
        <PlayerStats player={player} />
        {isPremium && <ProjectionChip value={player.projectedFantasyPoints} />}
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

const PREMIUM_GOLD = '#C5A55A';

function MyRosteredPill({
  selected,
  onPress,
}: {
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <YStack
      paddingHorizontal={14}
      paddingVertical={8}
      borderRadius={20}
      borderWidth={1}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      backgroundColor={selected ? `${PREMIUM_GOLD}33` : '$glassSurface'}
      borderColor={selected ? PREMIUM_GOLD : '$glassBorder'}
      justifyContent="center"
      alignItems="center"
      testID="my-rostered-pill"
      accessibilityLabel="Filter by My Rostered Players"
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <XStack gap={5} alignItems="center">
        <Star
          size={13}
          color={selected ? PREMIUM_GOLD : '$gray10'}
          fill={selected ? PREMIUM_GOLD : 'transparent'}
        />
        <Text
          fontSize={13}
          fontWeight="600"
          color={selected ? PREMIUM_GOLD : '$gray10'}
        >
          My Rostered
        </Text>
      </XStack>
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

const PROJECTIONS_UPSELL_DESCRIPTION =
  'Upgrade to Premium to unlock weekly projected fantasy points for every player.';

function ProjectionsUpsellBanner() {
  return (
    <XStack
      marginHorizontal={12}
      marginBottom={8}
      padding={12}
      borderRadius="$3"
      backgroundColor={`${BRAND_GOLD}12`}
      borderWidth={1}
      borderColor={`${BRAND_GOLD}4D`}
      gap="$3"
      alignItems="center"
    >
      <Text fontSize={18} color={BRAND_GOLD}>
        ★
      </Text>
      <YStack flex={1} gap="$1">
        <Text fontSize={13} fontWeight="700" color={BRAND_GOLD}>
          Fantasy Projections — Premium
        </Text>
        <Text fontSize={12} color="$gray10">
          {PROJECTIONS_UPSELL_DESCRIPTION}
        </Text>
      </YStack>
    </XStack>
  );
}

function SportSwitcherPill({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      paddingHorizontal={14}
      paddingVertical={8}
      borderRadius={20}
      borderWidth={1}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      backgroundColor={active ? '#1B3A5C33' : '$glassSurface'}
      borderColor={active ? '#1B3A5C' : '$glassBorder'}
      justifyContent="center"
      alignItems="center"
    >
      <Text
        fontSize={14}
        fontWeight="600"
        color={active ? '#1B3A5C' : '$gray10'}
      >
        {label}
      </Text>
    </YStack>
  );
}

export function FootballPlayers(): React.JSX.Element {
  const router = useRouter();
  const isPremium = useHasEntitlement(ENTITLEMENTS.football_projections);
  const hasAdvancedFilters = useHasEntitlement(
    ENTITLEMENTS.advanced_search_filters,
  );
  const visiblePositions = hasAdvancedFilters
    ? [...BASE_POSITIONS, ...PREMIUM_POSITIONS]
    : BASE_POSITIONS;
  // Multi-select positions (LS-6464). Empty array means "All" (no filter);
  // 'All' is never stored in the array — it is the clear affordance.
  const [positions, setPositions] = useState<FootballPosition[]>([]);
  const [teamFilter, setTeamFilter] = useState('All');

  const handlePositionPress = useCallback((pos: FootballPosition) => {
    if (pos === 'All') {
      setPositions([]);
      return;
    }
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos],
    );
  }, []);
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<FootballPlayerNode[]>([]);
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  const [showMyRostered, setShowMyRostered] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'free_agents' | 'rostered'
  >('all');

  // Check if user has football leagues — availability filter only shown when true.
  const { data: leaguesData } = useGetUserLeaguesQuery();
  const hasFootballLeagues = (leaguesData?.userLeagues ?? []).some(
    (l) => l.sport === Sport.Football,
  );

  // Fetch roster data when either the availability filter or the "My Rostered"
  // premium filter needs it.
  const skipRosterFetch =
    (!isPremium || !showMyRostered) && availabilityFilter === 'all';
  const { playerIds: rosteredPlayerIds, loading: rosterLoading } =
    useMyRosterPlayerIds(skipRosterFetch);

  const debouncedSearch = useDebounce(searchInput, 300);
  const normalizedSearch = debouncedSearch.trim().toLowerCase();

  // If the user loses the advanced-search entitlement while premium positions
  // (SUPERFLEX/IDP) are selected, drop just those — the multi-select equivalent
  // of resetting a single premium selection to "All".
  useEffect(() => {
    if (!hasAdvancedFilters) {
      setPositions((prev) =>
        prev.some((p) => PREMIUM_POSITIONS.includes(p))
          ? prev.filter((p) => !PREMIUM_POSITIONS.includes(p))
          : prev,
      );
    }
  }, [hasAdvancedFilters]);

  // Stable key for the multi-select positions array so the reset effect can
  // compare by value rather than array identity.
  const positionsKey = positions.join('|');

  // Ref mirror of isFilterChanging used to guard the data effect without
  // adding isFilterChanging as a dep (which would create a circular trigger).
  const isFilterChangingRef = useRef(false);

  const prevFiltersRef = useRef({ positionsKey, teamFilter, normalizedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.positionsKey !== positionsKey ||
      prev.teamFilter !== teamFilter ||
      prev.normalizedSearch !== normalizedSearch
    ) {
      prevFiltersRef.current = { positionsKey, teamFilter, normalizedSearch };
      isFilterChangingRef.current = true;
      setCursor(undefined);
      setAllNodes([]);
      setIsFilterChanging(true);
    }
  }, [positionsKey, teamFilter, normalizedSearch]);

  const isConference = teamFilter === 'AFC' || teamFilter === 'NFC';

  const { data, loading, error } = useFootballPlayersQuery({
    variables: {
      positions: positions.length > 0 ? positions : undefined,
      nflTeam:
        !isConference && teamFilter !== 'All' && teamFilter !== 'FREE_AGENT'
          ? teamFilter
          : undefined,
      conference: isConference ? teamFilter : undefined,
      freeAgent: teamFilter === 'FREE_AGENT' ? true : undefined,
      search: normalizedSearch.length >= 2 ? normalizedSearch : undefined,
      after: cursor,
    },
    notifyOnNetworkStatusChange: true,
  });

  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    const newNodes = data?.footballPlayers?.nodes;
    if (!newNodes) return;
    // Guard: when a filter change resets cursor to undefined, the cursor dep
    // fires this effect before Apollo has refreshed data for the new variables.
    // Without this guard, the append path commits the previous query's results
    // into the now-empty allNodes, showing stale data until the new query lands.
    if (isFilterChangingRef.current && prevCursorRef.current !== cursor) {
      prevCursorRef.current = cursor;
      return;
    }
    if (prevCursorRef.current !== cursor) {
      setAllNodes((prev) => [...prev, ...newNodes]);
    } else {
      setAllNodes(newNodes);
    }
    prevCursorRef.current = cursor;
    isFilterChangingRef.current = false;
    setIsFilterChanging(false);
  }, [data, cursor]);

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (pageInfo?.endCursor) {
      setCursor(pageInfo.endCursor);
    }
  }, [pageInfo?.endCursor]);

  const handlePlayerLongPress = useCallback(
    (name: string) => {
      if (!isPremium) return;
      Alert.alert(name, 'Quick actions', [
        {
          text: 'Add to Compare',
          onPress: () => Alert.alert('Compare', `${name} added to comparison.`),
        },
        {
          text: 'Add to Watchlist',
          onPress: () =>
            Alert.alert('Watchlist', `${name} added to watchlist.`),
        },
        {
          text: 'Add to Draft Queue',
          onPress: () =>
            Alert.alert('Draft Queue', `${name} added to draft queue.`),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [isPremium],
  );

  const isInitialLoad = loading && allNodes.length === 0;
  const isLoadingMore = loading && allNodes.length > 0;

  const displayNodes = (() => {
    // Premium "My Rostered" filter takes priority.
    if (isPremium && showMyRostered) {
      return allNodes.filter((p) => rosteredPlayerIds.has(p.id));
    }
    // Availability filter (all users with football leagues).
    if (availabilityFilter === 'free_agents') {
      return allNodes.filter((p) => !rosteredPlayerIds.has(p.id));
    }
    if (availabilityFilter === 'rostered') {
      return allNodes.filter((p) => rosteredPlayerIds.has(p.id));
    }
    return allNodes;
  })();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
        {/* Position filter pills */}
        <FlatList
          data={visiblePositions}
          horizontal
          showsHorizontalScrollIndicator={true}
          fadingEdgeLength={32}
          initialNumToRender={visiblePositions.length}
          keyExtractor={(item) => item}
          renderItem={({ item: pos }) => (
            <PositionPill
              pos={pos}
              selected={
                pos === 'All' ? positions.length === 0 : positions.includes(pos)
              }
              onPress={() => handlePositionPress(pos)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
          style={{ flexGrow: 0 }}
        />

        {/* Availability filter — shown when user is in at least one football league (LS-7042) */}
        {hasFootballLeagues && (
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

        {/* Premium cross-league roster filter (LS-7071) */}
        {isPremium && (
          <XStack
            paddingHorizontal={12}
            paddingBottom={8}
            gap={8}
            alignItems="center"
          >
            <MyRosteredPill
              selected={showMyRostered}
              onPress={() => setShowMyRostered((v) => !v)}
            />
            {rosterLoading && showMyRostered && (
              <Spinner size="small" color={PREMIUM_GOLD} />
            )}
          </XStack>
        )}

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
              if (v === 'FREE_AGENT') return 'Free Agents';
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

        {/* Projections upsell — shown to free users to surface the premium feature */}
        {!isPremium && <ProjectionsUpsellBanner />}

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
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                onPress={() => router.push(`/football/players/${item.id}`)}
                onLongPress={handlePlayerLongPress}
                isPremium={isPremium}
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
export default function PlayersRoute(): React.JSX.Element {
  const [sport, setSport] = useState<'baseball' | 'football'>('football');
  const footballEnabled = useFeatureIsOn('football_enabled');

  return (
    <YStack flex={1} backgroundColor="$background">
      {footballEnabled && (
        <XStack paddingHorizontal={12} paddingVertical={10} gap={8}>
          <SportSwitcherPill
            label="Baseball"
            active={sport === 'baseball'}
            onPress={() => setSport('baseball')}
            testID="sport-switch-baseball"
          />
          <SportSwitcherPill
            label="Football"
            active={sport === 'football'}
            onPress={() => setSport('football')}
            testID="sport-switch-football"
          />
        </XStack>
      )}
      {sport === 'baseball' ? <PlayerStatsScreen /> : <FootballPlayers />}
    </YStack>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

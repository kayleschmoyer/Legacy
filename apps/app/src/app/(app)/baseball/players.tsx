import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Button, Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronDown } from '@tamagui/lucide-icons';
import {
  BattingStatsTableWithData,
  FieldingStatsTableWithData,
  MLB_TEAMS,
  PitchingStatsTableWithData,
} from '@legacy-sports/shared-components';
import {
  useGetCareerBattingStatsQuery,
  useGetCareerFieldingStatsQuery,
  useGetCareerPitchingStatsQuery,
} from '../../../api/db/graphql.generated';

enum TableView {
  BATTING,
  PITCHING,
  FIELDING,
}

type BaseballPosition =
  | 'All'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'OF'
  | 'SP'
  | 'RP'
  | 'DH';

const POSITIONS: BaseballPosition[] = [
  'All',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'SP',
  'RP',
  'DH',
];

const POSITION_COLORS: Record<string, string> = {
  C: '#4A90D9',
  '1B': '#27AE60',
  '2B': '#9B59B6',
  '3B': '#E67E22',
  SS: '#C41E3A',
  OF: '#1B3A5C',
  SP: '#D4AF37',
  RP: '#5B7FA6',
  DH: '#95A5A6',
};

const LEAGUE_ORDER: Record<string, number> = { AL: 0, NL: 1 };
const DIVISION_ORDER: Record<string, number> = { East: 0, Central: 1, West: 2 };

const TEAM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'All', label: 'All Teams' },
  { value: 'AL', label: 'AL' },
  { value: 'NL', label: 'NL' },
  ...MLB_TEAMS.slice()
    .sort((a, b) => {
      const lDiff =
        (LEAGUE_ORDER[a.league] ?? 99) - (LEAGUE_ORDER[b.league] ?? 99);
      if (lDiff !== 0) return lDiff;
      const dDiff =
        (DIVISION_ORDER[a.division] ?? 99) - (DIVISION_ORDER[b.division] ?? 99);
      if (dDiff !== 0) return dDiff;
      return a.currentName.localeCompare(b.currentName);
    })
    .map((t) => ({
      value: t.currentAbbr,
      label: `${t.currentAbbr} — ${t.currentName}`,
    })),
];

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

export default function Players(): React.JSX.Element {
  const [selectedView, setSelectedView] = useState(TableView.BATTING);
  const [searchInput, setSearchInput] = useState('');
  const [position, setPosition] = useState<BaseballPosition>('All');
  const [teamFilter, setTeamFilter] = useState('All');

  const debouncedSearch = useDebounce(searchInput, 300);

  const searchTerm = debouncedSearch.length >= 2 ? debouncedSearch : undefined;
  const positionVar = position !== 'All' ? position : undefined;
  const isLeague = teamFilter === 'AL' || teamFilter === 'NL';
  const teamVar = teamFilter !== 'All' && !isLeague ? teamFilter : undefined;

  const [battingCursor, setBattingCursor] = useState<string | undefined>(
    undefined,
  );
  const [allBattingEdges, setAllBattingEdges] = useState<
    Array<{
      player?: { firstName?: string | null; lastName?: string | null } | null;
      primaryPosition?: string | null;
      atBats?: number | null;
      hits?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      runs?: number | null;
      stolenBases?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    }>
  >([]);

  const prevBattingFiltersRef = useRef({ searchTerm, positionVar, teamVar });
  useEffect(() => {
    const prev = prevBattingFiltersRef.current;
    if (
      prev.searchTerm !== searchTerm ||
      prev.positionVar !== positionVar ||
      prev.teamVar !== teamVar
    ) {
      prevBattingFiltersRef.current = { searchTerm, positionVar, teamVar };
      setBattingCursor(undefined);
      setAllBattingEdges([]);
    }
  }, [searchTerm, positionVar, teamVar]);

  const {
    data: battingData,
    loading: battingLoading,
    error: battingError,
  } = useGetCareerBattingStatsQuery({
    variables: {
      searchTerm,
      position: positionVar,
      team: teamVar,
      after: battingCursor,
    },
    notifyOnNetworkStatusChange: true,
  });

  const prevBattingCursorRef = useRef(battingCursor);
  useEffect(() => {
    const newEdges = battingData?.careerBattingStats?.edges;
    if (!newEdges) return;
    if (prevBattingCursorRef.current !== battingCursor) {
      setAllBattingEdges(
        (prev) =>
          [
            ...prev,
            ...newEdges.map((e) => e?.node).filter(Boolean),
          ] as typeof allBattingEdges,
      );
    } else {
      setAllBattingEdges(
        newEdges.map((e) => e?.node).filter(Boolean) as typeof allBattingEdges,
      );
    }
    prevBattingCursorRef.current = battingCursor;
  }, [battingData, battingCursor]);

  const battingPageInfo = battingData?.careerBattingStats?.pageInfo;
  const hasBattingMore = battingPageInfo?.hasNextPage ?? false;

  const loadMoreBatting = useCallback(() => {
    if (battingPageInfo?.endCursor) {
      setBattingCursor(battingPageInfo.endCursor);
    }
  }, [battingPageInfo?.endCursor]);

  const {
    data: pitchingData,
    loading: pitchingLoading,
    error: pitchingError,
  } = useGetCareerPitchingStatsQuery({
    variables: {
      searchTerm,
      position: positionVar,
      team: teamVar,
    },
  });

  const {
    data: fieldingData,
    loading: fieldingLoading,
    error: fieldingError,
  } = useGetCareerFieldingStatsQuery();

  const battingNodes = allBattingEdges.map((node) => ({
    player: node.player
      ? {
          name:
            [node.player.firstName, node.player.lastName]
              .filter(Boolean)
              .join(' ') || undefined,
        }
      : undefined,
    ab: node.atBats,
    h: node.hits,
    hr: node.homeRuns,
    rbi: node.rbi,
    r: node.runs,
    sb: node.stolenBases,
    bb: node.baseOnBalls,
    so: node.strikeouts,
    avg: node.battingAverage,
    obp: node.onBasePercentage,
    slg: node.sluggingPercentage,
  }));

  const pitchingNodes = pitchingData?.careerPitchingStats
    ?.map((s) =>
      s
        ? {
            player: s.player
              ? {
                  name:
                    [s.player.firstName, s.player.lastName]
                      .filter(Boolean)
                      .join(' ') || undefined,
                }
              : undefined,
            w: s.wins,
            l: s.losses,
            era: s.era != null ? parseFloat(s.era) : null,
            g: s.games,
            gs: s.gamesStarted,
            sv: s.saves,
            h: s.hits,
            er: s.earnedRuns,
            hr: s.homeRuns,
            bb: s.baseOnBalls,
            so: s.strikeouts,
          }
        : null,
    )
    .filter((n): n is NonNullable<typeof n> => n != null);

  const fieldingNodes = fieldingData?.careerFieldingStats
    ?.map((s) =>
      s
        ? {
            a: s.assists,
            cg: s.completeGames,
            chances: s.chances,
            cs: s.caughtStealing,
            dpDef: s.doublePlays,
            eDef: s.errors,
            g: s.games,
            gs: s.gamesStarted,
            innDef: s.inningsDefended,
            pickoffs: s.pickoffs,
            po: s.putouts,
            pos: s.positions,
            sb: s.stolenBases,
            wp: s.wildPitches,
          }
        : null,
    )
    .filter((n): n is NonNullable<typeof n> => n != null);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SafeAreaView style={{ backgroundColor: '#0A0F1A', flex: 1 }}>
        {/* Position filter pills */}
        <FlatList
          data={POSITIONS}
          horizontal
          showsHorizontalScrollIndicator={true}
          initialNumToRender={POSITIONS.length}
          keyExtractor={(item) => item}
          renderItem={({ item: pos }) => (
            <PositionPill
              pos={pos}
              selected={position === pos}
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
              if (v === 'AL' || v === 'NL') return v;
              const team = MLB_TEAMS.find((t) => t.currentAbbr === v);
              return team?.currentAbbr ?? v;
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

        {/* Tab buttons */}
        <XStack borderTopColor="#333333" borderTopWidth={1}>
          <Button
            alignItems="center"
            flex={1}
            height={50}
            justifyContent="center"
            backgroundColor={
              selectedView === TableView.BATTING ? '$blue8' : 'transparent'
            }
            borderRadius={0}
            onPress={() => setSelectedView(TableView.BATTING)}
          >
            <Text color="$color" fontSize="$6" fontWeight="bold">
              Batting
            </Text>
          </Button>
          <Button
            alignItems="center"
            flex={1}
            height={50}
            justifyContent="center"
            backgroundColor={
              selectedView === TableView.PITCHING ? '$blue8' : 'transparent'
            }
            borderRadius={0}
            onPress={() => setSelectedView(TableView.PITCHING)}
          >
            <Text color="$color" fontSize="$6" fontWeight="bold">
              Pitching
            </Text>
          </Button>
          <Button
            alignItems="center"
            flex={1}
            height={50}
            justifyContent="center"
            backgroundColor={
              selectedView === TableView.FIELDING ? '$blue8' : 'transparent'
            }
            borderRadius={0}
            onPress={() => setSelectedView(TableView.FIELDING)}
          >
            <Text color="$color" fontSize="$6" fontWeight="bold">
              Fielding
            </Text>
          </Button>
        </XStack>

        {selectedView === TableView.BATTING &&
          (battingLoading && allBattingEdges.length === 0 ? (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <Spinner size="large" color="$orange9" />
            </YStack>
          ) : (
            <>
              <BattingStatsTableWithData
                data={{ nodes: battingNodes }}
                loading={false}
                error={battingError}
              />
              {hasBattingMore && (
                <YStack alignItems="center" paddingVertical={16}>
                  {battingLoading ? (
                    <Spinner size="small" color="$orange9" />
                  ) : (
                    <YStack
                      paddingHorizontal={24}
                      paddingVertical={10}
                      borderRadius="$3"
                      backgroundColor="$glassSurface"
                      borderWidth={1}
                      borderColor="$glassBorder"
                      onPress={loadMoreBatting}
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text fontSize={14} color="$color" fontWeight="600">
                        Load more
                      </Text>
                    </YStack>
                  )}
                </YStack>
              )}
            </>
          ))}
        {selectedView === TableView.PITCHING && (
          <PitchingStatsTableWithData
            data={{ nodes: pitchingNodes }}
            loading={pitchingLoading}
            error={pitchingError}
          />
        )}
        {selectedView === TableView.FIELDING && (
          <FieldingStatsTableWithData
            data={{ nodes: fieldingNodes }}
            loading={fieldingLoading}
            error={fieldingError}
          />
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

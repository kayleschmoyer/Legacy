import React, { useCallback, useMemo, useState } from 'react';
import {
  H1,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  PlayerStatsPage,
  type PlayerWithStats,
} from '@legacy-sports/shared-components';
import {
  type GetPlayerCareerStatsQuery,
  useGetPlayerCareerStatsQuery,
} from '../../api/db/graphql.generated';
import { PremiumGate } from '../../features/subscription/PremiumGate';
import { useSubscription } from '../../features/subscription/useSubscription';

const BRAND_GOLD = '#B8962E';
const BRAND_NAVY = '#1A2A4A';
const SEAM_RED = '#C41E3A';

/** Maximum number of players that can be compared side-by-side. */
const MAX_PLAYERS = 4;
const FEATURE_NAME = 'Player Comparison';

interface SelectedPlayer {
  id: number;
  name: string;
}

/** A single comparison row: a stat label plus how to extract/format/compare it. */
interface StatRow {
  key: string;
  label: string;
  /** Whether a higher or lower value is "better" (used to highlight the leader). */
  better: 'higher' | 'lower';
  /** Numeric value used for both display and leader comparison (null if absent). */
  value: (stats: GetPlayerCareerStatsQuery | undefined) => number | null;
  /** Render the numeric value for display. */
  format: (value: number | null) => string;
}

const DASH = '—';

/** Format an integer-ish counting stat with thousands separators. */
function fmtCount(value: number | null): string {
  if (value == null) return DASH;
  return value.toLocaleString('en-US');
}

/** Format a rate stat (AVG/OBP/SLG) as a 3-decimal figure without a leading zero. */
function fmtRate(value: number | null): string {
  if (value == null) return DASH;
  return value.toFixed(3).replace(/^0\./, '.');
}

/** Format ERA as a 2-decimal figure. */
function fmtEra(value: number | null): string {
  if (value == null) return DASH;
  return value.toFixed(2);
}

const BATTING_ROWS: StatRow[] = [
  {
    key: 'games',
    label: 'Games',
    better: 'higher',
    value: (s) => s?.batting?.games ?? null,
    format: fmtCount,
  },
  {
    key: 'avg',
    label: 'AVG',
    better: 'higher',
    value: (s) => s?.batting?.battingAverage ?? null,
    format: fmtRate,
  },
  {
    key: 'hr',
    label: 'HR',
    better: 'higher',
    value: (s) => s?.batting?.homeRuns ?? null,
    format: fmtCount,
  },
  {
    key: 'rbi',
    label: 'RBI',
    better: 'higher',
    value: (s) => s?.batting?.rbi ?? null,
    format: fmtCount,
  },
  {
    key: 'hits',
    label: 'Hits',
    better: 'higher',
    value: (s) => s?.batting?.hits ?? null,
    format: fmtCount,
  },
  {
    key: 'runs',
    label: 'Runs',
    better: 'higher',
    value: (s) => s?.batting?.runs ?? null,
    format: fmtCount,
  },
  {
    key: 'sb',
    label: 'SB',
    better: 'higher',
    value: (s) => s?.batting?.stolenBases ?? null,
    format: fmtCount,
  },
  {
    key: 'obp',
    label: 'OBP',
    better: 'higher',
    value: (s) => s?.batting?.onBasePercentage ?? null,
    format: fmtRate,
  },
  {
    key: 'slg',
    label: 'SLG',
    better: 'higher',
    value: (s) => s?.batting?.sluggingPercentage ?? null,
    format: fmtRate,
  },
];

const PITCHING_ROWS: StatRow[] = [
  {
    key: 'wins',
    label: 'W',
    better: 'higher',
    value: (s) => s?.pitching?.wins ?? null,
    format: fmtCount,
  },
  {
    key: 'losses',
    label: 'L',
    better: 'lower',
    value: (s) => s?.pitching?.losses ?? null,
    format: fmtCount,
  },
  {
    key: 'era',
    label: 'ERA',
    better: 'lower',
    // ERA is delivered as a string from the API; coerce for comparison/format.
    value: (s) => (s?.pitching?.era == null ? null : Number(s.pitching.era)),
    format: fmtEra,
  },
  {
    key: 'so',
    label: 'SO',
    better: 'higher',
    value: (s) => s?.pitching?.strikeouts ?? null,
    format: fmtCount,
  },
  {
    key: 'saves',
    label: 'SV',
    better: 'higher',
    value: (s) => s?.pitching?.saves ?? null,
    format: fmtCount,
  },
];

/** Column data for one selected player. */
interface ComparisonColumn {
  player: SelectedPlayer;
  stats: GetPlayerCareerStatsQuery | undefined;
  loading: boolean;
  /** True when the player's stats query failed (network/server error). */
  error: boolean;
}

/**
 * Return the set of column indices holding the leading value for a row. Returns
 * an empty set when fewer than two values are present (nothing to compare).
 */
function leaderIndices(
  values: (number | null)[],
  better: StatRow['better'],
): Set<number> {
  const present = values
    .map((value, index) => ({ value, index }))
    .filter(
      (entry): entry is { value: number; index: number } => entry.value != null,
    );
  if (present.length < 2) return new Set();
  const best =
    better === 'higher'
      ? Math.max(...present.map((entry) => entry.value))
      : Math.min(...present.map((entry) => entry.value));
  return new Set(
    present.filter((entry) => entry.value === best).map((entry) => entry.index),
  );
}

const LABEL_WIDTH = 96;
const VALUE_WIDTH = 92;

interface ComparisonTableProps {
  title: string;
  rows: StatRow[];
  columns: ComparisonColumn[];
}

/** Side-by-side stat table for one stat group (batting or pitching). */
function ComparisonTable({
  title,
  rows,
  columns,
}: ComparisonTableProps): React.JSX.Element {
  const leaders = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const row of rows) {
      map[row.key] = leaderIndices(
        columns.map((column) => row.value(column.stats)),
        row.better,
      );
    }
    return map;
  }, [rows, columns]);

  return (
    <YStack gap="$2" marginTop="$4">
      <Text
        color={BRAND_GOLD}
        fontSize="$5"
        fontWeight="bold"
        textTransform="uppercase"
      >
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack>
          {/* Stat label column */}
          <YStack width={LABEL_WIDTH}>
            <YStack height={40} justifyContent="flex-end" paddingBottom="$1">
              <Text color="$colorSubtle" fontSize="$2" fontWeight="600">
                Stat
              </Text>
            </YStack>
            {rows.map((row) => (
              <YStack
                key={row.key}
                height={32}
                justifyContent="center"
                borderTopWidth={1}
                borderColor="$borderColor"
              >
                <Text color="$color" fontSize="$3" fontWeight="600">
                  {row.label}
                </Text>
              </YStack>
            ))}
          </YStack>

          {/* One column per selected player */}
          {columns.map((column, columnIndex) => (
            <YStack
              key={column.player.id}
              width={VALUE_WIDTH}
              alignItems="flex-end"
              testID={`compare-column-${column.player.id}`}
            >
              <YStack height={40} justifyContent="flex-end" paddingBottom="$1">
                <Text
                  color="$color"
                  fontSize="$2"
                  fontWeight="700"
                  numberOfLines={1}
                  textAlign="right"
                >
                  {column.player.name}
                </Text>
                {column.error ? (
                  <Text color={SEAM_RED} fontSize="$1" textAlign="right">
                    Stats unavailable
                  </Text>
                ) : null}
              </YStack>
              {rows.map((row) => {
                const isLeader = leaders[row.key]?.has(columnIndex) ?? false;
                return (
                  <YStack
                    key={row.key}
                    height={32}
                    justifyContent="center"
                    alignItems="flex-end"
                    borderTopWidth={1}
                    borderColor="$borderColor"
                  >
                    {column.loading ? (
                      <Spinner size="small" />
                    ) : (
                      <Text
                        fontSize="$3"
                        fontWeight={isLeader ? '700' : '400'}
                        color={
                          column.error
                            ? '$colorSubtle'
                            : isLeader
                              ? BRAND_GOLD
                              : '$color'
                        }
                        fontVariant={['tabular-nums']}
                      >
                        {row.format(row.value(column.stats))}
                      </Text>
                    )}
                  </YStack>
                );
              })}
            </YStack>
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}

/**
 * Interactive body of the comparison screen. Lets the user pick up to
 * {@link MAX_PLAYERS} players via the shared PlayerStatsPage and renders their
 * career batting (and pitching, when applicable) stats side by side.
 */
function PlayerComparisonContent(): React.JSX.Element {
  const [selected, setSelected] = useState<SelectedPlayer[]>([]);

  // Rules of hooks: call a fixed number of queries (one per slot) and skip the
  // unused slots, mirroring the web PlayerComparisonPage 4-slot pattern.
  const slot0 = useGetPlayerCareerStatsQuery({
    variables: { playerId: selected[0]?.id ?? 0 },
    skip: selected[0] == null,
  });
  const slot1 = useGetPlayerCareerStatsQuery({
    variables: { playerId: selected[1]?.id ?? 0 },
    skip: selected[1] == null,
  });
  const slot2 = useGetPlayerCareerStatsQuery({
    variables: { playerId: selected[2]?.id ?? 0 },
    skip: selected[2] == null,
  });
  const slot3 = useGetPlayerCareerStatsQuery({
    variables: { playerId: selected[3]?.id ?? 0 },
    skip: selected[3] == null,
  });
  const slots = [slot0, slot1, slot2, slot3];

  const columns: ComparisonColumn[] = selected.map((player, index) => ({
    player,
    stats: slots[index].data,
    loading: slots[index].loading,
    error: slots[index].error != null,
  }));

  const handleAddPlayer = useCallback((player: PlayerWithStats) => {
    const id = typeof player.id === 'number' ? player.id : Number(player.id);
    if (!Number.isFinite(id)) return;
    setSelected((current) => {
      if (current.length >= MAX_PLAYERS) return current;
      if (current.some((entry) => entry.id === id)) return current;
      return [...current, { id, name: player.name }];
    });
  }, []);

  const handleRemovePlayer = useCallback((id: number) => {
    setSelected((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const showPitching = columns.some(
    (column) => (column.stats?.pitching?.games ?? 0) > 0,
  );
  const atCapacity = selected.length >= MAX_PLAYERS;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack backgroundColor="$background" flexGrow={1} padding="$4" gap="$3">
        <YStack gap="$1">
          <H1 color={BRAND_GOLD} fontSize="$9" fontWeight="bold">
            Player Comparison
          </H1>
          <Text color="$colorSubtle" fontSize="$4">
            Compare up to {MAX_PLAYERS} players head-to-head across their career
            stats.
          </Text>
        </YStack>

        {/* Selected players + remove chips */}
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          <Text color="$colorSubtle" fontSize="$2" fontWeight="600">
            Selected ({selected.length}/{MAX_PLAYERS}):
          </Text>
          {selected.length === 0 ? (
            <Text color="$colorSubtle" fontSize="$3">
              none yet
            </Text>
          ) : (
            selected.map((player) => (
              <XStack
                key={player.id}
                testID={`selected-chip-${player.id}`}
                backgroundColor={`${BRAND_NAVY}22`}
                borderColor={`${BRAND_GOLD}73`}
                borderWidth={1}
                borderRadius="$10"
                paddingHorizontal="$3"
                paddingVertical="$1"
                alignItems="center"
                gap="$2"
              >
                <Text color="$color" fontSize="$3">
                  {player.name}
                </Text>
                <Text
                  testID={`remove-player-${player.id}`}
                  color={BRAND_GOLD}
                  fontSize="$4"
                  fontWeight="700"
                  onPress={() => handleRemovePlayer(player.id)}
                >
                  ✕
                </Text>
              </XStack>
            ))
          )}
        </XStack>

        {selected.length < 2 ? (
          <YStack
            backgroundColor="$gray2"
            borderRadius="$4"
            padding="$4"
            marginTop="$2"
          >
            <Text color="$colorSubtle" fontSize="$3">
              Select at least two players below to see a side-by-side
              comparison.
            </Text>
          </YStack>
        ) : (
          <YStack>
            <ComparisonTable
              title="Batting"
              rows={BATTING_ROWS}
              columns={columns}
            />
            {showPitching ? (
              <ComparisonTable
                title="Pitching"
                rows={PITCHING_ROWS}
                columns={columns}
              />
            ) : null}
          </YStack>
        )}

        <Separator marginVertical="$3" />

        <Text color="$color" fontSize="$5" fontWeight="bold">
          {atCapacity ? 'Maximum players selected' : 'Add a player'}
        </Text>
        {atCapacity ? (
          <Text color="$colorSubtle" fontSize="$3">
            Remove a player above to compare someone else.
          </Text>
        ) : (
          <YStack testID="player-selector">
            <PlayerStatsPage
              onPlayerDetails={handleAddPlayer}
              showHeader={false}
              showActions={false}
              statsFormat="standard"
            />
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}

/**
 * Mobile Player Comparison screen (LS-5186). Brings the web PlayerComparisonPage
 * feature to mobile behind the shared PremiumGate: premium users get the
 * head-to-head comparison tool, while free users see the upgrade prompt — closing
 * the web/mobile parity gap for this premium feature.
 */
export default function PlayerComparisonScreen(): React.JSX.Element {
  const { isPremium, loading } = useSubscription();

  if (loading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
      >
        <Spinner size="large" color={BRAND_GOLD} />
      </YStack>
    );
  }

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName={FEATURE_NAME}
      featureDescription="Compare players head-to-head across their career stats with Premium."
    >
      <PlayerComparisonContent />
    </PremiumGate>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

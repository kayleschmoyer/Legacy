/**
 * PitchingStatsDataGrid - Career Pitching Statistics Data Grid
 *
 * A comprehensive data grid component for displaying career pitching
 * statistics with server-side sorting, filtering, and pagination.
 *
 * Features:
 * - Server-side operations with GraphQL (sort, filter, paginate)
 * - Responsive design (mobile-first)
 * - Accessibility compliant (ARIA labels, keyboard navigation)
 * - Cross-platform compatibility (Web/React Native)
 * - Performance optimized
 *
 * @author Legacy Sports Team
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { Button, Input, Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { PITCHING_POSITIONS } from '@legacy-sports/utils';
import {
  computeScoring,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import { getPageRange } from './paginationUtils';
import { formatPositionsPlayed } from './services/CareerStatsService';
import {
  type CareerPitchingFragment,
  type GetCareerPitchingStatsQueryVariables,
  useGetCareerPitchingStatsCountQuery,
  useGetCareerPitchingStatsQuery,
} from '../../api/db/graphql.generated';

// ─── Brand color constants (mirror apps/web/src/constants/colors.ts) ──────────
const BRAND_NAVY = '#1B3A5C';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_NAVY_DARK = '#143050';
const BRAND_GOLD = '#C5A55A';
const BRAND_GOLD_LIGHT = '#D4BB78';
const TEXT_HIGH_CONTRAST = '#F5F7FA';
const TEXT_MUTED = '#9CAAC5';
const BG_PAGE = '#0A0F1A';
const OUTLINE_SUBTLE = '#1C2740';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// SVG icons — web-only; return null on native to avoid DOM svg crash
const SearchIcon = ({ color }: { color?: string }) => {
  if (Platform.OS !== 'web') return null;
  return (
    <svg
      aria-hidden="true"
      focusable={false}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? TEXT_MUTED}
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
};
const AlertIcon = () => {
  if (Platform.OS !== 'web') return null;
  return (
    <svg
      role="img"
      aria-label="Error"
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C41E3A"
      strokeWidth="1.6"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
};

// =============================================================================
// Type Definitions
// =============================================================================

export interface PitchingGridColumn {
  readonly key: string;
  readonly label: string;
  readonly sortable: boolean;
  readonly width?: number | string;
  readonly minWidth?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly priority: 'high' | 'medium' | 'low';
  readonly formatter?: (value: unknown) => string;
  readonly description?: string;
}

export interface PitchingStatsDataGridProps {
  title?: string;
  initialParams?: Partial<GetCareerPitchingStatsQueryVariables>;
  onPlayerSelect?: (player: CareerPitchingFragment) => void;
  showSearch?: boolean;
  showFilters?: boolean;
  showPagination?: boolean;
  showSorting?: boolean;
  className?: string;
  testId?: string;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
}

// =============================================================================
// Helpers
// =============================================================================

function computePitchingFantasyPoints(
  player: CareerPitchingFragment | null | undefined,
): number {
  if (!player) return 0;
  return computeScoring(
    {
      bb: player.baseOnBalls ?? 0,
      er: player.earnedRuns ?? 0,
      h: player.hits ?? 0,
      l: player.losses ?? 0,
      outsRecorded: player.outsRecorded ?? 0,
      so: player.strikeouts ?? 0,
      sv: player.saves ?? 0,
      w: player.wins ?? 0,
    },
    DEFAULT_PITCHING_SCORING,
  );
}

// =============================================================================
// Column Configuration
// =============================================================================

export const PITCHING_STATS_COLUMNS: readonly PitchingGridColumn[] = [
  {
    key: 'playerName' as unknown as string,
    label: 'Player',
    sortable: true,
    width: '200px',
    align: 'left',
    priority: 'high',
    description: 'Player name',
  },
  {
    key: 'formattedPositions',
    label: 'Pos',
    sortable: false,
    width: '100px',
    minWidth: 80,
    align: 'left',
    priority: 'medium',
    description: 'Positions played, sorted by most games',
  },
  {
    key: 'games',
    label: 'G',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Games pitched',
  },
  {
    key: 'wins',
    label: 'W',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'high',
    description: 'Wins',
  },
  {
    key: 'losses',
    label: 'L',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'high',
    description: 'Losses',
  },
  {
    key: 'era',
    label: 'ERA',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Earned run average',
    formatter: (value: unknown) =>
      value != null &&
      (typeof value === 'string' || typeof value === 'number') &&
      value !== ''
        ? parseFloat(String(value)).toFixed(2)
        : '-',
  },
  {
    key: 'gamesStarted',
    label: 'GS',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Games started',
  },
  {
    key: 'completeGames',
    label: 'CG',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'low',
    description: 'Complete games',
  },
  {
    key: 'shutouts',
    label: 'SHO',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Shutouts',
  },
  {
    key: 'saves',
    label: 'SV',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Saves',
  },
  {
    key: 'strikeouts',
    label: 'SO',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Strikeouts',
  },
  {
    key: 'baseOnBalls',
    label: 'BB',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Base on balls (walks)',
  },
  {
    key: 'hits',
    label: 'H',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'low',
    description: 'Hits allowed',
  },
  {
    key: 'earnedRuns',
    label: 'ER',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'low',
    description: 'Earned runs',
  },
  {
    key: 'pitchingWAR',
    label: 'WAR',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Pitching Wins Above Replacement',
    formatter: (v: unknown) => (v != null ? (v as number).toFixed(1) : '—'),
  },
  {
    key: 'fantasyPoints',
    label: 'FPTS',
    sortable: false,
    width: '80px',
    align: 'center',
    priority: 'high',
    description: 'Career fantasy points using default scoring settings',
  },
  {
    key: 'fantasyPointsPerGame',
    label: 'FPTS/G',
    sortable: false,
    width: '80px',
    align: 'center',
    priority: 'high',
    description:
      'Average fantasy points per game using default scoring settings',
  },
] as const;

const COLUMN_TO_SORT_FIELD_MAP: Record<string, string> = {
  playerName: 'lastName',
  games: 'games',
  wins: 'wins',
  losses: 'losses',
  era: 'era',
  gamesStarted: 'gamesStarted',
  completeGames: 'completeGames',
  shutouts: 'shutouts',
  saves: 'saves',
  strikeouts: 'strikeouts',
  baseOnBalls: 'baseOnBalls',
  hits: 'hits',
  earnedRuns: 'earnedRuns',
  pitchingWAR: 'pitchingWAR',
};

// =============================================================================
// Component Implementation
// =============================================================================

export function PitchingStatsDataGrid({
  title = 'Career Pitching Statistics',
  initialParams = {},
  onPlayerSelect,
  showSearch = true,
  showFilters = true,
  showPagination = true,
  showSorting = true,
  className,
  testId = 'pitching-stats-data-grid',
  statsFormat = 'expanded',
}: PitchingStatsDataGridProps): React.ReactElement {
  // =============================================================================
  // State Management
  // =============================================================================

  const [queryParams, setQueryParams] =
    useState<GetCareerPitchingStatsQueryVariables>({
      limit: initialParams.limit || 25,
      offset: initialParams.offset || 0,
      orderBy: initialParams.orderBy || 'wins',
      orderDirection: initialParams.orderDirection || 'desc',
      ...initialParams,
    });

  const [searchTerm, setSearchTerm] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localFilters, setLocalFilters] = useState({
    minGames: initialParams.minGames ?? 0,
    minWins: initialParams.minWins ?? 0,
    minStrikeouts: initialParams.minStrikeouts ?? 0,
  });
  const [positionFilter, setPositionFilter] = useState(
    (initialParams.position as string) ?? '',
  );

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const { data, loading, error, refetch } = useGetCareerPitchingStatsQuery({
    variables: queryParams,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network',
  });

  const pitchingData = data?.careerPitchingStats ?? [];

  const { data: countData } = useGetCareerPitchingStatsCountQuery({
    variables: {
      minGames: queryParams.minGames,
      minWins: queryParams.minWins,
      minStrikeouts: queryParams.minStrikeouts,
      searchTerm: queryParams.searchTerm,
      position: queryParams.position,
      team: queryParams.team,
    },
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });
  const totalCount = countData?.careerPitchingStatsCount ?? pitchingData.length;

  // =============================================================================
  // Event Handlers
  // =============================================================================

  const updateQueryParams = useCallback(
    (updates: Partial<GetCareerPitchingStatsQueryVariables>) => {
      setQueryParams((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSort = useCallback(
    (columnKey: string, orderDirection: 'asc' | 'desc') => {
      const sortField = COLUMN_TO_SORT_FIELD_MAP[columnKey] || columnKey;
      updateQueryParams({
        orderBy: sortField,
        orderDirection,
        offset: 0,
      });
    },
    [updateQueryParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        updateQueryParams({
          searchTerm: value.trim() || undefined,
          offset: 0, // reset to first page
        });
      }, 300);
    },
    [updateQueryParams],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const handleFilterChange = useCallback(
    (filterKey: string, value: number) => {
      const newFilters = { ...localFilters, [filterKey]: value };
      setLocalFilters(newFilters);
      updateQueryParams({ ...newFilters, offset: 0 });
    },
    [localFilters, updateQueryParams],
  );

  const handlePositionFilterChange = useCallback(
    (value: string) => {
      setPositionFilter(value);
      updateQueryParams({
        position: value || undefined,
        offset: 0,
      });
    },
    [updateQueryParams],
  );

  const handlePageChange = useCallback(
    (direction: 'next' | 'prev') => {
      const pageSize = queryParams.limit || 25;
      const currentOffset = queryParams.offset || 0;

      if (direction === 'next') {
        updateQueryParams({ offset: currentOffset + pageSize });
      } else if (direction === 'prev' && currentOffset > 0) {
        updateQueryParams({ offset: Math.max(0, currentOffset - pageSize) });
      }
    },
    [queryParams.limit, queryParams.offset, updateQueryParams],
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      updateQueryParams({ limit: newPageSize, offset: 0 });
    },
    [updateQueryParams],
  );

  const handleGoToPage = useCallback(
    (page: number) => {
      updateQueryParams({ offset: (page - 1) * (queryParams.limit || 25) });
    },
    [queryParams.limit, updateQueryParams],
  );

  const handleRowClick = useCallback(
    (player: CareerPitchingFragment) => {
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  const handleRefresh = useCallback(() => {
    if (refetch) {
      void refetch();
    }
  }, [refetch]);

  // =============================================================================
  // Pagination Calculations
  // =============================================================================

  const pageSize = queryParams.limit || 25;
  const currentOffset = queryParams.offset || 0;
  const currentPageNumber = Math.floor(currentOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasNextPage = currentOffset + pageSize < totalCount;
  const hasPreviousPage = currentOffset > 0;

  const visibleColumns = useMemo(() => {
    if (statsFormat === 'standard') {
      return PITCHING_STATS_COLUMNS.filter((col) => col.priority === 'high');
    }
    return PITCHING_STATS_COLUMNS;
  }, [statsFormat]);

  // =============================================================================
  // Render Helpers
  // =============================================================================

  const renderControls = () => (
    <YStack
      gap="$3"
      padding="$4"
      style={{
        background: `rgba(22,34,58,0.7)`,
        border: `1px solid rgba(44,74,124,0.4)`,
        borderRadius: 14,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <XStack
        gap="$3"
        alignItems="center"
        flexWrap="wrap"
        justifyContent="space-between"
      >
        {showSearch && (
          <XStack
            flex={1}
            minWidth="200px"
            alignItems="center"
            gap="$2"
            style={{
              background: 'rgba(10,15,26,0.6)',
              border: '1px solid rgba(44,74,124,0.4)',
              borderRadius: 10,
              paddingLeft: 12,
              paddingRight: 8,
            }}
          >
            <SearchIcon />
            <Input
              flex={1}
              placeholder="Search pitchers..."
              value={searchTerm}
              onChangeText={handleSearchChange}
              backgroundColor="transparent"
              borderWidth={0}
              color={TEXT_HIGH_CONTRAST}
              placeholderTextColor={TEXT_MUTED}
            />
          </XStack>
        )}

        {showFilters && (
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text
              fontSize="$2"
              fontWeight="600"
              letterSpacing={0.8}
              textTransform="uppercase"
              style={{ color: BRAND_GOLD_LIGHT }}
            >
              Filters:
            </Text>
            {[
              { label: 'Min G', key: 'minGames', val: localFilters.minGames },
              { label: 'Min W', key: 'minWins', val: localFilters.minWins },
              {
                label: 'Min SO',
                key: 'minStrikeouts',
                val: localFilters.minStrikeouts,
              },
            ].map(({ label, key, val }) => (
              <XStack key={key} alignItems="center" gap="$1">
                <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
                  {label}:
                </Text>
                <Input
                  width={56}
                  size="$2"
                  value={String(val)}
                  onChangeText={(value: string) =>
                    handleFilterChange(key, parseInt(value) || 0)
                  }
                  keyboardType="numeric"
                  backgroundColor="rgba(10,15,26,0.6)" // dark input bg
                  borderWidth={1}
                  borderColor="rgba(44,74,124,0.4)"
                  borderRadius={8}
                  color={TEXT_HIGH_CONTRAST}
                  textAlign="center"
                />
              </XStack>
            ))}
            {(localFilters.minGames > 0 ||
              localFilters.minWins > 0 ||
              localFilters.minStrikeouts > 0 ||
              positionFilter.length > 0) && (
              <Button
                size="$2"
                onPress={() => {
                  const cleared = {
                    minGames: 0,
                    minWins: 0,
                    minStrikeouts: 0,
                  };
                  setLocalFilters(cleared);
                  setPositionFilter('');
                  updateQueryParams({
                    ...cleared,
                    position: undefined,
                    offset: 0,
                  });
                }}
                style={{
                  background: `rgba(197,165,90,0.12)`,
                  border: `1px solid rgba(196,165,90,0.4)`,
                  borderRadius: 8,
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                Clear Filters
              </Button>
            )}
            <XStack alignItems="center" gap="$1">
              <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
                Pos:
              </Text>
              <Select
                value={positionFilter || '__all__'}
                onValueChange={(value) =>
                  handlePositionFilterChange(value === '__all__' ? '' : value)
                }
              >
                <Select.Trigger
                  width={80}
                  size="$2"
                  backgroundColor="rgba(10,15,26,0.6)"
                  borderWidth={1}
                  borderColor="rgba(44,74,124,0.4)"
                  borderRadius={8}
                  aria-label="Position"
                >
                  <Select.Value placeholder="All" color={TEXT_HIGH_CONTRAST} />
                </Select.Trigger>
                <Select.Content zIndex={200000}>
                  <Select.Viewport>
                    <Select.Item index={0} value="__all__">
                      <Select.ItemText>All</Select.ItemText>
                    </Select.Item>
                    {[...PITCHING_POSITIONS]
                      .filter((pos) => pos !== 'P')
                      .map((pos, idx) => (
                        <Select.Item key={pos} index={idx + 1} value={pos}>
                          <Select.ItemText>{pos}</Select.ItemText>
                        </Select.Item>
                      ))}
                  </Select.Viewport>
                </Select.Content>
              </Select>
            </XStack>
          </XStack>
        )}
      </XStack>
    </YStack>
  );

  const renderDataGrid = () => (
    <YStack
      flex={1}
      style={{
        background: `rgba(16,22,38,0.75)`,
        border: `1px solid rgba(44,74,124,0.35)`,
        borderRadius: 14,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: `0 4px 24px rgba(0,0,0,0.3)`,
      }}
    >
      <XStack
        style={{
          background: BRAND_NAVY_DARK,
          borderBottom: `2px solid ${OUTLINE_SUBTLE}`,
        }}
        paddingVertical="$2"
        paddingHorizontal="$3"
      >
        {visibleColumns.map((column) => {
          const sortField = COLUMN_TO_SORT_FIELD_MAP[column.key] || column.key;
          const isActiveSortColumn = queryParams.orderBy === sortField;
          const isDescending = queryParams.orderDirection === 'desc';

          return (
            <XStack
              key={column.key}
              width={column.width || 'auto'}
              minWidth={column.minWidth}
              flexGrow={1}
              justifyContent={
                column.align === 'center'
                  ? 'center'
                  : column.align === 'right'
                    ? 'flex-end'
                    : 'flex-start'
              }
              alignItems="center"
              paddingHorizontal="$1"
              paddingVertical="$1"
              borderRadius="$2"
              style={{
                background: isActiveSortColumn
                  ? 'rgba(196,165,90,0.18)'
                  : 'transparent',
                transition: 'background 0.15s ease',
              }}
              hoverStyle={
                column.sortable
                  ? {
                      backgroundColor: isActiveSortColumn
                        ? ('rgba(196,165,90,0.25)' as never)
                        : ('rgba(255,255,255,0.07)' as never),
                    }
                  : undefined
              }
              pressStyle={column.sortable ? { scale: 0.97 } : undefined}
              cursor={column.sortable ? 'pointer' : 'default'}
              onPress={
                column.sortable
                  ? () => {
                      const currentDirection =
                        isActiveSortColumn && isDescending ? 'asc' : 'desc';
                      handleSort(column.key, currentDirection);
                    }
                  : undefined
              }
            >
              <XStack gap="$1" alignItems="center">
                <Text
                  numberOfLines={1}
                  userSelect="none"
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: isActiveSortColumn ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                    transition: 'color 0.15s ease',
                  }}
                >
                  {column.label}
                </Text>
                {column.sortable && isActiveSortColumn && (
                  <Text style={{ fontSize: 10, color: BRAND_GOLD }}>
                    {isDescending ? '▼' : '▲'}
                  </Text>
                )}
              </XStack>
            </XStack>
          );
        })}
      </XStack>

      <YStack flex={1} style={{ overflowX: 'auto' }}>
        {loading ? (
          <XStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            gap="$3"
          >
            <Spinner size="large" color={BRAND_NAVY_LIGHT as never} />
            <Text style={{ color: TEXT_MUTED }}>
              Loading pitching statistics...
            </Text>
          </XStack>
        ) : pitchingData.length === 0 ? (
          <YStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            gap="$3"
          >
            <Text
              fontSize="$5"
              fontWeight="600"
              style={{ color: TEXT_HIGH_CONTRAST }}
            >
              No pitchers found
            </Text>
            <Text
              fontSize="$3"
              textAlign="center"
              style={{ color: TEXT_MUTED }}
            >
              Try adjusting your filters to find more pitchers.
            </Text>
            <Button
              onPress={() => {
                setLocalFilters({ minGames: 0, minWins: 0, minStrikeouts: 0 });
                setPositionFilter('');
                updateQueryParams({
                  minGames: 0,
                  minWins: 0,
                  minStrikeouts: 0,
                  position: undefined,
                  offset: 0,
                });
              }}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
                border: `1px solid rgba(196,165,90,0.3)`,
                borderRadius: 10,
                color: BRAND_GOLD_LIGHT,
              }}
            >
              Clear Filters
            </Button>
          </YStack>
        ) : (
          pitchingData.map(
            (player: CareerPitchingFragment | null, index: number) => (
              <XStack
                key={player?.playerId || index}
                style={{
                  background: index % 2 === 0 ? BG_PAGE : 'rgba(17,27,47,0.8)',
                  borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
                  transition: 'background 0.12s ease',
                  cursor: 'pointer',
                }}
                hoverStyle={{
                  backgroundColor: `rgba(27,58,92,0.3)` as never,
                }}
                pressStyle={{ scale: 0.998 }}
                paddingVertical="$2"
                paddingHorizontal="$3"
                onPress={() => player && handleRowClick(player)}
                cursor="pointer"
              >
                {visibleColumns.map((column) => {
                  const isNameCol = column.key === 'playerName';
                  const cellValue =
                    column.key === 'playerName'
                      ? `${player?.player?.firstName ?? ''} ${player?.player?.lastName ?? ''}`.trim() ||
                        `Player ${player?.playerId ?? '-'}`
                      : column.key === 'formattedPositions'
                        ? formatPositionsPlayed(player?.positionsPlayed) ||
                          player?.primaryPosition ||
                          '-'
                        : column.key === 'fantasyPoints'
                          ? Math.round(
                              computePitchingFantasyPoints(player),
                            ).toString()
                          : column.key === 'fantasyPointsPerGame'
                            ? (() => {
                                const games = player?.games ?? 0;
                                const fpts =
                                  computePitchingFantasyPoints(player);
                                return games > 0
                                  ? (fpts / games).toFixed(1)
                                  : '0.0';
                              })()
                            : column.formatter
                              ? column.formatter(
                                  player?.[column.key as keyof typeof player],
                                )
                              : (() => {
                                  const rawVal =
                                    player?.[column.key as keyof typeof player];
                                  return typeof rawVal === 'object'
                                    ? '—'
                                    : String(rawVal ?? '—');
                                })();
                  return (
                    <XStack
                      key={column.key}
                      width={column.width || 'auto'}
                      minWidth={column.minWidth}
                      flexGrow={1}
                      justifyContent={
                        column.align === 'center'
                          ? 'center'
                          : column.align === 'right'
                            ? 'flex-end'
                            : 'flex-start'
                      }
                      alignItems="center"
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: isNameCol ? FONT_BODY : FONT_MONO,
                          fontWeight: isNameCol ? '600' : '400',
                          fontSize: isNameCol ? 14 : 13,
                          color: isNameCol ? TEXT_HIGH_CONTRAST : TEXT_MUTED,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {cellValue}
                      </Text>
                    </XStack>
                  );
                })}
              </XStack>
            ),
          )
        )}
      </YStack>
    </YStack>
  );

  const renderPagination = () => {
    const pageRange = getPageRange(currentPageNumber, totalPages);

    return (
      <YStack gap="$2">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          padding="$3"
          flexWrap="wrap"
          gap="$2"
          style={{
            background: `rgba(22,34,58,0.65)`,
            border: `1px solid rgba(44,74,124,0.35)`,
            borderRadius: 12,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <XStack gap="$2" alignItems="center">
            <Text
              fontSize="$3"
              fontWeight="600"
              style={{ color: TEXT_HIGH_CONTRAST }}
            >
              Page {currentPageNumber} of {totalPages}
            </Text>
            <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
              ({totalCount.toLocaleString()} total)
            </Text>
          </XStack>

          <XStack gap="$2" alignItems="center">
            <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
              Show:
            </Text>
            {[10, 25, 50, 100].map((size) => (
              <Button
                key={size}
                size="$2"
                onPress={() => handlePageSizeChange(size)}
                disabled={loading}
                style={{
                  background:
                    pageSize === size
                      ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                      : 'rgba(10,15,26,0.5)',
                  border:
                    pageSize === size
                      ? `1px solid rgba(196,165,90,0.4)`
                      : `1px solid rgba(44,74,124,0.35)`,
                  borderRadius: 8,
                  color: pageSize === size ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                  minWidth: 36,
                }}
              >
                {size}
              </Button>
            ))}
          </XStack>

          <XStack gap="$2">
            <Button
              size="$3"
              disabled={!hasPreviousPage || loading}
              onPress={() => handlePageChange('prev')}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
                border: `1px solid rgba(196,165,90,0.25)`,
                borderRadius: 10,
                color: BRAND_GOLD_LIGHT,
                opacity: !hasPreviousPage || loading ? 0.4 : 1,
              }}
            >
              ← Prev
            </Button>
            <Button
              size="$3"
              disabled={!hasNextPage || loading}
              onPress={() => handlePageChange('next')}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
                border: `1px solid rgba(196,165,90,0.25)`,
                borderRadius: 10,
                color: BRAND_GOLD_LIGHT,
                opacity: !hasNextPage || loading ? 0.4 : 1,
              }}
            >
              Next →
            </Button>
          </XStack>
        </XStack>

        {/* Page number quick-jump buttons */}
        {totalPages > 1 && (
          <XStack
            justifyContent="center"
            alignItems="center"
            padding="$2"
            flexWrap="wrap"
            gap="$1"
            style={{
              background: `rgba(22,34,58,0.5)`,
              border: `1px solid rgba(44,74,124,0.25)`,
              borderRadius: 10,
            }}
          >
            {pageRange.map((page, index) => {
              if (page === -1) {
                return (
                  <Text
                    key={`ellipsis-${index}`}
                    fontSize="$3"
                    paddingHorizontal="$2"
                    style={{ color: TEXT_MUTED }}
                  >
                    ...
                  </Text>
                );
              }

              const isCurrentPage = page === currentPageNumber;
              return (
                <Button
                  key={page}
                  size="$2"
                  onPress={() => handleGoToPage(page)}
                  disabled={loading || isCurrentPage}
                  minWidth={32}
                  style={{
                    background: isCurrentPage
                      ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                      : 'transparent',
                    border: isCurrentPage
                      ? `1px solid rgba(196,165,90,0.45)`
                      : `1px solid transparent`,
                    borderRadius: 8,
                    color: isCurrentPage ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                    fontWeight: isCurrentPage ? '700' : '400',
                  }}
                >
                  {page}
                </Button>
              );
            })}
          </XStack>
        )}
      </YStack>
    );
  };

  // =============================================================================
  // Main Render
  // =============================================================================

  return (
    <YStack
      flex={1}
      gap="$4"
      padding="$4"
      backgroundColor="$background"
      className={className}
      testID={testId}
    >
      {/* Section caption — eyebrow + count/sort subtitle */}
      <XStack justifyContent="space-between" alignItems="flex-end">
        <YStack gap="$1">
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
            }}
          >
            Pitching Leaders
          </Text>
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '800',
              fontSize: 22,
              letterSpacing: '-0.01em',
              color: TEXT_HIGH_CONTRAST,
            }}
          >
            {title}
          </Text>
          {!loading && !error && (
            <Text
              style={{
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: TEXT_MUTED,
              }}
            >
              {totalCount.toLocaleString()} pitchers · sorted by{' '}
              {queryParams.orderBy ?? 'wins'}
            </Text>
          )}
        </YStack>
      </XStack>

      {(showSearch || showSorting || showFilters) && renderControls()}

      {error && !loading && (
        <YStack
          justifyContent="center"
          alignItems="center"
          padding="$6"
          gap="$3"
          style={{
            background: 'rgba(196,30,58,0.08)',
            border: '1px solid rgba(196,30,58,0.3)',
            borderRadius: 14,
          }}
        >
          <AlertIcon />
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 18,
              color: '#E63950',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Error Loading Statistics
          </Text>
          <Text
            style={{ fontFamily: FONT_BODY, fontSize: 14, color: TEXT_MUTED }}
            textAlign="center"
          >
            {error?.message ?? 'Failed to load pitching statistics'}
          </Text>
          <Button
            onPress={handleRefresh}
            style={{
              background: BRAND_NAVY,
              border: `1px solid rgba(196,165,90,0.3)`,
              borderRadius: 10,
              color: BRAND_GOLD_LIGHT,
            }}
          >
            Try Again
          </Button>
        </YStack>
      )}

      {(!error || loading) && renderDataGrid()}

      {showPagination && !error && renderPagination()}
    </YStack>
  );
}

export default PitchingStatsDataGrid;

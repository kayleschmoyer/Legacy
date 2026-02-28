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

import React, { useCallback, useMemo, useState } from 'react';
import { Button, H2, H3, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type CareerPitchingFragment,
  type GetCareerPitchingStatsQueryVariables,
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

// Icons
const Search = ({ size, color }: { size?: number; color?: string }) => (
  <Text fontSize={size} color={color} accessibilityLabel="Search">
    <span role="img" aria-label="Search">
      🔍
    </span>
  </Text>
);
const RefreshCw = () => (
  <Text accessibilityLabel="Refresh">
    <span role="img" aria-label="Refresh">
      🔄
    </span>
  </Text>
);
const AlertCircle = ({ size, color }: { size?: number; color?: string }) => (
  <Text fontSize={size} color={color} accessibilityLabel="Error">
    <span role="img" aria-label="Error">
      ⚠️
    </span>
  </Text>
);

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
  maxHeight?: number | string;
  className?: string;
  testId?: string;
}

// =============================================================================
// Column Configuration
// =============================================================================

export const PITCHING_STATS_COLUMNS: readonly PitchingGridColumn[] = [
  {
    key: 'playerId',
    label: 'Player ID',
    sortable: true,
    width: '100px',
    align: 'left',
    priority: 'high',
    description: 'Player identifier',
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
    sortable: false,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Earned run average',
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
] as const;

const COLUMN_TO_SORT_FIELD_MAP: Record<string, string> = {
  games: 'games',
  wins: 'wins',
  losses: 'losses',
  gamesStarted: 'gamesStarted',
  completeGames: 'completeGames',
  shutouts: 'shutouts',
  saves: 'saves',
  strikeouts: 'strikeouts',
  baseOnBalls: 'baseOnBalls',
  hits: 'hits',
  earnedRuns: 'earnedRuns',
  homeRuns: 'homeRuns',
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
  maxHeight = '600px',
  className,
  testId = 'pitching-stats-data-grid',
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
  const [localFilters, setLocalFilters] = useState({
    minGames: initialParams.minGames ?? 10,
    minWins: initialParams.minWins ?? 0,
    minStrikeouts: initialParams.minStrikeouts ?? 0,
  });

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
  const totalCount = pitchingData.length; // Note: Basic implementation, needs count query

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

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleFilterChange = useCallback(
    (filterKey: string, value: number) => {
      const newFilters = { ...localFilters, [filterKey]: value };
      setLocalFilters(newFilters);
      updateQueryParams({ ...newFilters, offset: 0 });
    },
    [localFilters, updateQueryParams],
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

  const visibleColumns = useMemo(() => PITCHING_STATS_COLUMNS, []);

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
            <Search size={14} color={TEXT_MUTED} />
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
          </XStack>
        )}

        <Button
          size="$2"
          onPress={handleRefresh}
          disabled={loading}
          style={{
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
            border: `1px solid rgba(196,165,90,0.25)`,
            borderRadius: 8,
            color: BRAND_GOLD_LIGHT,
          }}
          icon={RefreshCw}
        >
          Refresh
        </Button>
      </XStack>

      {showSorting && (
        <XStack justifyContent="center" paddingTop="$1">
          <Text fontSize="$2" style={{ color: TEXT_MUTED }} textAlign="center">
            <span role="img" aria-label="Tip">
              💡
            </span>{' '}
            Click column headers to sort
          </Text>
        </XStack>
      )}
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
          background: `linear-gradient(135deg, ${BRAND_NAVY_DARK} 0%, ${BRAND_NAVY} 60%, ${BRAND_NAVY_LIGHT} 100%)`,
          borderBottom: `2px solid rgba(196,165,90,0.25)`,
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
                  fontSize="$3"
                  fontWeight={isActiveSortColumn ? '700' : '600'}
                  numberOfLines={1}
                  userSelect="none"
                  style={{
                    color: isActiveSortColumn
                      ? BRAND_GOLD_LIGHT
                      : TEXT_HIGH_CONTRAST,
                    transition: 'color 0.15s ease',
                  }}
                >
                  {column.label}
                </Text>
                {column.sortable && (
                  <Text
                    fontSize="$2"
                    style={{
                      color: isActiveSortColumn ? BRAND_GOLD : TEXT_MUTED,
                      opacity: isActiveSortColumn ? 1 : 0.6,
                    }}
                  >
                    {isActiveSortColumn ? (isDescending ? '↓' : '↑') : '↕'}
                  </Text>
                )}
              </XStack>
            </XStack>
          );
        })}
      </XStack>

      <YStack flex={1} maxHeight={maxHeight}>
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
                updateQueryParams({
                  minGames: 0,
                  minWins: 0,
                  minStrikeouts: 0,
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
                  background:
                    index % 2 === 0
                      ? 'rgba(10,15,26,0.4)'
                      : 'rgba(22,34,58,0.35)',
                  borderBottom: '1px solid rgba(44,74,124,0.2)',
                  transition: 'background 0.15s ease',
                  cursor: 'pointer',
                }}
                hoverStyle={{
                  backgroundColor: `rgba(44,74,124,0.35)` as never,
                }}
                pressStyle={{ scale: 0.995 }}
                paddingVertical="$2"
                paddingHorizontal="$3"
                onPress={() => player && handleRowClick(player)}
                cursor="pointer"
              >
                {visibleColumns.map((column) => (
                  <XStack
                    key={column.key}
                    width={column.width || 'auto'}
                    minWidth={column.minWidth}
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
                      fontSize="$3"
                      numberOfLines={1}
                      style={{ color: TEXT_HIGH_CONTRAST }}
                    >
                      {column.formatter
                        ? column.formatter(
                            player?.[column.key as keyof typeof player],
                          )
                        : String(
                            player?.[column.key as keyof typeof player] ?? '-',
                          )}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            ),
          )
        )}
      </YStack>
    </YStack>
  );

  const renderPagination = () => (
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
    </YStack>
  );

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
      {/* Grid Title */}
      <H2
        textAlign="center"
        style={{
          background: `linear-gradient(90deg, ${TEXT_HIGH_CONTRAST} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {title}
      </H2>

      {/* Total Count Badge */}
      {!loading && !error && (
        <XStack justifyContent="center">
          <YStack
            paddingHorizontal="$3"
            paddingVertical="$1"
            style={{
              background: `rgba(44,74,124,0.18)`,
              border: `1px solid rgba(44,74,124,0.35)`,
              borderRadius: 99,
            }}
          >
            <Text
              fontSize="$3"
              fontWeight="600"
              style={{ color: BRAND_GOLD_LIGHT }}
            >
              {totalCount.toLocaleString()} Pitchers
            </Text>
          </YStack>
        </XStack>
      )}

      {(showSearch || showSorting || showFilters) && renderControls()}

      {error && !loading && (
        <YStack
          justifyContent="center"
          alignItems="center"
          padding="$6"
          gap="$3"
          style={{
            background: 'rgba(196,30,58,0.1)',
            border: '1px solid rgba(196,30,58,0.35)',
            borderRadius: 14,
          }}
        >
          <AlertCircle size={32} color="$red10" />
          <H3 color="$red11">Error Loading Statistics</H3>
          <Text color="$red10" textAlign="center">
            {error?.message || 'Failed to load pitching statistics'}
          </Text>
          <Button
            onPress={handleRefresh}
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
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

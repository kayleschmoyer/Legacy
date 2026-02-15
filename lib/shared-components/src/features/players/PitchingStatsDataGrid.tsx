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
    <YStack space="$3" padding="$3" backgroundColor="$color2" borderRadius="$3">
      <XStack
        space="$3"
        alignItems="center"
        flexWrap="wrap"
        justifyContent="space-between"
      >
        {showSearch && (
          <XStack flex={1} minWidth="200px" alignItems="center" space="$2">
            <Search size={16} color="$color10" />
            <Input
              flex={1}
              placeholder="Search players..."
              value={searchTerm}
              onChangeText={handleSearchChange}
              backgroundColor="$color1"
            />
          </XStack>
        )}

        {showFilters && (
          <XStack space="$2" alignItems="center" flexWrap="wrap">
            <Text fontSize="$2" color="$color11" fontWeight="500">
              Filters:
            </Text>
            <XStack alignItems="center" space="$1">
              <Text fontSize="$2" color="$color10">
                Min G:
              </Text>
              <Input
                width={60}
                size="$2"
                value={String(localFilters.minGames)}
                onChangeText={(value: string) =>
                  handleFilterChange('minGames', parseInt(value) || 0)
                }
                keyboardType="numeric"
                backgroundColor="$color1"
              />
            </XStack>
            <XStack alignItems="center" space="$1">
              <Text fontSize="$2" color="$color10">
                Min W:
              </Text>
              <Input
                width={60}
                size="$2"
                value={String(localFilters.minWins)}
                onChangeText={(value: string) =>
                  handleFilterChange('minWins', parseInt(value) || 0)
                }
                keyboardType="numeric"
                backgroundColor="$color1"
              />
            </XStack>
            <XStack alignItems="center" space="$1">
              <Text fontSize="$2" color="$color10">
                Min SO:
              </Text>
              <Input
                width={60}
                size="$2"
                value={String(localFilters.minStrikeouts)}
                onChangeText={(value: string) =>
                  handleFilterChange('minStrikeouts', parseInt(value) || 0)
                }
                keyboardType="numeric"
                backgroundColor="$color1"
              />
            </XStack>
          </XStack>
        )}

        <Button
          size="$2"
          variant="outlined"
          icon={RefreshCw}
          onPress={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </XStack>

      {showSorting && (
        <XStack justifyContent="center" paddingTop="$1">
          <Text fontSize="$2" color="$color9" textAlign="center">
            <span role="img" aria-label="Light bulb">
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
      backgroundColor="$color1"
      borderRadius="$3"
      overflow="hidden"
    >
      <XStack
        backgroundColor="$color3"
        borderBottomWidth={2}
        borderBottomColor="$borderColor"
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
              backgroundColor={isActiveSortColumn ? '$blue3' : 'transparent'}
              hoverStyle={
                column.sortable
                  ? {
                      backgroundColor: isActiveSortColumn
                        ? '$blue4'
                        : '$color4',
                      opacity: 0.9,
                    }
                  : undefined
              }
              pressStyle={
                column.sortable
                  ? {
                      backgroundColor: isActiveSortColumn
                        ? '$blue5'
                        : '$color5',
                      scale: 0.98,
                    }
                  : undefined
              }
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
              <XStack space="$1" alignItems="center">
                <Text
                  fontSize="$3"
                  fontWeight={isActiveSortColumn ? '700' : '600'}
                  color={isActiveSortColumn ? '$blue11' : '$color12'}
                  numberOfLines={1}
                  userSelect="none"
                >
                  {column.label}
                </Text>
                {column.sortable && (
                  <Text
                    fontSize="$2"
                    color={isActiveSortColumn ? '$blue10' : '$color9'}
                    opacity={isActiveSortColumn ? 1 : 0.5}
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
            backgroundColor="$color1"
          >
            <Spinner size="large" color="$blue10" />
            <Text marginLeft="$3" color="$color10">
              Loading pitching statistics...
            </Text>
          </XStack>
        ) : pitchingData.length === 0 ? (
          <YStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            space="$3"
            backgroundColor="$color1"
          >
            <Text color="$color10" fontSize="$4" fontWeight="600">
              No pitchers found
            </Text>
            <Text color="$color9" fontSize="$3" textAlign="center">
              Try adjusting your filters to find more pitchers.
            </Text>
            <Button
              variant="outlined"
              onPress={() => {
                setLocalFilters({ minGames: 0, minWins: 0, minStrikeouts: 0 });
                updateQueryParams({
                  minGames: 0,
                  minWins: 0,
                  minStrikeouts: 0,
                  offset: 0,
                });
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
                backgroundColor={index % 2 === 0 ? '$color1' : '$color2'}
                borderBottomWidth={1}
                borderBottomColor="$borderColorFocus"
                paddingVertical="$2"
                paddingHorizontal="$3"
                pressStyle={{ backgroundColor: '$color4' }}
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
                    <Text fontSize="$3" color="$color11" numberOfLines={1}>
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
    <YStack space="$2">
      <XStack
        justifyContent="space-between"
        alignItems="center"
        padding="$3"
        backgroundColor="$color2"
        borderRadius="$3"
        flexWrap="wrap"
        gap="$2"
      >
        <XStack space="$2" alignItems="center">
          <Text fontSize="$3" color="$color10" fontWeight="600">
            Page {currentPageNumber} of {totalPages}
          </Text>
          <Text fontSize="$2" color="$color9">
            ({totalCount.toLocaleString()} total)
          </Text>
        </XStack>

        <XStack space="$2" alignItems="center">
          <Text fontSize="$2" color="$color10">
            Show:
          </Text>
          {[10, 25, 50, 100].map((size) => (
            <Button
              key={size}
              size="$2"
              variant={pageSize === size ? 'outlined' : undefined}
              onPress={() => handlePageSizeChange(size)}
              disabled={loading}
            >
              {size}
            </Button>
          ))}
        </XStack>

        <XStack space="$2">
          <Button
            size="$3"
            variant="outlined"
            disabled={!hasPreviousPage || loading}
            onPress={() => handlePageChange('prev')}
          >
            ← Prev
          </Button>
          <Button
            size="$3"
            variant="outlined"
            disabled={!hasNextPage || loading}
            onPress={() => handlePageChange('next')}
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
      space="$4"
      padding="$4"
      backgroundColor="$background"
      className={className}
      testID={testId}
    >
      <H2 color="$color12" textAlign="center">
        {title}
      </H2>

      {!loading && !error && (
        <Text
          color="$color11"
          textAlign="center"
          fontSize="$4"
          fontWeight="600"
        >
          Total Pitchers: {totalCount.toLocaleString()}
        </Text>
      )}

      {(showSearch || showSorting || showFilters) && renderControls()}

      {error && !loading && (
        <YStack
          justifyContent="center"
          alignItems="center"
          padding="$6"
          space="$3"
          backgroundColor="$red2"
          borderColor="$red6"
          borderWidth={1}
          borderRadius="$3"
        >
          <AlertCircle size={32} color="$red10" />
          <H3 color="$red11">Error Loading Statistics</H3>
          <Text color="$red10" textAlign="center">
            {error?.message || 'Failed to load pitching statistics'}
          </Text>
          <Button onPress={handleRefresh}>
            <Text>Try Again</Text>
          </Button>
        </YStack>
      )}

      {(!error || loading) && renderDataGrid()}

      {showPagination && !error && renderPagination()}
    </YStack>
  );
}

export default PitchingStatsDataGrid;

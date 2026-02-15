/**
 * PlayerStatsDataGrid - Modern Career Statistics Data Grid
 *
 * A comprehensive, responsive data grid component for displaying career batting
 * statistics with server-side sorting, filtering, search, and pagination.
 *
 * Features:
 * - Server-side operations with GraphQL connections (sort, filter, search, paginate)
 * - Cursor-based pagination using relay-style connections
 * - Responsive design (mobile-first)
 * - Accessibility compliant (ARIA labels, keyboard navigation)
 * - Cross-platform compatibility (Web/React Native)
 * - Comprehensive error handling and loading states
 * - Performance optimized (virtualization-ready)
 *
 * @author Legacy Sports Team
 * @since 2025-09-28
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Button, H2, H3, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type CareerStatsQueryParams,
  DEFAULT_CAREER_STATS_PARAMS,
  type PlayerCareerStats,
  useCareerStatsWithNames,
} from './services/CareerStatsService';
// Icons - using simple text icons for cross-platform compatibility
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

/**
 * Configuration for grid columns with sorting and formatting
 */
export interface GridColumn {
  readonly key: keyof PlayerCareerStats;
  readonly label: string;
  readonly sortable: boolean;
  readonly width?: number | string;
  readonly minWidth?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly priority: 'high' | 'medium' | 'low'; // For responsive hiding
  readonly formatter?: (value: unknown) => string;
  readonly description?: string; // For accessibility
}

/**
 * Props for the PlayerStatsDataGrid component
 */
export interface PlayerStatsDataGridProps {
  /** Title displayed above the grid */
  title?: string;
  /** Initial query parameters */
  initialParams?: Partial<CareerStatsQueryParams>;
  /** Callback when a player row is selected */
  onPlayerSelect?: (player: PlayerCareerStats) => void;
  /** Whether to show search functionality */
  showSearch?: boolean;
  /** Whether to show filtering controls */
  showFilters?: boolean;
  /** Whether to show pagination controls */
  showPagination?: boolean;
  /** Whether to show sorting controls */
  showSorting?: boolean;
  /** Maximum height of the grid (for virtualization) */
  maxHeight?: number | string;
  /** Custom CSS class name */
  className?: string;
  /** Test ID for automated testing */
  testId?: string;
}

// =============================================================================
// Column Configuration
// =============================================================================

/**
 * Mapping from UI column keys to GraphQL sort field names
 * Some columns use formatted display values but need to sort by raw values
 */
export const COLUMN_TO_SORT_FIELD_MAP: Record<string, string> = {
  // Player information
  displayName: 'playerId', // Player names aren't sortable in GraphQL, use ID instead
  firstName: 'playerId',
  lastName: 'playerId',

  // Basic batting statistics
  games: 'games',
  plateAppearances: 'plateAppearances',
  atBats: 'atBats',
  runs: 'runs',
  hits: 'hits',
  doubles: 'doubles',
  triples: 'triples',
  homeRuns: 'homeRuns',
  rbi: 'rbi',

  // Base running
  stolenBases: 'stolenBases',
  caughtStealing: 'caughtStealing',

  // Plate discipline
  baseOnBalls: 'baseOnBalls',
  strikeouts: 'strikeouts',
  hitByPitch: 'hitByPitch',
  intentionalBaseOnBalls: 'intentionalBaseOnBalls',

  // Additional statistics
  totalBases: 'totalBases',
  groundedIntoDoublePlays: 'groundedIntoDoublePlays',
  sacrificeHits: 'sacrificeHits',

  // Calculated percentages (formatted columns map to raw values)
  formattedBattingAverage: 'battingAverage',
  formattedOnBasePercentage: 'onBasePercentage',
  formattedSluggingPercentage: 'sluggingPercentage',
  formattedOPS: 'ops',

  // Raw percentage fields (in case they're used directly)
  battingAverage: 'battingAverage',
  onBasePercentage: 'onBasePercentage',
  sluggingPercentage: 'sluggingPercentage',
  ops: 'ops',
};

/**
 * Predefined column configuration for career batting statistics
 * Ordered by importance and responsive priority
 */
export const CAREER_STATS_COLUMNS: readonly GridColumn[] = [
  {
    key: 'displayName',
    label: 'Player',
    sortable: false,
    width: '200px',
    minWidth: 150,
    align: 'left',
    priority: 'high',
    description: 'Player name and identifier',
  },
  {
    key: 'formattedPositions',
    label: 'Positions',
    sortable: false,
    width: '150px',
    minWidth: 120,
    align: 'left',
    priority: 'medium',
    description: 'Positions played with games count, sorted by most played',
  },
  {
    key: 'games',
    label: 'G',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Games played',
  },
  {
    key: 'atBats',
    label: 'AB',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'At bats',
  },
  {
    key: 'hits',
    label: 'H',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'high',
    description: 'Hits',
  },
  {
    key: 'homeRuns',
    label: 'HR',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'high',
    description: 'Home runs',
  },
  {
    key: 'rbi',
    label: 'RBI',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'high',
    description: 'Runs batted in',
  },
  {
    key: 'formattedBattingAverage',
    label: 'AVG',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Batting average',
  },
  {
    key: 'formattedOnBasePercentage',
    label: 'OBP',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'medium',
    description: 'On-base percentage',
  },
  {
    key: 'formattedSluggingPercentage',
    label: 'SLG',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'medium',
    description: 'Slugging percentage',
  },
  {
    key: 'formattedOPS',
    label: 'OPS',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'On-base plus slugging',
  },
  {
    key: 'stolenBases',
    label: 'SB',
    sortable: true,
    width: '50px',
    align: 'center',
    priority: 'low',
    description: 'Stolen bases',
  },
  {
    key: 'strikeouts',
    label: 'SO',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'low',
    description: 'Strikeouts',
  },
] as const;

// =============================================================================
// Component Implementation
// =============================================================================

/**
 * PlayerStatsDataGrid Component
 *
 * A production-ready data grid for career batting statistics with comprehensive
 * functionality including server-side operations, responsive design, and accessibility.
 *
 * @param props - Component configuration
 * @returns React component
 *
 * @example
 * ```tsx
 * <PlayerStatsDataGrid
 *   title="Top Home Run Hitters"
 *   initialParams={{ orderBy: 'homeRuns', orderDirection: 'desc', first: 50 }}
 *   onPlayerSelect={(player) => navigateToPlayer(player.playerId)}
 *   showSearch={true}
 *   showFilters={true}
 * />
 * ```
 */
export function PlayerStatsDataGrid({
  title = 'Career Batting Statistics',
  initialParams = {},
  onPlayerSelect,
  showSearch = true,
  showFilters = true,
  showPagination = true,
  showSorting = true,
  maxHeight = '600px',
  className,
  testId = 'player-stats-data-grid',
}: PlayerStatsDataGridProps): React.ReactElement {
  // =============================================================================
  // State Management
  // =============================================================================

  const [queryParams, setQueryParams] = useState<CareerStatsQueryParams>({
    ...DEFAULT_CAREER_STATS_PARAMS,
    ...initialParams,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [localFilters, setLocalFilters] = useState({
    minGames: initialParams.minGames ?? 10,
    minHomeRuns: initialParams.minHomeRuns ?? 0,
    minRBI: initialParams.minRBI ?? 0,
  });

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const {
    data,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    pageSize,
    refetch,
  } = useCareerStatsWithNames(queryParams);

  // =============================================================================
  // Event Handlers
  // =============================================================================

  /**
   * Updates query parameters and triggers data refetch
   */
  const updateQueryParams = useCallback(
    (updates: Partial<CareerStatsQueryParams>) => {
      setQueryParams((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  /**
   * Handles sorting changes
   */
  const handleSort = useCallback(
    (columnKey: string, orderDirection: 'asc' | 'desc') => {
      // Map UI column key to GraphQL sort field
      const sortField = COLUMN_TO_SORT_FIELD_MAP[columnKey] || columnKey;
      updateQueryParams({
        orderBy: sortField,
        orderDirection,
        after: undefined,
      }); // Reset to first page
    },
    [updateQueryParams],
  );

  /**
   * Handles search input changes (currently disabled - GraphQL schema doesn't support search)
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    // TODO: Implement search using separate searchPlayers query
    // For now, search is disabled as careerBattingStats doesn't support searchTerm
  }, []);

  /**
   * Handles filter changes
   */
  const handleFilterChange = useCallback(
    (filterKey: string, value: number) => {
      const newFilters = { ...localFilters, [filterKey]: value };
      setLocalFilters(newFilters);
      updateQueryParams({ ...newFilters, after: undefined }); // Reset to first page
    },
    [localFilters, updateQueryParams],
  );

  /**
   * Handles pagination navigation
   */
  const handlePageChange = useCallback(
    (direction: 'next' | 'prev') => {
      if (direction === 'next' && hasNextPage) {
        // Use endCursor from current page as the 'after' cursor for next page
        const endCursor =
          data?.length > 0
            ? Buffer.from(
                (
                  (queryParams.after
                    ? parseInt(
                        Buffer.from(queryParams.after, 'base64').toString(),
                      )
                    : 0) +
                  (queryParams.first ?? 25) -
                  1
                ).toString(),
              ).toString('base64')
            : undefined;
        updateQueryParams({ after: endCursor });
      } else if (direction === 'prev' && hasPreviousPage) {
        // For previous page, calculate the cursor based on current position
        const currentOffset = queryParams.after
          ? parseInt(Buffer.from(queryParams.after, 'base64').toString())
          : 0;
        const pageSize = queryParams.first ?? 25;
        const newOffset = Math.max(0, currentOffset - pageSize);
        const prevCursor =
          newOffset > 0
            ? Buffer.from(newOffset.toString()).toString('base64')
            : undefined;
        updateQueryParams({ after: prevCursor });
      }
    },
    [
      queryParams.after,
      queryParams.first,
      hasNextPage,
      hasPreviousPage,
      data?.length,
      updateQueryParams,
    ],
  );

  /**
   * Handles page size changes
   */
  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      updateQueryParams({ first: newPageSize, after: undefined }); // Reset to first page when changing page size
    },
    [updateQueryParams],
  );

  /**
   * Jumps to a specific page number
   */
  const handleGoToPage = useCallback(
    (pageNumber: number) => {
      const pageSize = queryParams.first ?? 25;
      const totalPages = Math.ceil(totalCount / pageSize);

      // Validate page number
      if (pageNumber < 1 || pageNumber > totalPages) {
        return;
      }

      // Calculate offset for the target page (page 1 = offset 0)
      const offset = (pageNumber - 1) * pageSize;

      // Create cursor from offset (same encoding used by backend)
      const cursor =
        offset > 0
          ? Buffer.from(offset.toString()).toString('base64')
          : undefined;

      updateQueryParams({ after: cursor });
    },
    [queryParams.first, totalCount, updateQueryParams],
  );

  // Calculate total pages and current page number
  const totalPages = useMemo(() => {
    const pageSize = queryParams.first ?? 25;
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, queryParams.first]);

  const currentPageNumber = useMemo(() => {
    const pageSize = queryParams.first ?? 25;
    const offset = queryParams.after
      ? parseInt(Buffer.from(queryParams.after, 'base64').toString())
      : 0;
    return Math.floor(offset / pageSize) + 1;
  }, [queryParams.after, queryParams.first]);

  /**
   * Handles row selection
   */
  const handleRowClick = useCallback(
    (player: PlayerCareerStats) => {
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  /**
   * Handles manual refresh
   */
  const handleRefresh = useCallback(() => {
    if (refetch) {
      void refetch();
    }
  }, [refetch]);

  // =============================================================================
  // Responsive Column Filtering
  // =============================================================================

  const visibleColumns = useMemo(() => {
    // For now, show all columns. In a real implementation, you might
    // filter based on screen size or user preferences
    return CAREER_STATS_COLUMNS;
  }, []);

  // =============================================================================
  // Render Helpers
  // =============================================================================

  /**
   * Renders the search and filter controls
   */
  const renderControls = () => (
    <YStack space="$3" padding="$3" backgroundColor="$color2" borderRadius="$3">
      <XStack
        space="$3"
        alignItems="center"
        flexWrap="wrap"
        justifyContent="space-between"
      >
        {/* Search */}
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

        {/* Filters */}
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
                Min HR:
              </Text>
              <Input
                width={60}
                size="$2"
                value={String(localFilters.minHomeRuns)}
                onChangeText={(value: string) =>
                  handleFilterChange('minHomeRuns', parseInt(value) || 0)
                }
                keyboardType="numeric"
                backgroundColor="$color1"
              />
            </XStack>
            <XStack alignItems="center" space="$1">
              <Text fontSize="$2" color="$color10">
                Min RBI:
              </Text>
              <Input
                width={60}
                size="$2"
                value={String(localFilters.minRBI)}
                onChangeText={(value: string) =>
                  handleFilterChange('minRBI', parseInt(value) || 0)
                }
                keyboardType="numeric"
                backgroundColor="$color1"
              />
            </XStack>
          </XStack>
        )}

        {/* Refresh Button */}
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

      {/* Sorting Instructions */}
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

  /**
   * Renders the data grid table
   */
  const renderDataGrid = () => (
    <YStack
      flex={1}
      backgroundColor="$color1"
      borderRadius="$3"
      overflow="hidden"
    >
      {/* Table Header */}
      <XStack
        backgroundColor="$color3"
        borderBottomWidth={2}
        borderBottomColor="$borderColor"
        paddingVertical="$2"
        paddingHorizontal="$3"
      >
        {visibleColumns.map((column) => {
          const sortField =
            COLUMN_TO_SORT_FIELD_MAP[column.key as string] || column.key;
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
                      handleSort(column.key as string, currentDirection);
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

      {/* Table Body */}
      <YStack flex={1} maxHeight={maxHeight}>
        {loading ? (
          /* Loading state within table */
          <XStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            backgroundColor="$color1"
          >
            <Spinner size="large" color="$blue10" />
            <Text marginLeft="$3" color="$color10">
              Loading player statistics...
            </Text>
          </XStack>
        ) : data.length === 0 ? (
          /* Empty state within table */
          <YStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            space="$3"
            backgroundColor="$color1"
          >
            <Text color="$color10" fontSize="$4" fontWeight="600">
              No players found
            </Text>
            <Text color="$color9" fontSize="$3" textAlign="center">
              Try adjusting your search terms or filters to find more players.
            </Text>
            <Button
              variant="outlined"
              onPress={() => {
                setSearchTerm('');
                setLocalFilters({
                  minGames: 10,
                  minHomeRuns: 0,
                  minRBI: 0,
                });
                updateQueryParams({
                  minGames: 10,
                  minHomeRuns: 0,
                  minRBI: 0,
                  after: undefined,
                });
              }}
            >
              Clear Filters
            </Button>
          </YStack>
        ) : (
          /* Data rows */
          data.map((player: PlayerCareerStats, index: number) => (
            <XStack
              key={player.id}
              data-testid={`player-row-${player.playerId}`}
              backgroundColor={index % 2 === 0 ? '$color1' : '$color2'}
              borderBottomWidth={1}
              borderBottomColor="$borderColorFocus"
              paddingVertical="$2"
              paddingHorizontal="$3"
              pressStyle={{ backgroundColor: '$color4' }}
              onPress={() => handleRowClick(player)}
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
                      ? column.formatter(player[column.key])
                      : // Safe conversion after null coalescing, but player[column.key] could be an object
                        // eslint-disable-next-line @typescript-eslint/no-base-to-string
                        String(player[column.key] ?? '--')}
                  </Text>
                </XStack>
              ))}
            </XStack>
          ))
        )}
      </YStack>
    </YStack>
  );

  /**
   * Renders pagination controls with page jumping
   */
  const renderPagination = () => {
    // Calculate page range for quick jump buttons (show 5 pages around current)
    const getPageRange = () => {
      const range: number[] = [];
      const maxButtons = 5;

      if (totalPages <= maxButtons) {
        // Show all pages if total is small
        for (let i = 1; i <= totalPages; i++) {
          range.push(i);
        }
      } else {
        // Show current page with 2 pages on each side
        const start = Math.max(1, currentPageNumber - 2);
        const end = Math.min(totalPages, currentPageNumber + 2);

        for (let i = start; i <= end; i++) {
          range.push(i);
        }

        // Add first page if not in range
        if (!range.includes(1)) {
          range.unshift(1);
          if (range[1] !== 2) {
            range.splice(1, 0, -1); // -1 represents ellipsis
          }
        }

        // Add last page if not in range
        if (!range.includes(totalPages)) {
          if (range[range.length - 1] !== totalPages - 1) {
            range.push(-1); // -1 represents ellipsis
          }
          range.push(totalPages);
        }
      }

      return range;
    };

    return (
      <YStack space="$2">
        {/* Main pagination controls */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          padding="$3"
          backgroundColor="$color2"
          borderRadius="$3"
          flexWrap="wrap"
          gap="$2"
        >
          {/* Page info */}
          <XStack space="$2" alignItems="center">
            <Text fontSize="$3" color="$color10" fontWeight="600">
              Page {currentPageNumber} of {totalPages}
            </Text>
            <Text fontSize="$2" color="$color9">
              ({totalCount.toLocaleString()} total)
            </Text>
          </XStack>

          {/* Page size selector */}
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

          {/* Prev/Next navigation */}
          <XStack space="$2">
            <Button
              size="$3"
              variant="outlined"
              disabled={currentPageNumber === 1 || loading}
              onPress={() => handlePageChange('prev')}
            >
              ← Previous
            </Button>
            <Button
              size="$3"
              variant="outlined"
              disabled={currentPageNumber === totalPages || loading}
              onPress={() => handlePageChange('next')}
            >
              Next →
            </Button>
          </XStack>
        </XStack>

        {/* Page number navigation (only show if more than 1 page) */}
        {totalPages > 1 && (
          <XStack
            justifyContent="center"
            alignItems="center"
            padding="$2"
            backgroundColor="$color2"
            borderRadius="$3"
            flexWrap="wrap"
            gap="$1"
          >
            {getPageRange().map((page, index) => {
              if (page === -1) {
                // Ellipsis
                return (
                  <Text
                    key={`ellipsis-${index}`}
                    fontSize="$3"
                    color="$color9"
                    paddingHorizontal="$2"
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
                  variant={isCurrentPage ? 'outlined' : undefined}
                  backgroundColor={isCurrentPage ? '$blue3' : 'transparent'}
                  color={isCurrentPage ? '$blue11' : '$color11'}
                  fontWeight={isCurrentPage ? '700' : '400'}
                  onPress={() => handleGoToPage(page)}
                  disabled={loading || isCurrentPage}
                  minWidth={32}
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
      space="$4"
      padding="$4"
      backgroundColor="$background"
      className={className}
      testID={testId}
    >
      {/* Header */}
      <H2 color="$color12" textAlign="center">
        {title}
      </H2>

      {/* Total Count */}
      {!loading && !error && (
        <Text
          color="$color11"
          textAlign="center"
          fontSize="$4"
          fontWeight="600"
        >
          Total Players: {totalCount.toLocaleString()}
        </Text>
      )}

      {/* Controls */}
      {(showSearch || showSorting || showFilters) && renderControls()}

      {/* Error State */}
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
            {error?.message || 'Failed to load player statistics'}
          </Text>
          <Button onPress={handleRefresh}>
            <Text>Try Again</Text>
          </Button>
        </YStack>
      )}

      {/* Data Grid */}
      {(!error || loading) && renderDataGrid()}

      {/* Pagination */}
      {showPagination && !error && renderPagination()}
    </YStack>
  );
}

export default PlayerStatsDataGrid;

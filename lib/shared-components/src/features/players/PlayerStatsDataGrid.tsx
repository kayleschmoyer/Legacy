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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { Button, Input, Select, Spinner, Text, XStack, YStack } from 'tamagui';
import { BATTING_POSITIONS } from '@legacy-sports/utils';
import {
  type CareerStatsQueryParams,
  DEFAULT_CAREER_STATS_PARAMS,
  type PlayerCareerStats,
  useCareerStatsWithNames,
} from './services/CareerStatsService';
import { getPageRange } from './paginationUtils';

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
  /** Custom CSS class name */
  className?: string;
  /** Test ID for automated testing */
  testId?: string;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
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
  displayName: 'lastName',
  firstName: 'lastName',
  lastName: 'lastName',

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
  offensiveWAR: 'offensiveWAR',

  // Raw percentage fields (in case they're used directly)
  battingAverage: 'battingAverage',
  onBasePercentage: 'onBasePercentage',
  sluggingPercentage: 'sluggingPercentage',
  ops: 'ops',

  // Fantasy points (computed client-side but sorted by DB scoring fields)
  fantasyPoints: 'totalScore',
  fantasyPointsPerGame: 'avgPointsPerGame',
};

/**
 * Predefined column configuration for career batting statistics
 * Ordered by importance and responsive priority
 */
export const CAREER_STATS_COLUMNS: readonly GridColumn[] = [
  {
    key: 'displayName',
    label: 'Player',
    sortable: true,
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
    key: 'fantasyPoints',
    label: 'FPTS',
    sortable: true,
    width: '80px',
    align: 'center',
    priority: 'high',
    description: 'Career fantasy points using default scoring settings',
    formatter: (v: unknown) =>
      v != null ? Math.round(v as number).toLocaleString() : '—',
  },
  {
    key: 'fantasyPointsPerGame',
    label: 'FPTS/G',
    sortable: true,
    width: '80px',
    align: 'center',
    priority: 'high',
    description:
      'Average fantasy points per game using default scoring settings',
    formatter: (v: unknown) => (v != null ? (v as number).toFixed(1) : '—'),
  },
  {
    key: 'offensiveWAR',
    label: 'oWAR',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description:
      'Offensive WAR from Baseball Reference. Shown as — for players with fewer than 10 career plate appearances.',
    formatter: (v: unknown) => (v != null ? (v as number).toFixed(1) : '—'),
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
  className,
  testId = 'player-stats-data-grid',
  statsFormat = 'expanded',
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
    minGames: initialParams.minGames ?? 0,
    minHomeRuns: initialParams.minHomeRuns ?? 0,
    minRBI: initialParams.minRBI ?? 0,
  });
  const [positionFilter, setPositionFilter] = useState(
    (initialParams.position as string) ?? '',
  );

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

  // Debounce ref for search
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Handles search input changes — debounces and propagates to server-side query
   */
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        updateQueryParams({
          searchTerm: value.trim() || undefined,
          after: undefined, // reset to first page
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
   * Handles position filter changes
   */
  const handlePositionFilterChange = useCallback(
    (value: string) => {
      setPositionFilter(value);
      updateQueryParams({
        position: value || undefined,
        after: undefined,
      });
    },
    [updateQueryParams],
  );

  /**
   * Handles pagination navigation
   */
  const handlePageChange = useCallback(
    (direction: 'next' | 'prev') => {
      // Use btoa/atob (browser-native) instead of Buffer (Node.js-only) so
      // cursor encoding works in the browser environment.
      const currentOffset = queryParams.after
        ? parseInt(atob(queryParams.after))
        : 0;
      const pageSz = queryParams.first ?? 25;

      if (direction === 'next' && hasNextPage) {
        // The backend treats the `after` cursor as the starting offset of the
        // next page, so advance by a full page size.
        const nextOffset = currentOffset + pageSz;
        updateQueryParams({
          after: btoa(String(nextOffset)),
        });
      } else if (direction === 'prev' && hasPreviousPage) {
        // Go back one full page; if we reach offset 0 omit the cursor so the
        // query defaults to the first page (matching initial load behaviour).
        const newOffset = Math.max(0, currentOffset - pageSz);
        const prevCursor =
          newOffset > 0 ? btoa(newOffset.toString()) : undefined;
        updateQueryParams({ after: prevCursor });
      }
    },
    [
      queryParams.after,
      queryParams.first,
      hasNextPage,
      hasPreviousPage,
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
      const cursor = offset > 0 ? btoa(offset.toString()) : undefined;

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
    const offset = queryParams.after ? parseInt(atob(queryParams.after)) : 0;
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
    if (statsFormat === 'standard') {
      return CAREER_STATS_COLUMNS.filter((col) => col.priority === 'high');
    }
    return CAREER_STATS_COLUMNS;
  }, [statsFormat]);

  // =============================================================================
  // Render Helpers
  // =============================================================================

  /**
   * Renders the search and filter controls
   */
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
        {/* Search */}
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
              placeholder="Search players..."
              value={searchTerm}
              onChangeText={handleSearchChange}
              backgroundColor="transparent"
              borderWidth={0}
              color={TEXT_HIGH_CONTRAST}
              placeholderTextColor={TEXT_MUTED}
            />
          </XStack>
        )}

        {/* Filters */}
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
              {
                label: 'Min HR',
                key: 'minHomeRuns',
                val: localFilters.minHomeRuns,
              },
              { label: 'Min RBI', key: 'minRBI', val: localFilters.minRBI },
            ].map(({ label, key, val }) => (
              <XStack key={key} alignItems="center" gap="$1">
                <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
                  {label}:
                </Text>
                <Input
                  width={56}
                  size="$2"
                  value={String(val)}
                  aria-label={label}
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
              localFilters.minHomeRuns > 0 ||
              localFilters.minRBI > 0 ||
              searchTerm.length > 0 ||
              positionFilter.length > 0) && (
              <Button
                size="$2"
                onPress={() => {
                  if (searchDebounceRef.current) {
                    clearTimeout(searchDebounceRef.current);
                  }
                  const cleared = {
                    minGames: DEFAULT_CAREER_STATS_PARAMS.minGames ?? 10,
                    minHomeRuns: 0,
                    minRBI: 0,
                  };
                  setSearchTerm('');
                  setPositionFilter('');
                  setLocalFilters(cleared);
                  updateQueryParams({
                    ...cleared,
                    searchTerm: undefined,
                    position: undefined,
                    after: undefined,
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
                    {[...BATTING_POSITIONS].map((pos, idx) => (
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

  /**
   * Renders the data grid table
   */
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
      {/* Table Header */}
      <XStack
        style={{
          background: BRAND_NAVY_DARK,
          borderBottom: `2px solid ${OUTLINE_SUBTLE}`,
        }}
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
                      handleSort(column.key as string, currentDirection);
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
                  <Text
                    style={{
                      fontSize: 10,
                      color: BRAND_GOLD,
                    }}
                  >
                    {isDescending ? '▼' : '▲'}
                  </Text>
                )}
              </XStack>
            </XStack>
          );
        })}
      </XStack>

      {/* Table Body */}
      <YStack flex={1} style={{ overflowX: 'auto' }}>
        {loading ? (
          <XStack
            justifyContent="center"
            alignItems="center"
            padding="$6"
            gap="$3"
            style={{ background: 'transparent' }}
          >
            <Spinner size="large" color={BRAND_NAVY_LIGHT as never} />
            <Text style={{ color: TEXT_MUTED }}>
              Loading player statistics...
            </Text>
          </XStack>
        ) : data.length === 0 ? (
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
              No players found
            </Text>
            <Text
              fontSize="$3"
              textAlign="center"
              style={{ color: TEXT_MUTED }}
            >
              Try adjusting your search terms or filters to find more players.
            </Text>
            <Button
              onPress={() => {
                if (searchDebounceRef.current) {
                  clearTimeout(searchDebounceRef.current);
                }
                const cleared = {
                  minGames: DEFAULT_CAREER_STATS_PARAMS.minGames ?? 10,
                  minHomeRuns: 0,
                  minRBI: 0,
                };
                setSearchTerm('');
                setPositionFilter('');
                setLocalFilters(cleared);
                updateQueryParams({
                  ...cleared,
                  searchTerm: undefined,
                  position: undefined,
                  after: undefined,
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
          data.map((player: PlayerCareerStats, index: number) => (
            <XStack
              key={player.id}
              data-testid={`player-row-${player.playerId}`}
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
              onPress={() => handleRowClick(player)}
              cursor="pointer"
            >
              {visibleColumns.map((column) => {
                const isNameCol = column.key === 'displayName';
                const raw = player[column.key];
                const cellValue = column.formatter
                  ? column.formatter(raw)
                  : typeof raw === 'string' ||
                      typeof raw === 'number' ||
                      typeof raw === 'boolean'
                    ? String(raw)
                    : '—';
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
          ))
        )}
      </YStack>
    </YStack>
  );

  /**
   * Renders pagination controls with page jumping
   */
  const renderPagination = () => {
    const pageRange = getPageRange(currentPageNumber, totalPages);

    return (
      <YStack gap="$2">
        {/* Main pagination controls */}
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
          {/* Page info */}
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

          {/* Page size selector */}
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

          {/* Prev/Next navigation */}
          <XStack gap="$2">
            <Button
              size="$3"
              disabled={currentPageNumber === 1 || loading}
              onPress={() => handlePageChange('prev')}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
                border: `1px solid rgba(196,165,90,0.25)`,
                borderRadius: 10,
                color: BRAND_GOLD_LIGHT,
                opacity: currentPageNumber === 1 || loading ? 0.4 : 1,
              }}
            >
              ← Previous
            </Button>
            <Button
              size="$3"
              disabled={currentPageNumber === totalPages || loading}
              onPress={() => handlePageChange('next')}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
                border: `1px solid rgba(196,165,90,0.25)`,
                borderRadius: 10,
                color: BRAND_GOLD_LIGHT,
                opacity: currentPageNumber === totalPages || loading ? 0.4 : 1,
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
            Batting Leaders
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
              {totalCount.toLocaleString()} players · sorted by{' '}
              {queryParams.orderBy ?? 'homeRuns'}
            </Text>
          )}
        </YStack>
      </XStack>

      {/* Controls */}
      {(showSearch || showSorting || showFilters) && renderControls()}

      {/* Error State */}
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
            {error?.message ?? 'Failed to load player statistics'}
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

      {/* Data Grid */}
      {(!error || loading) && renderDataGrid()}

      {/* Pagination */}
      {showPagination && !error && renderPagination()}
    </YStack>
  );
}

export default PlayerStatsDataGrid;

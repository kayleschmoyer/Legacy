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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type CareerStatsQueryParams,
  DEFAULT_CAREER_STATS_PARAMS,
  type PlayerCareerStats,
  useCareerStatsWithNames,
} from './services/CareerStatsService';
import { resolveVisibleColumns } from './columnVisibility';
import { StatsGridHeaderCell } from './shell/StatsGridHeaderCell';
import { StatsGridPagination } from './shell/StatsGridPagination';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  getPositionColor,
  OUTLINE_SUBTLE,
  POS_UTILITY,
  TEXT_HIGH_CONTRAST,
  TEXT_MUTED,
} from '../../utils/colors';
import { PositionBadge } from '../../components/PositionBadge';

const BG_PAGE = '#0A0F1A';
const BG_ELEVATED = '#16223A';
const SURFACE_CARD_ROW = 'rgba(17,27,47,0.92)';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// SVG icon — web-only; return null on native to avoid DOM svg crash
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
  /** Whether to show pagination controls */
  showPagination?: boolean;
  /** Custom CSS class name */
  className?: string;
  /** Test ID for automated testing */
  testId?: string;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
  /**
   * Explicit per-column visibility selection (column keys to show). When
   * provided it overrides the `statsFormat` preset; the Player column is always
   * kept. When omitted, the `statsFormat` preset is used (LS-7105 / PST-001).
   */
  visibleColumns?: readonly string[];
  /** Set of player IDs considered rostered in the user's fantasy leagues (for availability filtering). */
  rosteredPlayerIds?: ReadonlySet<number>;
  /** Availability filter value — client-side applied after fetching. */
  availabilityFilter?: 'all' | 'free_agents' | 'rostered';
  /**
   * Notifies the host when the user changes sort via a column header so the
   * sort can be persisted to the URL (LS-7115 / PST-022). Reports the mapped
   * GraphQL sort field (not the raw column key) and the direction.
   */
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
  /**
   * Fired with the rows currently displayed (after the availability filter is
   * applied) whenever they change. Lets a host surface the loaded result set —
   * e.g. so an Export action serializes the actual player rows the user is
   * looking at rather than just the filter spec (PST-011 / LS-7109).
   */
  onDataLoaded?: (rows: readonly PlayerCareerStats[]) => void;
}

// =============================================================================
// Column Configuration
// =============================================================================

/** Key of the always-visible player-name column (never hidden by the picker). */
export const BATTING_NAME_COLUMN_KEY = 'displayName';

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
 * The set of valid GraphQL sort fields the batting grid can sort by — the
 * deduped values of {@link COLUMN_TO_SORT_FIELD_MAP}. Exported so URL hosts can
 * validate an untrusted `sortBy` query param before forwarding it to the grid /
 * GraphQL, instead of passing arbitrary strings through (LS-7115 / PST-022).
 */
export const BATTING_SORT_FIELDS: ReadonlySet<string> = new Set(
  Object.values(COLUMN_TO_SORT_FIELD_MAP),
);

/**
 * Type guard for a batting sort field parsed from an untrusted source (e.g. a
 * URL query param). Returns true only for fields the grid actually supports
 * (LS-7115).
 */
export function isValidBattingSortField(field: string): boolean {
  return BATTING_SORT_FIELDS.has(field);
}

/**
 * Predefined column configuration for career batting (hitter) statistics.
 * Order mirrors docs/design/.../legacy-sports-stats-page/project/uploads/stats.md
 * (Hitter Columns section). Position is rendered as a chip inside the Player
 * cell, so it is not a separate column. Team is not available on the underlying
 * PlayerCareerStats data model and is omitted from this slice.
 */
export const CAREER_STATS_COLUMNS: readonly GridColumn[] = [
  {
    key: 'displayName',
    label: 'Player',
    sortable: true,
    width: '240px',
    minWidth: 200,
    align: 'left',
    priority: 'high',
    description: 'Player name with position chip',
  },
  {
    // Fantasy points are the app's headline number, so every stats-grid view
    // leads its stat columns with career FPTS + FP/G (LS-8569 / LS-8566).
    key: 'fantasyPoints',
    label: 'FPTS',
    sortable: true,
    width: '68px',
    align: 'right',
    priority: 'high',
    description: 'Career fantasy points using default scoring settings',
    formatter: (v: unknown) =>
      v != null ? Math.round(v as number).toString() : '—',
  },
  {
    key: 'fantasyPointsPerGame',
    label: 'FPTS/G',
    sortable: true,
    width: '72px',
    align: 'right',
    priority: 'high',
    description:
      'Average fantasy points per game using default scoring settings',
    formatter: (v: unknown) => (v != null ? (v as number).toFixed(1) : '—'),
  },
  {
    key: 'games',
    label: 'G',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'medium',
    description: 'Games played',
  },
  {
    key: 'plateAppearances',
    label: 'PA',
    sortable: true,
    width: '64px',
    align: 'right',
    priority: 'medium',
    description: 'Plate appearances',
  },
  {
    key: 'atBats',
    label: 'AB',
    sortable: true,
    width: '64px',
    align: 'right',
    priority: 'medium',
    description: 'At bats',
  },
  {
    key: 'hits',
    label: 'H',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'high',
    description: 'Hits',
  },
  {
    key: 'homeRuns',
    label: 'HR',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'high',
    description: 'Home runs',
  },
  {
    key: 'rbi',
    label: 'RBI',
    sortable: true,
    width: '60px',
    align: 'right',
    priority: 'high',
    description: 'Runs batted in',
  },
  {
    key: 'stolenBases',
    label: 'SB',
    sortable: true,
    width: '52px',
    align: 'right',
    priority: 'medium',
    description: 'Stolen bases',
  },
  {
    key: 'runs',
    label: 'R',
    sortable: true,
    width: '52px',
    align: 'right',
    priority: 'medium',
    description: 'Runs scored',
  },
  {
    key: 'doubles',
    label: '2B',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'low',
    description: 'Doubles',
  },
  {
    key: 'triples',
    label: '3B',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'low',
    description: 'Triples',
  },
  {
    key: 'baseOnBalls',
    label: 'BB',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'low',
    description: 'Base on balls (walks)',
  },
  {
    key: 'strikeouts',
    label: 'SO',
    sortable: true,
    width: '56px',
    align: 'right',
    priority: 'low',
    description: 'Strikeouts',
  },
  {
    key: 'formattedBattingAverage',
    label: 'AVG',
    sortable: true,
    width: '68px',
    align: 'right',
    priority: 'high',
    description: 'Batting average',
  },
  {
    key: 'formattedOnBasePercentage',
    label: 'OBP',
    sortable: true,
    width: '68px',
    align: 'right',
    priority: 'high',
    description: 'On-base percentage',
  },
  {
    key: 'formattedSluggingPercentage',
    label: 'SLG',
    sortable: true,
    width: '68px',
    align: 'right',
    priority: 'high',
    description: 'Slugging percentage',
  },
  {
    key: 'offensiveWAR',
    label: 'oWAR',
    sortable: true,
    width: '72px',
    align: 'right',
    priority: 'high',
    description:
      'Offensive WAR from Baseball Reference. Shown as — for players with fewer than 10 career plate appearances.',
    formatter: (v: unknown) => (v != null ? (v as number).toFixed(1) : '—'),
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
 * />
 * ```
 */
export function PlayerStatsDataGrid({
  title = 'Career Batting Statistics',
  initialParams = {},
  onPlayerSelect,
  showPagination = true,
  className,
  testId = 'player-stats-data-grid',
  statsFormat = 'expanded',
  visibleColumns,
  rosteredPlayerIds,
  availabilityFilter,
  onSortChange,
  onDataLoaded,
}: PlayerStatsDataGridProps): React.ReactElement {
  // =============================================================================
  // State Management
  // =============================================================================

  const [queryParams, setQueryParams] = useState<CareerStatsQueryParams>({
    ...DEFAULT_CAREER_STATS_PARAMS,
    ...initialParams,
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
      // Propagate to the host so the new sort can be mirrored to the URL,
      // keeping "share current view" fidelity (LS-7115). Reports the mapped
      // GraphQL field so it round-trips straight back into orderBy on reload.
      onSortChange?.(sortField, orderDirection);
    },
    [updateQueryParams, onSortChange],
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

  // Columns to render: an explicit per-column selection (LS-7105) overrides the
  // statsFormat preset; the Player column is always kept. When no selection is
  // provided this is byte-identical to the prior statsFormat-only behaviour.
  const displayColumns = useMemo(
    () =>
      resolveVisibleColumns(
        CAREER_STATS_COLUMNS,
        statsFormat,
        visibleColumns,
        BATTING_NAME_COLUMN_KEY,
      ),
    [statsFormat, visibleColumns],
  );

  const displayData = useMemo(() => {
    if (
      !availabilityFilter ||
      availabilityFilter === 'all' ||
      !rosteredPlayerIds
    ) {
      return data;
    }
    if (availabilityFilter === 'free_agents') {
      return data.filter(
        (p: PlayerCareerStats) => !rosteredPlayerIds.has(p.playerId),
      );
    }
    return data.filter((p: PlayerCareerStats) =>
      rosteredPlayerIds.has(p.playerId),
    );
  }, [data, availabilityFilter, rosteredPlayerIds]);

  // Surface the currently displayed rows to the host so an Export action can
  // serialize the actual result set instead of only the filter spec
  // (PST-011 / LS-7109). Fires on every change to the visible rows; callers
  // pass a stable (memoized) handler to avoid redundant invocations.
  useEffect(() => {
    onDataLoaded?.(displayData);
  }, [displayData, onDataLoaded]);

  // =============================================================================
  // Render Helpers
  // =============================================================================

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
      {/* Horizontal scroll wrapper — keeps the header aligned with body rows
          when columns overflow the viewport (mobile). Without this wrapper the
          body scrolls independently and the column labels appear unmoored. */}
      <YStack flex={1} style={{ overflowX: 'auto' }}>
        {/* Table Header */}
        <XStack
          style={{
            background: BRAND_NAVY_DARK,
            borderBottom: `2px solid ${OUTLINE_SUBTLE}`,
            minWidth: 'max-content',
          }}
          paddingVertical="$2"
        >
          {displayColumns.map((column) => {
            const sortField =
              COLUMN_TO_SORT_FIELD_MAP[column.key as string] || column.key;
            const isActiveSortColumn = queryParams.orderBy === sortField;
            const isPlayerCol = column.key === 'displayName';

            return (
              <StatsGridHeaderCell
                key={column.key}
                label={column.label}
                sortable={column.sortable}
                isActive={isActiveSortColumn}
                direction={
                  queryParams.orderDirection === 'desc' ? 'desc' : 'asc'
                }
                onSort={(nextDirection) =>
                  handleSort(column.key, nextDirection)
                }
                align={column.align}
                width={column.width}
                minWidth={column.minWidth}
                flexGrow={isPlayerCol ? 0 : 1}
                paddingHorizontal="$2"
                sticky={isPlayerCol}
              />
            );
          })}
        </XStack>

        {/* Table Body */}
        <YStack flex={1} style={{ minWidth: 'max-content' }}>
          {loading ? (
            <YStack
              testID="loading-indicator"
              aria-busy
              aria-label="Loading player statistics..."
              style={{ background: 'transparent' }}
            >
              {/* Skeleton rows that mirror populated row geometry */}
              {Array.from({ length: 8 }).map((_, rowIdx) => (
                <XStack
                  key={`skel-${rowIdx}`}
                  style={{
                    background: rowIdx % 2 === 0 ? BG_PAGE : SURFACE_CARD_ROW,
                    borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
                  }}
                  paddingVertical="$2"
                >
                  {displayColumns.map((column) => {
                    const isNameCol = column.key === 'displayName';
                    return (
                      <XStack
                        key={column.key}
                        width={column.width || 'auto'}
                        minWidth={column.minWidth}
                        flexGrow={isNameCol ? 0 : 1}
                        flexShrink={0}
                        alignItems="center"
                        gap="$2"
                        paddingHorizontal="$2"
                        justifyContent={
                          column.align === 'center'
                            ? 'center'
                            : column.align === 'right'
                              ? 'flex-end'
                              : 'flex-start'
                        }
                        style={
                          isNameCol
                            ? {
                                position: 'sticky',
                                left: 0,
                                zIndex: 1,
                                background:
                                  rowIdx % 2 === 0 ? BG_PAGE : SURFACE_CARD_ROW,
                                borderLeft: `1px solid ${OUTLINE_SUBTLE}`,
                              }
                            : undefined
                        }
                      >
                        {isNameCol ? (
                          <>
                            <YStack
                              style={{
                                width: 32,
                                height: 18,
                                borderRadius: 4,
                                background: 'rgba(255,255,255,0.08)',
                              }}
                            />
                            <YStack
                              style={{
                                flex: 1,
                                height: 12,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.08)',
                              }}
                            />
                          </>
                        ) : (
                          <YStack
                            style={{
                              width: '70%',
                              height: 10,
                              borderRadius: 3,
                              background: 'rgba(255,255,255,0.08)',
                            }}
                          />
                        )}
                      </XStack>
                    );
                  })}
                </XStack>
              ))}
              <XStack
                justifyContent="center"
                alignItems="center"
                padding="$3"
                gap="$2"
              >
                <Spinner size="small" color={BRAND_NAVY_LIGHT} />
                <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>
                  Loading player statistics...
                </Text>
              </XStack>
            </YStack>
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
                  updateQueryParams({
                    minGames: DEFAULT_CAREER_STATS_PARAMS.minGames ?? 10,
                    minHomeRuns: 0,
                    minRBI: 0,
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
            displayData.map((player: PlayerCareerStats, index: number) => (
              <XStack
                key={player.id}
                data-testid={`player-row-${player.playerId}`}
                style={{
                  background: index % 2 === 0 ? BG_PAGE : SURFACE_CARD_ROW,
                  borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
                  transition: 'background 0.12s ease',
                }}
                hoverStyle={{
                  backgroundColor: BG_ELEVATED as never,
                }}
                pressStyle={{ scale: 0.998 }}
                paddingVertical="$2"
                onPress={() => handleRowClick(player)}
                cursor="pointer"
              >
                {displayColumns.map((column) => {
                  const isNameCol = column.key === 'displayName';
                  const raw = player[column.key];
                  const cellValue = column.formatter
                    ? column.formatter(raw)
                    : raw == null
                      ? '—'
                      : typeof raw === 'string' ||
                          typeof raw === 'number' ||
                          typeof raw === 'boolean'
                        ? String(raw)
                        : '—';
                  const rowBg = index % 2 === 0 ? BG_PAGE : SURFACE_CARD_ROW;
                  const posKey = player.primaryPosition;
                  const posColor = posKey
                    ? getPositionColor('baseball', posKey)
                    : POS_UTILITY;
                  return (
                    <XStack
                      key={column.key}
                      width={column.width || 'auto'}
                      minWidth={column.minWidth}
                      flexGrow={isNameCol ? 0 : 1}
                      flexShrink={0}
                      justifyContent={
                        column.align === 'center'
                          ? 'center'
                          : column.align === 'right'
                            ? 'flex-end'
                            : 'flex-start'
                      }
                      alignItems="center"
                      paddingHorizontal="$2"
                      gap="$2"
                      style={
                        isNameCol
                          ? {
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              background: rowBg,
                              borderLeft: `1px solid ${posColor}`,
                            }
                          : undefined
                      }
                    >
                      {isNameCol && posKey ? (
                        <PositionBadge
                          position={posKey}
                          color={posColor}
                          variant="solid"
                          paddingHorizontal={7}
                          paddingVertical={3}
                          borderRadius={4}
                          minWidth={32}
                          fontSize={10}
                          fontWeight="800"
                          fontFamily={FONT_DISPLAY}
                          letterSpacing={0.8}
                        />
                      ) : null}
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
    </YStack>
  );

  /**
   * Renders pagination controls with page jumping
   */
  const renderPagination = () => (
    <StatsGridPagination
      currentPage={currentPageNumber}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      loading={loading}
      onPrev={() => handlePageChange('prev')}
      onNext={() => handlePageChange('next')}
      onGoToPage={handleGoToPage}
      onPageSizeChange={handlePageSizeChange}
    />
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
      {/* Section caption — eyebrow + count/sort subtitle */}
      <XStack justifyContent="space-between" alignItems="flex-end">
        <YStack gap="$1">
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: 1.76,
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
              letterSpacing: -0.22,
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

      {/* Error State */}
      {error && !loading && (
        <YStack
          testID="error-message"
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
              letterSpacing: 0.72,
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

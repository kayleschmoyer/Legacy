/**
 * PlayerStatsDataGrid - Career Batting Statistics Data Grid
 *
 * Thin adapter over the shared sport-agnostic {@link StatsDataGrid}
 * (LS-9036): owns the career-batting GraphQL data-fetching hook, cursor
 * pagination math, and the batting column configuration; delegates all
 * row/table rendering to StatsDataGrid — the same presentational component
 * the pitching and football grids consume — so there is exactly one
 * row-rendering implementation shared across sports.
 *
 * @since 2025-09-28
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from 'tamagui';
import {
  type CareerStatsQueryParams,
  DEFAULT_CAREER_STATS_PARAMS,
  type PlayerCareerStats,
  useCareerStatsWithNames,
} from './services/CareerStatsService';
import { resolveVisibleColumns } from './columnVisibility';
import { StatsDataGrid, type StatsDataGridColumn } from './shell/StatsDataGrid';
import { FONT_BODY, FONT_DISPLAY } from './shell/tokens';
import {
  getPositionColor,
  POS_UTILITY,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../utils/colors';
import { PositionBadge } from '../../components/PositionBadge';

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
 * Builds the {@link StatsDataGrid} column set from the batting `GridColumn`
 * config. The Player column renders a rich cell (position badge + name); every
 * other column renders its formatted value in the shared mono/muted style.
 */
function toGridColumns(
  displayColumns: readonly GridColumn[],
): readonly StatsDataGridColumn<PlayerCareerStats>[] {
  return displayColumns.map((column) => {
    const isNameCol = column.key === BATTING_NAME_COLUMN_KEY;
    return {
      key: column.key,
      label: column.label,
      sortable: column.sortable,
      sortKey: COLUMN_TO_SORT_FIELD_MAP[column.key as string] ?? column.key,
      align: column.align,
      width: column.width,
      minWidth: column.minWidth,
      sticky: isNameCol,
      accessibilityLabel: column.sortable
        ? `Sort by ${column.label}`
        : undefined,
      renderCell: (player: PlayerCareerStats) => {
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

        if (isNameCol) {
          const posKey = player.primaryPosition;
          const posColor = posKey
            ? getPositionColor('baseball', posKey)
            : POS_UTILITY;
          return (
            <>
              {posKey && (
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
              )}
              <Text
                numberOfLines={1}
                fontFamily={FONT_BODY}
                fontWeight="600"
                fontSize={14}
                color={TEXT_PRIMARY}
              >
                {cellValue}
              </Text>
            </>
          );
        }

        return (
          <Text
            numberOfLines={1}
            fontWeight="400"
            fontSize={13}
            color={TEXT_MUTED}
            fontVariant={['tabular-nums']}
          >
            {cellValue}
          </Text>
        );
      },
    };
  });
}

/**
 * PlayerStatsDataGrid Component
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
  const [queryParams, setQueryParams] = useState<CareerStatsQueryParams>({
    ...DEFAULT_CAREER_STATS_PARAMS,
    ...initialParams,
  });

  const {
    data: rawData,
    loading,
    error,
    totalCount: rawTotalCount,
    hasNextPage: rawHasNextPage,
    hasPreviousPage: rawHasPreviousPage,
    pageSize,
    refetch,
  } = useCareerStatsWithNames(queryParams);

  // useCareerStatsWithNames fetches network-only, so `data` (and totalCount)
  // transiently reset to empty on every sort/filter/page change while the new
  // request is in flight. Without this, a mid-refetch render would see zero
  // rows and StatsDataGrid would swap the whole grid (title + pagination
  // included) for the loading skeleton — losing the pager the user just
  // clicked. Keep serving the last successful page during a refetch instead.
  const lastGoodRef = React.useRef({
    data: rawData,
    totalCount: rawTotalCount,
    hasNextPage: rawHasNextPage,
    hasPreviousPage: rawHasPreviousPage,
  });
  if (rawData.length > 0 || !loading) {
    lastGoodRef.current = {
      data: rawData,
      totalCount: rawTotalCount,
      hasNextPage: rawHasNextPage,
      hasPreviousPage: rawHasPreviousPage,
    };
  }
  const usingStaleData = loading && rawData.length === 0;
  const data = usingStaleData ? lastGoodRef.current.data : rawData;
  const totalCount = usingStaleData
    ? lastGoodRef.current.totalCount
    : rawTotalCount;
  const hasNextPage = usingStaleData
    ? lastGoodRef.current.hasNextPage
    : rawHasNextPage;
  const hasPreviousPage = usingStaleData
    ? lastGoodRef.current.hasPreviousPage
    : rawHasPreviousPage;

  const updateQueryParams = useCallback(
    (updates: Partial<CareerStatsQueryParams>) => {
      setQueryParams((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSort = useCallback(
    (sortKey: string, orderDirection: 'asc' | 'desc') => {
      updateQueryParams({
        orderBy: sortKey,
        orderDirection,
        after: undefined, // reset to first page
      });
      // Propagate to the host so the new sort can be mirrored to the URL,
      // keeping "share current view" fidelity (LS-7115).
      onSortChange?.(sortKey, orderDirection);
    },
    [updateQueryParams, onSortChange],
  );

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
        updateQueryParams({ after: btoa(String(nextOffset)) });
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

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      updateQueryParams({ first: newPageSize, after: undefined });
    },
    [updateQueryParams],
  );

  const handleGoToPage = useCallback(
    (pageNumber: number) => {
      const pageSz = queryParams.first ?? 25;
      const totalPages = Math.ceil(totalCount / pageSz);
      if (pageNumber < 1 || pageNumber > totalPages) {
        return;
      }
      const offset = (pageNumber - 1) * pageSz;
      // Cursor from offset (same encoding used by backend)
      const cursor = offset > 0 ? btoa(offset.toString()) : undefined;
      updateQueryParams({ after: cursor });
    },
    [queryParams.first, totalCount, updateQueryParams],
  );

  const totalPages = useMemo(() => {
    const pageSz = queryParams.first ?? 25;
    return Math.max(1, Math.ceil(totalCount / pageSz));
  }, [totalCount, queryParams.first]);

  const currentPageNumber = useMemo(() => {
    const pageSz = queryParams.first ?? 25;
    const offset = queryParams.after ? parseInt(atob(queryParams.after)) : 0;
    return Math.floor(offset / pageSz) + 1;
  }, [queryParams.after, queryParams.first]);

  const handleRowClick = useCallback(
    (player: PlayerCareerStats) => {
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  const handleRefresh = useCallback(() => {
    if (refetch) {
      void refetch();
    }
  }, [refetch]);

  const handleClearFilters = useCallback(() => {
    updateQueryParams({
      minGames: DEFAULT_CAREER_STATS_PARAMS.minGames ?? 10,
      minHomeRuns: 0,
      minRBI: 0,
      searchTerm: undefined,
      position: undefined,
      after: undefined,
    });
  }, [updateQueryParams]);

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

  const gridColumns = useMemo(
    () => toGridColumns(displayColumns),
    [displayColumns],
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

  return (
    <StatsDataGrid
      testId={testId}
      className={className}
      title={title}
      subtitle={`${totalCount.toLocaleString()} players · sorted by ${queryParams.orderBy ?? 'homeRuns'}`}
      rows={displayData}
      getRowId={(player) => player.id}
      getRowTestId={(player) => `player-row-${player.playerId}`}
      columns={gridColumns}
      onRowClick={handleRowClick}
      sortField={queryParams.orderBy ?? undefined}
      sortDir={queryParams.orderDirection === 'desc' ? 'desc' : 'asc'}
      onSortChange={handleSort}
      loading={loading}
      error={error}
      onRetry={handleRefresh}
      errorTitle="Error Loading Statistics"
      onClear={handleClearFilters}
      emptyTitle="No players found"
      loadingColumnCount={Math.max(0, gridColumns.length - 1)}
      currentPage={currentPageNumber}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      hasPreviousPage={hasPreviousPage}
      hasNextPage={hasNextPage}
      onPrev={() => handlePageChange('prev')}
      onNext={() => handlePageChange('next')}
      onGoToPage={handleGoToPage}
      onPageSizeChange={handlePageSizeChange}
      showPagination={showPagination}
    />
  );
}

export default PlayerStatsDataGrid;

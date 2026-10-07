/**
 * PitchingStatsDataGrid - Career Pitching Statistics Data Grid
 *
 * Thin adapter over the shared sport-agnostic {@link StatsDataGrid}
 * (LS-9036): owns the career-pitching GraphQL data-fetching hooks, offset
 * pagination math, and the pitching column configuration; delegates all
 * row/table rendering to StatsDataGrid — the same presentational component
 * the batting and football grids consume.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from 'tamagui';
import {
  type CareerPitchingFragment,
  type GetCareerPitchingStatsQueryVariables,
  useGetCareerPitchingStatsCountQuery,
  useGetCareerPitchingStatsQuery,
} from '@legacy-sports/graphql';
import { resolveVisibleColumns } from './columnVisibility';
import { type ExportColumn, toExportCell } from './exportColumns';
import { formatPositionsPlayed } from './services/CareerStatsService';
import { StatsDataGrid, type StatsDataGridColumn } from './shell/StatsDataGrid';
import { FONT_BODY } from './shell/tokens';
import { TEXT_PRIMARY } from '../../utils/colors';

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
  showPagination?: boolean;
  className?: string;
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
   * Fired with the rows currently displayed (after the availability filter is
   * applied) whenever they change. Lets a host surface the loaded result set —
   * e.g. so an Export action serializes the actual pitching rows the user is
   * looking at rather than just the filter spec (PST-011 / LS-7109).
   */
  onDataLoaded?: (
    rows: readonly CareerPitchingFragment[],
    totalCount: number,
  ) => void;
}

/** Key of the always-visible player-name column (never hidden by the picker). */
export const PITCHING_NAME_COLUMN_KEY = 'playerName';

// =============================================================================
// Column Configuration
// =============================================================================

// Column order mirrors docs/agents/pages/players/index.md (Pitcher Columns section):
// Name · Position · [Team omitted — not available on CareerPitching data model] ·
// G · GS · W · L · IP · ERA · SO · BB · WHIP · SHO · SV · K/9
// Additional non-spec columns (CG, H, ER, WAR) follow at the end. Fantasy points
// are the app's headline number, so every stats-grid view leads its stat
// columns with career FPTS + FP/G (LS-8569 / LS-8566).
export const PITCHING_STATS_COLUMNS: readonly PitchingGridColumn[] = [
  {
    key: 'playerName',
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
    key: 'fantasyPoints',
    label: 'FPTS',
    sortable: true,
    width: '80px',
    align: 'center',
    priority: 'high',
    description: 'Career fantasy points using default scoring settings',
    formatter: (v: unknown) =>
      v != null ? Math.round(v as number).toString() : '—',
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
    key: 'games',
    label: 'G',
    sortable: true,
    width: '60px',
    align: 'center',
    priority: 'medium',
    description: 'Games pitched',
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
    // Derived from outsRecorded / 3; displayed in baseball IP notation (e.g. 12.2 = 12⅔ innings).
    key: 'inningsPitched',
    label: 'IP',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Innings pitched',
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
    key: 'whip',
    label: 'WHIP',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Walks plus hits per inning pitched',
    formatter: (v: unknown) =>
      v != null && typeof v === 'number' ? v.toFixed(2) : '-',
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
    key: 'strikeoutsPerNine',
    label: 'K/9',
    sortable: true,
    width: '70px',
    align: 'center',
    priority: 'high',
    description: 'Strikeouts per nine innings',
    formatter: (v: unknown) =>
      v != null && typeof v === 'number' ? v.toFixed(2) : '-',
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
] as const;

const COLUMN_TO_SORT_FIELD_MAP: Record<string, string> = {
  playerName: 'lastName',
  games: 'games',
  gamesStarted: 'gamesStarted',
  wins: 'wins',
  losses: 'losses',
  inningsPitched: 'outsRecorded',
  era: 'era',
  strikeouts: 'strikeouts',
  baseOnBalls: 'baseOnBalls',
  whip: 'whip',
  shutouts: 'shutouts',
  saves: 'saves',
  strikeoutsPerNine: 'strikeoutsPerNine',
  completeGames: 'completeGames',
  hits: 'hits',
  earnedRuns: 'earnedRuns',
  pitchingWAR: 'pitchingWAR',
  // Fantasy points (computed server-side, sortable via a real SQL expression — LS-8569)
  fantasyPoints: 'fantasyPoints',
  fantasyPointsPerGame: 'fantasyPointsPerGame',
};

/** Resolves a cell's display value, including the special-cased columns. */
function cellValueFor(
  column: PitchingGridColumn,
  player: CareerPitchingFragment | null | undefined,
): string {
  if (column.key === 'playerName') {
    return (
      `${player?.player?.firstName ?? ''} ${player?.player?.lastName ?? ''}`.trim() ||
      `Player ${player?.playerId ?? '-'}`
    );
  }
  if (column.key === 'formattedPositions') {
    return (
      formatPositionsPlayed(player?.positionsPlayed) ||
      player?.primaryPosition ||
      '-'
    );
  }
  if (column.key === 'inningsPitched') {
    const outs = player?.outsRecorded;
    if (outs == null || outs === 0) return '-';
    const wholeInnings = Math.floor(outs / 3);
    const extraOuts = outs % 3;
    return `${wholeInnings}.${extraOuts}`;
  }
  const rawVal = getFieldValue(player, column.key);
  if (column.formatter) {
    return column.formatter(rawVal);
  }
  return stringifyPrimitive(rawVal);
}

/**
 * Export columns for the pitching table (LS-10731): the same columns the grid
 * renders for this `statsFormat` / per-column selection, with the grid's
 * formatting, so the file matches the visible table.
 */
export function buildPitchingExportColumns(
  statsFormat: 'standard' | 'expanded',
  visibleColumns: readonly string[] | undefined,
): readonly ExportColumn<CareerPitchingFragment>[] {
  return resolveVisibleColumns(
    PITCHING_STATS_COLUMNS,
    statsFormat,
    visibleColumns,
    PITCHING_NAME_COLUMN_KEY,
  ).map((column): ExportColumn<CareerPitchingFragment> => {
    const isNameCol = column.key === PITCHING_NAME_COLUMN_KEY;
    return {
      key: column.key,
      header: isNameCol ? 'Name' : column.label,
      value: (row) =>
        isNameCol
          ? cellValueFor(column, row)
          : toExportCell(cellValueFor(column, row)),
    };
  });
}

/** Stringifies only primitives with a safe default toString; anything else (object, undefined) falls back to an em dash. */
function stringifyPrimitive(val: unknown): string {
  switch (typeof val) {
    case 'string':
      return val;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(val);
    default:
      return '—';
  }
}

/**
 * Reads `key` off `player` without asserting it's a known key of
 * CareerPitchingFragment — column.key is a plain string, so a misaligned
 * column config degrades to `undefined` here instead of an unsafe cast.
 */
function getFieldValue(
  player: CareerPitchingFragment | null | undefined,
  key: string,
): unknown {
  if (!player || !(key in player)) return undefined;
  return (player as unknown as Record<string, unknown>)[key];
}

function toGridColumns(
  displayColumns: readonly PitchingGridColumn[],
): readonly StatsDataGridColumn<CareerPitchingFragment>[] {
  return displayColumns.map((column) => {
    const isNameCol = column.key === PITCHING_NAME_COLUMN_KEY;
    return {
      key: column.key,
      label: column.label,
      sortable: column.sortable,
      sortKey: COLUMN_TO_SORT_FIELD_MAP[column.key] ?? column.key,
      align: column.align,
      width: column.width,
      minWidth: column.minWidth,
      accessibilityLabel: column.sortable
        ? `Sort by ${column.label}`
        : undefined,
      formatter: (player: CareerPitchingFragment) =>
        cellValueFor(column, player),
      renderCell: isNameCol
        ? (player: CareerPitchingFragment) => (
            <Text
              numberOfLines={1}
              fontFamily={FONT_BODY}
              fontWeight="600"
              fontSize={14}
              color={TEXT_PRIMARY}
            >
              {cellValueFor(column, player)}
            </Text>
          )
        : undefined,
    };
  });
}

export function PitchingStatsDataGrid({
  title = 'Career Pitching Statistics',
  initialParams = {},
  onPlayerSelect,
  showPagination = true,
  className,
  testId = 'pitching-stats-data-grid',
  statsFormat = 'expanded',
  visibleColumns,
  rosteredPlayerIds,
  availabilityFilter,
  onDataLoaded,
}: PitchingStatsDataGridProps): React.ReactElement {
  const [queryParams, setQueryParams] =
    useState<GetCareerPitchingStatsQueryVariables>({
      limit: initialParams.limit || 25,
      offset: initialParams.offset || 0,
      orderBy: initialParams.orderBy || 'wins',
      orderDirection: initialParams.orderDirection || 'desc',
      ...initialParams,
    });

  const { data, loading, error, refetch } = useGetCareerPitchingStatsQuery({
    variables: queryParams,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network',
  });

  const pitchingData = useMemo(
    () => data?.careerPitchingStats ?? [],
    [data?.careerPitchingStats],
  );

  const displayPitchingData = useMemo(() => {
    const withoutNulls = pitchingData.filter(
      (p): p is CareerPitchingFragment => p != null,
    );
    if (
      !availabilityFilter ||
      availabilityFilter === 'all' ||
      !rosteredPlayerIds
    ) {
      return withoutNulls;
    }
    if (availabilityFilter === 'free_agents') {
      return withoutNulls.filter(
        (p) => !rosteredPlayerIds.has(p.playerId ?? -1),
      );
    }
    return withoutNulls.filter((p) => rosteredPlayerIds.has(p.playerId ?? -1));
  }, [pitchingData, availabilityFilter, rosteredPlayerIds]);

  const { data: countData } = useGetCareerPitchingStatsCountQuery({
    variables: {
      minGames: queryParams.minGames,
      minWins: queryParams.minWins,
      maxWins: queryParams.maxWins,
      minStrikeouts: queryParams.minStrikeouts,
      maxStrikeouts: queryParams.maxStrikeouts,
      minERA: queryParams.minERA,
      maxERA: queryParams.maxERA,
      searchTerm: queryParams.searchTerm,
      position: queryParams.position,
      team: queryParams.team,
    },
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });
  const totalCount = countData?.careerPitchingStatsCount ?? pitchingData.length;

  // Surface the displayed rows and the filtered total to the host
  // (PST-011 / LS-7109) so it can state the export's row scope (LS-10731).
  // Callers pass a stable (memoized) handler to avoid redundant invocations.
  useEffect(() => {
    // Wait for the count so a host never sees the page length as the total.
    if (loading || countData === undefined) return;
    onDataLoaded?.(displayPitchingData, totalCount);
  }, [displayPitchingData, totalCount, loading, countData, onDataLoaded]);

  const updateQueryParams = useCallback(
    (updates: Partial<GetCareerPitchingStatsQueryVariables>) => {
      setQueryParams((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSort = useCallback(
    (sortKey: string, orderDirection: 'asc' | 'desc') => {
      updateQueryParams({
        orderBy: sortKey,
        orderDirection,
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

  const handleClearFilters = useCallback(() => {
    updateQueryParams({
      minGames: 0,
      minWins: 0,
      minStrikeouts: 0,
      position: undefined,
      offset: 0,
    });
  }, [updateQueryParams]);

  const pageSize = queryParams.limit || 25;
  const currentOffset = queryParams.offset || 0;
  const currentPageNumber = Math.floor(currentOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasNextPage = currentOffset + pageSize < totalCount;
  const hasPreviousPage = currentOffset > 0;

  // Columns to render: an explicit per-column selection (LS-7105) overrides the
  // statsFormat preset; the Player column is always kept. When no selection is
  // provided this is byte-identical to the prior statsFormat-only behaviour.
  const displayColumns = useMemo(
    () =>
      resolveVisibleColumns(
        PITCHING_STATS_COLUMNS,
        statsFormat,
        visibleColumns,
        PITCHING_NAME_COLUMN_KEY,
      ),
    [statsFormat, visibleColumns],
  );

  const gridColumns = useMemo(
    () => toGridColumns(displayColumns),
    [displayColumns],
  );

  return (
    <StatsDataGrid
      testId={testId}
      className={className}
      title={title}
      subtitle={`${totalCount.toLocaleString()} pitchers · sorted by ${queryParams.orderBy ?? 'wins'}`}
      rows={displayPitchingData}
      getRowId={(player, index) => player.playerId ?? index}
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
      emptyTitle="No pitchers found"
      loadingColumnCount={Math.max(0, gridColumns.length - 2)}
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

export default PitchingStatsDataGrid;

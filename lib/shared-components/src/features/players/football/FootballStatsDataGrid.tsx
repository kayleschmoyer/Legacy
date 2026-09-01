import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'tamagui';
import { useFootballPlayerStatsGridQuery } from '@legacy-sports/graphql';
import {
  FOOTBALL_PAGE_SIZE_OPTIONS,
  type FootballAvailability,
  type FootballQueryVars,
  type FootballSortField,
  isFootballSortField,
} from './footballStatsHelpers';
import {
  type FootballGridColumn,
  type FootballStatsRow,
} from './footballStatsColumns';
import {
  getPositionColor,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../shell/tokens';
import { PositionBadge } from '../../../components/PositionBadge';
import {
  StatsDataGrid,
  type StatsDataGridColumn,
} from '../shell/StatsDataGrid';

/** Fixed identity columns every view leads with. */
const NAME_WIDTH = 160;
const POS_WIDTH = 72;
const TEAM_WIDTH = 80;
const STAT_MIN_WIDTH = 64;

export interface FootballStatsDataGridProps {
  /** Committed GraphQL filter variables (category, sort, positions, team…). */
  queryVars: FootballQueryVars;
  /** Stat columns for the active view (identity columns are built in). */
  columns: readonly FootballGridColumn[];
  /** Section title, e.g. "NFL Career Passing Leaders". */
  title: string;
  /** Rows per page — drives the `first` connection arg. */
  pageSize: number;
  /**
   * Opaque key derived from the committed filters + page size. When it
   * changes, pagination resets to page one — an offset cursor is only valid
   * for the result set that produced it.
   */
  resetKey: string;
  /** Active sort (already resolved to a field valid for the view). */
  sortField: FootballSortField;
  sortDir: 'asc' | 'desc';
  /** Header click → controller commits the new sort. */
  onSortChange: (field: FootballSortField, dir: 'asc' | 'desc') => void;
  /** Pager page-size buttons → controller commits the new page size. */
  onPageSizeChange: (size: number) => void;
  /** Row click → open the player detail surface for this id. */
  onPlayerSelect: (playerId: number) => void;
  /** Player IDs rostered in the viewer's football leagues (availability filter). */
  rosteredPlayerIds?: ReadonlySet<number>;
  /** Availability filter — applied client-side after fetching. */
  availabilityFilter?: FootballAvailability;
  /** Stat-column count for the loading skeleton shimmer rows. */
  loadingColumnCount?: number;
}

/**
 * Builds the full column set (identity + stat columns) for {@link
 * StatsDataGrid}. Identity columns render rich cells (position badge, muted
 * team text) via `renderCell`; stat columns render the value + optional
 * muted sub-label (e.g. overview's per-position key stat).
 */
export function buildColumns(
  statColumns: readonly FootballGridColumn[],
): readonly StatsDataGridColumn<FootballStatsRow>[] {
  return [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      defaultDirection: 'asc',
      width: NAME_WIDTH,
      accessibilityLabel: 'Sort by name',
      renderCell: (row) => {
        const fullName =
          [row.firstName, row.lastName].filter(Boolean).join(' ') ||
          'Unknown Player';
        return (
          <Text
            fontSize={14}
            fontWeight="600"
            color={TEXT_PRIMARY}
            fontFamily={FONT_DISPLAY}
            numberOfLines={1}
          >
            {fullName}
          </Text>
        );
      },
    },
    {
      key: 'position',
      label: 'Pos',
      sortable: true,
      defaultDirection: 'asc',
      width: POS_WIDTH,
      accessibilityLabel: 'Sort by position',
      renderCell: (row) => {
        const isDst = row.isDst ?? false;
        const posLabel = isDst ? 'DST' : row.position;
        const posColor = getPositionColor('football', posLabel ?? '');
        return (
          <PositionBadge
            position={posLabel ?? '?'}
            color={posColor}
            showBorder
            paddingHorizontal={6}
            paddingVertical={2}
            borderRadius={4}
            fontSize={11}
            fontFamily={FONT_BODY}
            letterSpacing={0.5}
          />
        );
      },
    },
    {
      key: 'team',
      label: 'Team',
      sortable: true,
      defaultDirection: 'asc',
      width: TEAM_WIDTH,
      accessibilityLabel: 'Sort by team',
      renderCell: (row) => (
        <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          {row.nflTeam ?? '—'}
        </Text>
      ),
    },
    ...statColumns.map(
      (column): StatsDataGridColumn<FootballStatsRow> => ({
        key: column.key,
        label: column.label,
        sortable: column.sortKey != null,
        sortKey: column.sortKey,
        align: 'right',
        // Every column gets an explicit fixed width — like the baseball/
        // pitching grids' column configs — so `StatsDataGrid` never falls
        // back to flex-grow sizing (LS-9503: flex-grow made stat columns
        // stretch to fill leftover space, varying per view/viewport instead
        // of rendering at a consistent width).
        width: column.width ?? column.minWidth ?? STAT_MIN_WIDTH,
        minWidth: column.minWidth ?? STAT_MIN_WIDTH,
        accessibilityLabel:
          column.sortKey != null ? `Sort by ${column.label}` : undefined,
        renderCell: (row) => {
          const value = column.format(row);
          const subLabel = column.subLabel?.(row);
          return (
            <>
              <Text
                fontSize={13}
                fontWeight="600"
                color={TEXT_PRIMARY}
                fontVariant={['tabular-nums']}
              >
                {value}
              </Text>
              {subLabel ? (
                <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                  {subLabel}
                </Text>
              ) : null}
            </>
          );
        },
      }),
    ),
  ];
}

/**
 * Football stats grid (LS-8566, LS-9036). Thin adapter over the shared
 * sport-agnostic {@link StatsDataGrid}: owns the `FootballPlayerStatsGrid`
 * GraphQL query, offset-cursor pagination math, and the identity + stat
 * column definitions; delegates all row/table rendering to StatsDataGrid.
 * Row click → `onPlayerSelect(playerId)` so the host opens the detail modal
 * (LS-8442).
 */
export function FootballStatsDataGrid({
  queryVars,
  columns,
  title,
  pageSize,
  resetKey,
  sortField,
  sortDir,
  onSortChange,
  onPageSizeChange,
  onPlayerSelect,
  rosteredPlayerIds,
  availabilityFilter,
  loadingColumnCount = 3,
}: FootballStatsDataGridProps) {
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to page one whenever the committed filters or page size change.
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      setPageIndex(0);
    }
  }, [resetKey]);

  // The server's cursor is a plain offset — page N starts at N * pageSize.
  const cursor = pageIndex === 0 ? undefined : String(pageIndex * pageSize);

  const { data, loading, error } = useFootballPlayerStatsGridQuery({
    variables: { ...queryVars, first: pageSize, after: cursor },
    notifyOnNetworkStatusChange: true,
    // cache-and-network guarantees a network request fires when variables
    // change, matching the standalone page (required for hermetic e2e that
    // assert the outgoing variables — LS-5607).
    fetchPolicy: 'cache-and-network',
  });

  const connection = data?.footballPlayers;
  const totalCount = connection?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = pageIndex + 1;

  const players = useMemo(() => {
    const nodes = (connection?.nodes ?? []).filter(
      (p): p is FootballStatsRow => p?.id != null,
    );
    if (
      !availabilityFilter ||
      availabilityFilter === 'all' ||
      !rosteredPlayerIds
    ) {
      return nodes;
    }
    if (availabilityFilter === 'free_agents') {
      return nodes.filter((p) => !rosteredPlayerIds.has(p.id));
    }
    return nodes.filter((p) => rosteredPlayerIds.has(p.id));
  }, [connection?.nodes, availabilityFilter, rosteredPlayerIds]);

  const sortLabel =
    columns.find((c) => c.sortKey === sortField)?.label ?? sortField;

  const gridColumns = useMemo(() => buildColumns(columns), [columns]);

  return (
    <StatsDataGrid
      testId="football-stats-data-grid"
      tableTestId="player-list-table"
      title={title}
      subtitle={`${totalCount.toLocaleString()} players · sorted by ${sortLabel}`}
      rows={players}
      getRowId={(row) => row.id}
      columns={gridColumns}
      onRowClick={(row) => onPlayerSelect(row.id)}
      sortField={sortField}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        if (isFootballSortField(key)) {
          onSortChange(key, dir);
        }
      }}
      loading={loading}
      error={error}
      loadingColumnCount={loadingColumnCount}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      pageSizeOptions={FOOTBALL_PAGE_SIZE_OPTIONS}
      onPrev={() => setPageIndex((i) => Math.max(0, i - 1))}
      onNext={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
      onGoToPage={(page) => setPageIndex(page - 1)}
      onPageSizeChange={onPageSizeChange}
    />
  );
}

export default FootballStatsDataGrid;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useFootballPlayerStatsGridQuery } from '@legacy-sports/graphql';
import {
  FOOTBALL_PAGE_SIZE_OPTIONS,
  type FootballAvailability,
  type FootballQueryVars,
  type FootballSortField,
} from './footballStatsHelpers';
import {
  type FootballGridColumn,
  type FootballStatsRow,
} from './footballStatsColumns';
import {
  BRAND_NAVY_LIGHT,
  getPositionColor,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../shell/tokens';
import { PositionBadge } from '../../../components/PositionBadge';
import { EmptyCard, ErrorCard, LoadingSkeleton } from '../shell/StateCards';
import { StatsGridHeaderCell } from '../shell/StatsGridHeaderCell';
import { StatsGridPagination } from '../shell/StatsGridPagination';

const SURFACE_HOVER = withAlpha(BRAND_NAVY_LIGHT, 0.12);

/** Fixed identity columns every view leads with. */
const NAME_MIN_WIDTH = 160;
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

function FootballGridRow({
  player,
  columns,
  onSelect,
}: {
  player: FootballStatsRow;
  columns: readonly FootballGridColumn[];
  onSelect: (id: number) => void;
}) {
  const pos = player.position;
  const isDst = player.isDst ?? false;
  const posLabel = isDst ? 'DST' : pos;
  const posColor = getPositionColor('football', posLabel ?? '');
  const fullName =
    [player.firstName, player.lastName].filter(Boolean).join(' ') ||
    'Unknown Player';

  return (
    <XStack
      cursor="pointer"
      borderBottomWidth={1}
      borderColor={OUTLINE_SUBTLE}
      hoverStyle={{ backgroundColor: SURFACE_HOVER }}
      pressStyle={{ opacity: 0.85 }}
      animation="quick"
      onPress={() => player.id != null && onSelect(player.id)}
    >
      <XStack
        flex={1}
        minWidth={NAME_MIN_WIDTH}
        paddingHorizontal={12}
        paddingVertical={10}
        alignItems="center"
      >
        <Text
          fontSize={14}
          fontWeight="600"
          color={TEXT_PRIMARY}
          fontFamily={FONT_DISPLAY}
          numberOfLines={1}
        >
          {fullName}
        </Text>
      </XStack>
      <XStack
        width={POS_WIDTH}
        paddingHorizontal={12}
        paddingVertical={10}
        alignItems="center"
      >
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
      </XStack>
      <XStack
        width={TEAM_WIDTH}
        paddingHorizontal={12}
        paddingVertical={10}
        alignItems="center"
      >
        <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          {player.nflTeam ?? '—'}
        </Text>
      </XStack>
      {columns.map((column) => {
        const value = column.format(player);
        const subLabel = column.subLabel?.(player);
        return (
          <XStack
            key={column.key}
            width={column.width}
            minWidth={column.minWidth ?? STAT_MIN_WIDTH}
            flexGrow={column.width ? 0 : 1}
            paddingHorizontal={12}
            paddingVertical={10}
            alignItems="center"
            justifyContent="flex-end"
            gap={6}
          >
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
          </XStack>
        );
      })}
    </XStack>
  );
}

/**
 * Football stats grid (LS-8566). Columns-driven leader board rendered through
 * the shared grid chrome ({@link StatsGridHeaderCell} sortable headers,
 * {@link StatsGridPagination} numbered pager) — the same primitives the MLB
 * batting/pitching grids consume — over the `FootballPlayerStatsGrid`
 * connection. Sorting and category filtering are fully server-side; the
 * availability filter stays client-side over the fetched page (matching the
 * pre-tabs behavior). Loading / error / empty render through the shared
 * {@link StateCards}. Row click → `onPlayerSelect(playerId)` so the host opens
 * the detail modal (LS-8442).
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

  if (error && !connection) {
    return <ErrorCard />;
  }

  if (loading && !connection) {
    return <LoadingSkeleton columnCount={loadingColumnCount} />;
  }

  const sortLabel =
    columns.find((c) => c.sortKey === sortField)?.label ?? sortField;

  return (
    <YStack gap={16}>
      <YStack gap={2}>
        <Text
          fontSize={20}
          fontWeight="700"
          color={TEXT_PRIMARY}
          fontFamily={FONT_DISPLAY}
        >
          {title}
        </Text>
        <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          {totalCount.toLocaleString()} players · sorted by {sortLabel}
        </Text>
      </YStack>

      {players.length === 0 ? (
        <EmptyCard />
      ) : (
        <YStack
          testID="player-list-table"
          backgroundColor={SURFACE_CARD}
          borderWidth={1}
          borderColor={OUTLINE_SUBTLE}
          borderRadius={10}
          overflow="hidden"
        >
          {/* Horizontal scroll wrapper keeps the header aligned with body
              rows when stat columns overflow the viewport (mobile). */}
          <YStack style={{ overflowX: 'auto' }}>
            <XStack
              backgroundColor={SURFACE_PANEL}
              borderBottomWidth={1}
              borderColor={OUTLINE_SUBTLE}
              style={{ minWidth: 'max-content' }}
            >
              <StatsGridHeaderCell
                label="Name"
                sortable
                isActive={sortField === 'name'}
                direction={sortDir}
                defaultDirection="asc"
                onSort={(dir) => onSortChange('name', dir)}
                minWidth={NAME_MIN_WIDTH}
                accessibilityLabel="Sort by name"
              />
              <StatsGridHeaderCell
                label="Pos"
                sortable
                isActive={sortField === 'position'}
                direction={sortDir}
                defaultDirection="asc"
                onSort={(dir) => onSortChange('position', dir)}
                width={POS_WIDTH}
                flexGrow={0}
                accessibilityLabel="Sort by position"
              />
              <StatsGridHeaderCell
                label="Team"
                sortable
                isActive={sortField === 'team'}
                direction={sortDir}
                defaultDirection="asc"
                onSort={(dir) => onSortChange('team', dir)}
                width={TEAM_WIDTH}
                flexGrow={0}
                accessibilityLabel="Sort by team"
              />
              {columns.map((column) => (
                <StatsGridHeaderCell
                  key={column.key}
                  label={column.label}
                  sortable={column.sortKey != null}
                  isActive={
                    column.sortKey != null && sortField === column.sortKey
                  }
                  direction={sortDir}
                  onSort={
                    column.sortKey != null
                      ? (dir) =>
                          onSortChange(column.sortKey as FootballSortField, dir)
                      : undefined
                  }
                  align="right"
                  width={column.width}
                  minWidth={column.minWidth ?? STAT_MIN_WIDTH}
                  flexGrow={column.width ? 0 : 1}
                  accessibilityLabel={
                    column.sortKey != null
                      ? `Sort by ${column.label}`
                      : undefined
                  }
                />
              ))}
            </XStack>
            <YStack style={{ minWidth: 'max-content' }}>
              {players.map((player) => (
                <FootballGridRow
                  key={player.id}
                  player={player}
                  columns={columns}
                  onSelect={onPlayerSelect}
                />
              ))}
            </YStack>
          </YStack>
        </YStack>
      )}

      <StatsGridPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        pageSizeOptions={FOOTBALL_PAGE_SIZE_OPTIONS}
        loading={loading}
        onPrev={() => setPageIndex((i) => Math.max(0, i - 1))}
        onNext={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
        onGoToPage={(page) => setPageIndex(page - 1)}
        onPageSizeChange={onPageSizeChange}
      />
    </YStack>
  );
}

export default FootballStatsDataGrid;

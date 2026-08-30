/**
 * StatsDataGrid — sport-agnostic stats table body (LS-9036).
 *
 * Pure presentational grid: takes already-fetched `rows` + a column contract
 * and renders table chrome, body, and pagination. No GraphQL, no sport
 * knowledge, no data-fetching — each sport's grid (batting/pitching/football)
 * keeps its own data-fetching hook and column config, and delegates all
 * rendering here so there is exactly one row-rendering implementation shared
 * by every sport.
 *
 * Reuses the primitives the three sport grids already shared piecemeal:
 * {@link StatsGridHeaderCell} (sortable header cells), {@link
 * StatsGridPagination} (pager), and {@link LoadingSkeleton}/{@link
 * ErrorCard}/{@link EmptyCard} from `./StateCards`.
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { FONT_BODY, FONT_DISPLAY } from './tokens';
import { EmptyCard, ErrorCard, LoadingSkeleton } from './StateCards';
import { StatsGridHeaderCell } from './StatsGridHeaderCell';
import { StatsGridPagination } from './StatsGridPagination';
import {
  BRAND_NAVY_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';

const SURFACE_HOVER = withAlpha(BRAND_NAVY_LIGHT, 0.12);
const DEFAULT_MIN_WIDTH = 64;

export interface StatsDataGridColumn<TRow> {
  /** Stable key for React lists, test ids, and the default sort key. */
  key: string;
  label: string;
  sortable?: boolean;
  /** GraphQL/server sort field; defaults to `key` when omitted. */
  sortKey?: string;
  /**
   * Direction a click applies when this column is not yet the active sort
   * column (active columns always flip). Omit to use the header cell's
   * default ('desc' — leaders first).
   */
  defaultDirection?: 'asc' | 'desc';
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  minWidth?: number;
  /** Pins the column to the left edge over an opaque backdrop (identity columns). */
  sticky?: boolean;
  /** Rich cell content (badges, sub-labels). Takes precedence over `formatter`. */
  renderCell?: (row: TRow) => React.ReactNode;
  /** Plain-text cell value, used when `renderCell` is not supplied. */
  formatter?: (row: TRow) => string;
  accessibilityLabel?: string;
}

export interface StatsDataGridProps<TRow> {
  testId?: string;
  /**
   * `data-testid`/`testID` for the table body container. Defaults to
   * `${testId}-table`; pass an explicit value to preserve a legacy testid an
   * E2E suite already hardcodes (e.g. football's `"player-list-table"`).
   */
  tableTestId?: string;
  /** Web-only className passthrough for host layout hooks. */
  className?: string;
  title: string;
  subtitle?: string;
  rows: readonly TRow[];
  getRowId: (row: TRow, index: number) => string | number;
  /** Optional per-row `data-testid`/`testID` for host specs that assert on a specific row. */
  getRowTestId?: (row: TRow, index: number) => string;
  columns: readonly StatsDataGridColumn<TRow>[];
  onRowClick?: (row: TRow) => void;

  sortField?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (sortKey: string, dir: 'asc' | 'desc') => void;

  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Overrides the shared ErrorCard's default heading/body copy. */
  errorTitle?: string;
  errorMessage?: string;
  /** Reset-filters action surfaced on the empty-result state, when provided. */
  onClear?: () => void;
  /** Overrides the shared EmptyCard's default heading/body copy. */
  emptyTitle?: string;
  emptyMessage?: string;
  /** Stat-column count for the loading skeleton shimmer rows. */
  loadingColumnCount?: number;

  /** Whether to render the pagination footer. Defaults to true. */
  showPagination?: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function cellJustify(align: StatsDataGridColumn<unknown>['align']) {
  return align === 'center'
    ? 'center'
    : align === 'right'
      ? 'flex-end'
      : 'flex-start';
}

function GridRow<TRow>({
  row,
  columns,
  onSelect,
  testId,
}: {
  row: TRow;
  columns: readonly StatsDataGridColumn<TRow>[];
  onSelect?: (row: TRow) => void;
  testId?: string;
}) {
  return (
    <XStack
      testID={testId}
      role="row"
      cursor={onSelect ? 'pointer' : 'default'}
      borderBottomWidth={1}
      borderColor={OUTLINE_SUBTLE}
      hoverStyle={onSelect ? { backgroundColor: SURFACE_HOVER } : undefined}
      pressStyle={onSelect ? { opacity: 0.85 } : undefined}
      onPress={onSelect ? () => onSelect(row) : undefined}
    >
      {columns.map((column) => (
        <XStack
          key={column.key}
          role="cell"
          width={column.width}
          minWidth={column.minWidth ?? DEFAULT_MIN_WIDTH}
          flexGrow={column.width ? 0 : 1}
          flexShrink={0}
          paddingHorizontal={12}
          paddingVertical={10}
          alignItems="center"
          justifyContent={cellJustify(column.align)}
          gap={6}
          style={
            column.sticky
              ? {
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  background: SURFACE_CARD,
                }
              : undefined
          }
        >
          {column.renderCell ? (
            column.renderCell(row)
          ) : (
            <Text
              fontSize={13}
              fontWeight="600"
              color={TEXT_PRIMARY}
              fontFamily={column.sticky ? FONT_DISPLAY : undefined}
              fontVariant={['tabular-nums']}
              numberOfLines={1}
            >
              {column.formatter ? column.formatter(row) : ''}
            </Text>
          )}
        </XStack>
      ))}
    </XStack>
  );
}

/**
 * Sport-agnostic stats table: title/subtitle, sortable header row, body
 * rows, and pagination footer, driven entirely by `rows` + `columns` (see
 * {@link StatsDataGridProps}). Callers own data-fetching, sorting/paging
 * state, and column definitions; this component only renders what it's
 * given, including its own loading/error/empty fallbacks.
 */
export function StatsDataGrid<TRow>({
  testId = 'stats-data-grid',
  tableTestId,
  className,
  title,
  subtitle,
  rows,
  getRowId,
  getRowTestId,
  columns,
  onRowClick,
  sortField,
  sortDir = 'asc',
  onSortChange,
  loading = false,
  error,
  onRetry,
  errorTitle,
  errorMessage,
  onClear,
  emptyTitle,
  emptyMessage,
  loadingColumnCount = 3,
  showPagination = true,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions,
  hasPreviousPage,
  hasNextPage,
  onPrev,
  onNext,
  onGoToPage,
  onPageSizeChange,
}: StatsDataGridProps<TRow>) {
  if (error && rows.length === 0) {
    return (
      <ErrorCard onRetry={onRetry} title={errorTitle} message={errorMessage} />
    );
  }

  // The header row (and its column labels) stays visible across loading and
  // empty states — only the row body swaps content. Fully replacing the grid
  // with a state card here previously hid the header on every zero-row
  // render (initial load, a filtered-to-empty result), which regressed
  // column-visibility assertions that don't depend on any rows existing.
  const isLoadingBody = loading && rows.length === 0;
  const isEmptyBody = !isLoadingBody && rows.length === 0;

  return (
    <YStack testID={testId} className={className} gap={16}>
      <YStack gap={2}>
        <Text
          fontSize={20}
          fontWeight="700"
          color={TEXT_PRIMARY}
          fontFamily={FONT_DISPLAY}
        >
          {title}
        </Text>
        {subtitle && (
          <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            {subtitle}
          </Text>
        )}
      </YStack>

      <YStack
        testID={tableTestId ?? `${testId}-table`}
        role="table"
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={OUTLINE_SUBTLE}
        borderRadius={10}
        overflow="hidden"
      >
        {/* Horizontal scroll wrapper keeps the header aligned with body rows
            when stat columns overflow the viewport (mobile). */}
        <YStack style={{ overflowX: 'auto' }}>
          <XStack
            role="rowgroup"
            backgroundColor={SURFACE_PANEL}
            borderBottomWidth={1}
            borderColor={OUTLINE_SUBTLE}
            style={{ minWidth: 'max-content' }}
          >
            {columns.map((column) => {
              const columnSortKey = column.sortKey ?? column.key;
              return (
                <StatsGridHeaderCell
                  key={column.key}
                  label={column.label}
                  sortable={column.sortable}
                  isActive={
                    Boolean(column.sortable) && sortField === columnSortKey
                  }
                  direction={sortDir}
                  defaultDirection={column.defaultDirection}
                  onSort={
                    column.sortable && onSortChange
                      ? (dir) => onSortChange(columnSortKey, dir)
                      : undefined
                  }
                  align={column.align}
                  width={column.width}
                  minWidth={column.minWidth ?? DEFAULT_MIN_WIDTH}
                  flexGrow={column.width ? 0 : 1}
                  sticky={column.sticky}
                  accessibilityLabel={column.accessibilityLabel}
                />
              );
            })}
          </XStack>

          {isLoadingBody ? (
            <LoadingSkeleton columnCount={loadingColumnCount} />
          ) : isEmptyBody ? (
            <EmptyCard
              onClear={onClear}
              title={emptyTitle}
              message={emptyMessage}
            />
          ) : (
            <YStack role="rowgroup" style={{ minWidth: 'max-content' }}>
              {rows.map((row, index) => (
                <GridRow
                  key={getRowId(row, index)}
                  row={row}
                  columns={columns}
                  onSelect={onRowClick}
                  testId={getRowTestId?.(row, index)}
                />
              ))}
            </YStack>
          )}
        </YStack>
      </YStack>

      {showPagination && (
        <StatsGridPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          loading={loading}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          onPrev={onPrev}
          onNext={onNext}
          onGoToPage={onGoToPage}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </YStack>
  );
}

export default StatsDataGrid;

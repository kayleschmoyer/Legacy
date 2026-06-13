import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Button, Input, Spinner, Text, YStack } from 'tamagui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FlatList, InteractionManager } from 'react-native';
import { Platform } from '../../platform-components';
import { handleError } from '../../utils/ErrorHandler';
import {
  expandMlbFranchiseAbbrs,
  expandNflFranchiseAbbrs,
  MLB_TEAMS,
  NFL_FRANCHISES,
} from '../../constants/teams';

// LS-5703 — Game logs virtualization + pagination.
//
// Prior behavior: page-level <ScrollView> wrapped the entire form + table, the
// full season payload was reshaped synchronously on the main thread, and every
// row was rendered eagerly. A 162-game MLB season produces ~5000 cells; a
// 1000-game career view jammed the page on low-end Android.
//
// Now:
//   - LS-7470 row virtualization (react-virtual on web, FlatList on native).
//   - LS-7471 outer ScrollView removed — only the table virtualizes.
//   - LS-7472 reshape deferred via requestIdleCallback / InteractionManager.
//   - LS-7473 server pagination (limit/offset/total).
//   - LS-7475 infinite scroll @ 80% with a 1000-row render cap + Load all.

/** Em-dash used to disambiguate "no value" from a real zero stat. (LS-7461) */
const EM_DASH = '—';

/** Cell values returned from the stats API. `null` / `undefined` / `''` are
 *  "missing" and rendered as em-dash; a real `0` is preserved. (LS-7461) */
type CellValue = string | number | null | undefined;

function renderCell(cell: CellValue): string | number {
  if (cell === null || cell === undefined) return EM_DASH;
  if (typeof cell === 'string' && cell.trim() === '') return EM_DASH;
  return cell;
}

const DEFAULT_PAGE_SIZE = 50;
const INFINITE_SCROLL_THRESHOLD = 0.8;
const RENDER_CAP = 1000;
const ROW_HEIGHT_PX = 36;
const SCROLLER_HEIGHT_PX = 480;
const MIN_TABLE_WIDTH_PX = 600;

// requestIdleCallback shim — Safari and Jest don't ship it.
type IdleHandle = number;
function scheduleIdle(fn: () => void): IdleHandle {
  if (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { requestIdleCallback?: unknown })
      .requestIdleCallback === 'function'
  ) {
    return (
      window as unknown as { requestIdleCallback: (cb: () => void) => number }
    ).requestIdleCallback(fn);
  }
  return setTimeout(fn, 0) as unknown as number;
}
function cancelIdle(h: IdleHandle | null): void {
  if (h == null) return;
  if (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { cancelIdleCallback?: unknown })
      .cancelIdleCallback === 'function'
  ) {
    (
      window as unknown as { cancelIdleCallback: (h: number) => void }
    ).cancelIdleCallback(h);
    return;
  }
  clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
}

// ---------------------------------------------------------------------------
// Filter state machine (LS-7466).
//
// Single useReducer so this PR's opponent + home/away filters, the LS-5700
// date range chip (second-to-merge rebases onto this shape), and any future
// filter (LS-7463 advanced stats, LS-7464 column customization) flow through
// one shape. The dispatched-action surface keeps each control's wiring small
// and makes the API payload obvious from buildGameLogsRequestBody.
// ---------------------------------------------------------------------------

export type GameLogSport = 'mlb' | 'nfl';
export type Venue = 'all' | 'home' | 'away';

export interface FilterState {
  player: string;
  date: string;
  opponentFranchiseIds: string[];
  venue: Venue;
}

type FilterAction =
  | { type: 'setPlayer'; value: string }
  | { type: 'setDate'; value: string }
  | { type: 'setOpponents'; value: string[] }
  | { type: 'setVenue'; value: Venue }
  | { type: 'reset' };

const INITIAL_FILTERS: FilterState = {
  player: '',
  date: '',
  opponentFranchiseIds: [],
  venue: 'all',
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setPlayer':
      return { ...state, player: action.value };
    case 'setDate':
      return { ...state, date: action.value };
    case 'setOpponents':
      return { ...state, opponentFranchiseIds: action.value };
    case 'setVenue':
      return { ...state, venue: action.value };
    case 'reset':
      return INITIAL_FILTERS;
  }
}

/**
 * Shape the POST body for `/baseball-game-logs`. Exported so unit tests can
 * assert opponent expansion + venue serialization without mocking fetch.
 * (LS-7466, LS-7478)
 */
export function buildGameLogsRequestBody(
  filters: FilterState,
  sport: GameLogSport,
): {
  player_id: string;
  game_date: string;
  opponent_franchise_ids?: string[];
  opponent_abbrs?: string[];
  venue?: 'home' | 'away';
} {
  const expand =
    sport === 'nfl' ? expandNflFranchiseAbbrs : expandMlbFranchiseAbbrs;

  // Relocations (LS-7478): the franchise id is the stable key but historical
  // game logs were stored under the old abbreviation. Expand to every abbr
  // the franchise has ever used so the resolver finds OAK + LV rows for the
  // Athletics, MTL + WSH + WAS rows for the Nationals, etc. Sent alongside
  // the franchise ids so a future resolver can prefer ids and the existing
  // resolver keeps working unchanged.
  const opponentAbbrs = filters.opponentFranchiseIds.flatMap(expand);

  return {
    player_id: filters.player,
    game_date: filters.date,
    ...(filters.opponentFranchiseIds.length > 0
      ? {
          opponent_franchise_ids: filters.opponentFranchiseIds,
          opponent_abbrs: opponentAbbrs,
        }
      : {}),
    ...(filters.venue !== 'all' ? { venue: filters.venue } : {}),
  };
}

// Strict format guards applied before sending to the API (defense-in-depth;
// backend must still use parameterized queries — see LS-5704 follow-up).
const PLAYER_ID_RE = /^[\w-]+$/; // alphanumeric, hyphens, underscores

export interface GameLogsTableProps {
  /**
   * API endpoint for fetching game logs.
   *
   * When omitted, falls back to a localhost dev URL. Production builds wire
   * this from build-time env (`VITE_STATS_API_URL` on web,
   * `EXPO_PUBLIC_STATS_API_URL` on native).
   */
  apiEndpoint?: string;
  /**
   * Drives which team list populates the opponent dropdown. The component is
   * sport-agnostic at the UI level; callers pass the sport appropriate to the
   * player being viewed. Defaults to 'mlb' since this is the baseball stats
   * viewer today; NFL is wired so it lights up the moment the football game
   * logs page mounts the component. (LS-7477)
   */
  sport?: GameLogSport;
  /**
   * When true the opponent filter renders as a multi-select so a premium user
   * can compare against a custom set (e.g. all AL East teams). Free users see
   * a single-select. The component never reads premium status itself — that
   * keeps shared-components free of web-only hooks; the app passes it in.
   * (LS-7480, LS-7469)
   */
  isPremium?: boolean;
  /**
   * Pre-seed the player-ID filter on mount. Useful when embedding the table
   * inside a player detail page where the ID is already known (LS-6231). The
   * field remains editable so the user can look up a different player without
   * leaving the page.
   */
  initialPlayerId?: string;
  /** Page size hint for the server. */
  pageSize?: number;
}

const DEFAULT_ENDPOINT = 'http://localhost:5000/baseball-game-logs';

interface DateRangeValidation {
  error: string | null;
  ready: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? d : null;
}

function todayIsoEt(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function validateDateRange(
  startDate: string,
  endDate: string,
  today: string = todayIsoEt(),
): DateRangeValidation {
  const hasStart = startDate.trim() !== '';
  const hasEnd = endDate.trim() !== '';

  if (!hasStart && !hasEnd) return { error: null, ready: true };

  if (hasStart) {
    const todayDate = parseIsoDate(today);
    const start = parseIsoDate(startDate);
    if (start && todayDate && start.getTime() > todayDate.getTime()) {
      return { error: 'Start date cannot be in the future', ready: false };
    }
  }

  if (hasStart !== hasEnd) {
    return { error: 'Please enter both a start and end date.', ready: false };
  }

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) {
    return {
      error: 'Use the date picker — dates must be valid.',
      ready: false,
    };
  }

  if (start.getTime() > end.getTime()) {
    return { error: 'Start date must be on or before end date.', ready: false };
  }

  const todayDate = parseIsoDate(today);
  if (todayDate && end.getTime() > todayDate.getTime()) {
    return { error: 'End date cannot be in the future.', ready: false };
  }

  return { error: null, ready: true };
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
  min?: string;
  disabled?: boolean;
  testID?: string;
}
const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  max,
  min,
  disabled,
  testID,
}) => {
  if (Platform.OS === 'web') {
    return (
      <YStack marginBottom="$3" flex={1}>
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          {label}
        </Text>
        <input
          type="date"
          aria-label={label}
          data-testid={testID}
          value={value}
          max={max}
          min={min}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: 12,
            fontSize: 16,
            border: '1px solid #999',
            borderRadius: 6,
            backgroundColor: disabled ? '#f0f0f0' : '#fff',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </YStack>
    );
  }
  return (
    <YStack marginBottom="$3" flex={1}>
      <Text fontSize="$4" fontWeight="600" marginBottom="$2">
        {label}
      </Text>
      <Input
        borderWidth={1}
        borderColor="$gray8"
        borderRadius="$3"
        padding="$3"
        fontSize="$4"
        backgroundColor="$white"
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        editable={!disabled}
        testID={testID}
        accessibilityLabel={label}
      />
    </YStack>
  );
};

type ServerLegacy = Record<string, Record<string, string | number>>;
interface ServerPaginated {
  stats: string[];
  rows: Array<Record<string, CellValue> & { gameId: string }>;
  total?: number;
}

function isPaginated(payload: unknown): payload is ServerPaginated {
  if (payload == null || typeof payload !== 'object') return false;
  const p = payload as Partial<ServerPaginated>;
  return Array.isArray(p.stats) && Array.isArray(p.rows);
}

interface ReshapedPage {
  stats: string[];
  rows: Array<{ gameId: string; cells: CellValue[] }>;
  total: number | null;
}

/**
 * Reshape a server payload (legacy `{[stat]: {[gameId]: value}}` or paginated
 * `{stats, rows, total}`) into row-oriented form. Pure — safe to defer to an
 * idle callback or `runAfterInteractions`. (LS-7472)
 */
export function reshapeGameLogs(
  payload: ServerLegacy | ServerPaginated,
  existingStats: string[] = [],
): ReshapedPage {
  if (isPaginated(payload)) {
    const stats = payload.stats.length > 0 ? payload.stats : existingStats;
    const rows = payload.rows.map((r) => ({
      gameId: String(r.gameId),
      cells: stats.map((s) => (s in r ? r[s] : null)),
    }));
    return {
      stats,
      rows,
      total: typeof payload.total === 'number' ? payload.total : null,
    };
  }
  const statKeys = Object.keys(payload);
  const stats = statKeys.length > 0 ? statKeys : existingStats;
  const byGame: Record<string, Record<string, CellValue>> = {};
  for (const stat of statKeys) {
    const col = payload[stat];
    for (const gameId of Object.keys(col)) {
      if (!byGame[gameId]) byGame[gameId] = {};
      byGame[gameId][stat] = col[gameId];
    }
  }
  const rows = Object.keys(byGame).map((gameId) => ({
    gameId,
    cells: stats.map((s) => byGame[gameId][s] ?? null),
  }));
  return { stats, rows, total: rows.length };
}

interface VirtualBodyProps {
  stats: string[];
  rows: Array<{ gameId: string; cells: CellValue[] }>;
  hasMore: boolean;
  loadingMore: boolean;
  onEndReached: () => void;
}

const VirtualBodyWeb: React.FC<VirtualBodyProps> = ({
  stats,
  rows,
  hasMore,
  loadingMore,
  onEndReached,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = rows.length + (hasMore || loadingMore ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8,
  });

  const items = virtualizer.getVirtualItems();
  const lastItem = items[items.length - 1];
  useEffect(() => {
    if (!hasMore || loadingMore) return;
    if (!lastItem) return;
    if (lastItem.index >= rows.length * INFINITE_SCROLL_THRESHOLD) {
      onEndReached();
    }
  }, [lastItem, rows.length, hasMore, loadingMore, onEndReached]);

  const colWidth = `${100 / Math.max(stats.length, 1)}%`;

  return (
    <div
      ref={parentRef}
      data-testid="game-logs-virtual-scroller"
      style={{
        height: SCROLLER_HEIGHT_PX,
        overflow: 'auto',
        border: '1px solid #ddd',
      }}
    >
      <div style={{ minWidth: MIN_TABLE_WIDTH_PX }}>
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #ddd',
          }}
        >
          {stats.map((h) => (
            <div
              key={h}
              style={{
                flexBasis: colWidth,
                flexGrow: 1,
                padding: 8,
                fontWeight: 600,
                fontSize: 14,
                borderRight: '1px solid #ddd',
              }}
            >
              {h}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'relative',
            height: virtualizer.getTotalSize(),
          }}
        >
          {items.map((vi) => {
            const isSentinel = vi.index >= rows.length;
            const row = isSentinel ? null : rows[vi.index];
            return (
              <div
                key={
                  isSentinel
                    ? `sentinel-${vi.index}`
                    : (row?.gameId ?? vi.index)
                }
                data-testid={
                  isSentinel
                    ? 'game-logs-loading-more'
                    : row
                      ? `game-logs-row-${row.gameId}`
                      : undefined
                }
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                  height: ROW_HEIGHT_PX,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid #eee',
                }}
              >
                {isSentinel ? (
                  <div
                    style={{
                      padding: 8,
                      fontStyle: 'italic',
                      color: '#666',
                    }}
                  >
                    Loading more games…
                  </div>
                ) : (
                  (row?.cells ?? []).map((cell, i) => (
                    <div
                      key={i}
                      style={{
                        flexBasis: colWidth,
                        flexGrow: 1,
                        padding: '0 8px',
                        fontSize: 14,
                        borderRight: '1px solid #eee',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {renderCell(cell)}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const VirtualBodyNative: React.FC<VirtualBodyProps> = ({
  stats,
  rows,
  hasMore,
  loadingMore,
  onEndReached,
}) => (
  <FlatList
    data={rows}
    keyExtractor={(r) => r.gameId}
    windowSize={10}
    removeClippedSubviews
    initialNumToRender={20}
    maxToRenderPerBatch={20}
    onEndReachedThreshold={1 - INFINITE_SCROLL_THRESHOLD}
    onEndReached={() => {
      if (hasMore && !loadingMore) onEndReached();
    }}
    ListHeaderComponent={
      <YStack flexDirection="row" backgroundColor="$gray3" paddingVertical="$2">
        {stats.map((h) => (
          <Text key={h} flex={1} fontWeight="600" paddingHorizontal="$2">
            {h}
          </Text>
        ))}
      </YStack>
    }
    stickyHeaderIndices={[0]}
    ListFooterComponent={
      hasMore || loadingMore ? (
        <YStack padding="$3" alignItems="center">
          <Text color="$gray10" fontStyle="italic">
            Loading more games…
          </Text>
        </YStack>
      ) : null
    }
    renderItem={({ item }) => (
      <YStack
        flexDirection="row"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor="$gray5"
      >
        {item.cells.map((cell, i) => (
          <Text key={i} flex={1} paddingHorizontal="$2">
            {renderCell(cell)}
          </Text>
        ))}
      </YStack>
    )}
  />
);

const VirtualBody: React.FC<VirtualBodyProps> = (props) =>
  Platform.OS === 'web' ? (
    <VirtualBodyWeb {...props} />
  ) : (
    <VirtualBodyNative {...props} />
  );

function GameLogsTable({
  apiEndpoint = DEFAULT_ENDPOINT,
  sport = 'mlb',
  isPremium = false,
  initialPlayerId = '',
  pageSize = DEFAULT_PAGE_SIZE,
}: GameLogsTableProps) {
  const [filters, dispatch] = useReducer(filterReducer, {
    ...INITIAL_FILTERS,
    player: initialPlayerId,
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);

  const [stats, setStats] = useState<string[]>([]);
  const [rows, setRows] = useState<
    Array<{ gameId: string; cells: CellValue[] }>
  >([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const today = useMemo(() => todayIsoEt(), []);
  const validation = useMemo(
    () => validateDateRange(startDate, endDate, today),
    [startDate, endDate, today],
  );
  const submitDisabled = loading || !validation.ready;
  const hitCap = !showAll && rows.length >= RENDER_CAP;
  const hasMore = !hitCap && total != null && rows.length < total;

  const teamOptions = useMemo(() => {
    if (sport === 'nfl') {
      return NFL_FRANCHISES.map((t) => ({
        id: t.franchiseId,
        label: `${t.currentAbbr} — ${t.currentName}`,
      }));
    }
    return MLB_TEAMS.map((t) => ({
      id: t.franchiseId,
      label: `${t.currentAbbr} — ${t.currentName}`,
    }));
  }, [sport]);

  const onOpponentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isPremium) {
      const selected = Array.from(
        e.target.selectedOptions,
        (o) => o.value,
      ).filter(Boolean);
      dispatch({ type: 'setOpponents', value: selected });
    } else {
      dispatch({
        type: 'setOpponents',
        value: e.target.value ? [e.target.value] : [],
      });
    }
  };

  // LS-7472 — heavy reshape is queued and run on idle to keep paint smooth.
  const pendingPayloadRef = useRef<{
    payload: ServerLegacy | ServerPaginated;
    append: boolean;
  } | null>(null);
  const [reshapeTick, setReshapeTick] = useState(0);

  useEffect(() => {
    if (reshapeTick === 0) return;
    const pending = pendingPayloadRef.current;
    if (!pending) return;

    let idle: IdleHandle | null = null;
    let interactionHandle: { cancel: () => void } | null = null;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const shaped = reshapeGameLogs(pending.payload, stats);
      pendingPayloadRef.current = null;
      setStats((prev) => (shaped.stats.length > 0 ? shaped.stats : prev));
      setRows((prev) =>
        pending.append ? [...prev, ...shaped.rows] : shaped.rows,
      );
      if (shaped.total != null) {
        setTotal((prev) =>
          pending.append && prev != null ? prev : shaped.total,
        );
      } else if (!pending.append) {
        setTotal(null);
      }
      setLoading(false);
      setLoadingMore(false);
    };

    if (Platform.OS === 'web') {
      idle = scheduleIdle(run);
    } else {
      interactionHandle = InteractionManager.runAfterInteractions(run);
    }

    return () => {
      cancelled = true;
      if (idle != null) cancelIdle(idle);
      if (interactionHandle) interactionHandle.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by reshapeTick
  }, [reshapeTick]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const expand =
          sport === 'nfl' ? expandNflFranchiseAbbrs : expandMlbFranchiseAbbrs;
        const opponentAbbrs = filters.opponentFranchiseIds.flatMap(expand);
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_id: filters.player,
            ...(startDate ? { start_date: startDate } : {}),
            ...(endDate ? { end_date: endDate } : {}),
            ...(filters.opponentFranchiseIds.length > 0
              ? {
                  opponent_franchise_ids: filters.opponentFranchiseIds,
                  opponent_abbrs: opponentAbbrs,
                }
              : {}),
            ...(filters.venue !== 'all' ? { venue: filters.venue } : {}),
            // LS-7473 — legacy endpoint ignores these; the new endpoint paginates.
            limit: pageSize,
            offset: nextOffset,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- response.json() is any
        const payload: ServerLegacy | ServerPaginated = await response.json();
        pendingPayloadRef.current = { payload, append };
        setOffset(nextOffset + pageSize);
        setReshapeTick((t) => t + 1);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        handleError(error);
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [apiEndpoint, filters, sport, startDate, endDate, pageSize],
  );

  const getGameLog = useCallback(async () => {
    setInputError(null);
    const trimmedPlayer = filters.player.trim();
    if (!trimmedPlayer) {
      setInputError('Please enter a player ID');
      return;
    }
    if (!PLAYER_ID_RE.test(trimmedPlayer)) {
      setInputError(
        'Player ID may only contain letters, numbers, hyphens, and underscores',
      );
      return;
    }
    if (!validation.ready) return;
    setRows([]);
    setStats([]);
    setTotal(null);
    setOffset(0);
    setShowAll(false);
    await fetchPage(0, false);
  }, [filters.player, validation.ready, fetchPage]);

  const handleEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void fetchPage(offset, true);
  }, [hasMore, loadingMore, loading, offset, fetchPage]);

  const showingCount = rows.length;
  const totalLabel =
    total != null ? `Showing ${showingCount} of ${total}` : null;

  return (
    // LS-7471 — outer ScrollView removed. Form is non-scrolling; the
    // virtualized table body is the only scroll container.
    <YStack flex={1} padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold"
        marginBottom="$4"
        textAlign="center"
      >
        Retrieve stats for a player
      </Text>

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Player ID:
        </Text>
        <Input
          borderWidth={1}
          borderColor="$gray8"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$white"
          value={filters.player}
          onChangeText={(v: string) =>
            dispatch({ type: 'setPlayer', value: v })
          }
          placeholder="Enter player ID"
          editable={!loading}
        />
      </YStack>

      <YStack marginBottom="$2">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Date range (optional):
        </Text>
        <DateField
          label="Start date"
          value={startDate}
          onChange={setStartDate}
          max={endDate || today}
          disabled={loading}
          testID="game-logs-start-date"
        />
        <DateField
          label="End date"
          value={endDate}
          onChange={setEndDate}
          min={startDate || undefined}
          max={today}
          disabled={loading}
          testID="game-logs-end-date"
        />
        <Text fontSize="$2" color="$gray10" marginBottom="$2">
          Dates are interpreted as Eastern Time (matches MLB game-date
          attribution).
        </Text>
        {validation.error ? (
          <Text fontSize="$3" color="$red10" marginBottom="$2" role="alert">
            {validation.error}
          </Text>
        ) : null}
      </YStack>

      {/* Opponent filter (LS-7476/77/80). Native renders nothing here today —
          a follow-up will add a cross-platform picker; meanwhile native users
          keep the player + date set without an opponent restriction. */}
      {Platform.OS === 'web' ? (
        <YStack marginBottom="$4">
          <Text fontSize="$4" fontWeight="600" marginBottom="$2">
            Opponent{isPremium ? ' (hold Ctrl/Cmd to select multiple)' : ''}:
          </Text>
          <select
            data-testid="opponent-filter"
            aria-label="Opponent"
            multiple={isPremium}
            value={
              isPremium
                ? filters.opponentFranchiseIds
                : (filters.opponentFranchiseIds[0] ?? '')
            }
            onChange={onOpponentChange}
            disabled={loading}
            style={{
              padding: 8,
              fontSize: 16,
              borderRadius: 4,
              border: '1px solid #ccc',
              minHeight: isPremium ? 120 : undefined,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {!isPremium ? <option value="">All opponents</option> : null}
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </YStack>
      ) : null}

      {/* Home/Away tri-state (LS-7465). Buttons rather than radio so the
          control styles consistently across web + native via tamagui. */}
      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Venue:
        </Text>
        <YStack flexDirection="row" gap="$2">
          {(['all', 'home', 'away'] as const).map((v) => (
            <Button
              key={v}
              data-testid={`venue-${v}`}
              backgroundColor={filters.venue === v ? '$blue10' : '$gray4'}
              onPress={() => dispatch({ type: 'setVenue', value: v })}
              disabled={loading}
              paddingHorizontal="$4"
              paddingVertical="$2"
            >
              <Text
                color={filters.venue === v ? '$white' : '$gray12'}
                fontWeight="600"
              >
                {v === 'all' ? 'All' : v === 'home' ? 'Home' : 'Away'}
              </Text>
            </Button>
          ))}
        </YStack>
      </YStack>

      <Button
        backgroundColor={submitDisabled ? '$gray8' : '$blue10'}
        paddingVertical="$3"
        paddingHorizontal="$6"
        borderRadius="$3"
        alignItems="center"
        marginBottom="$4"
        onPress={() => void getGameLog()}
        disabled={submitDisabled}
        opacity={submitDisabled ? 0.5 : 1}
      >
        {loading ? (
          <Spinner size="small" color="$white" />
        ) : (
          <Text color="$white" fontSize="$4" fontWeight="600">
            Get Player Data
          </Text>
        )}
      </Button>

      {inputError ? (
        <Text color="$red10" fontSize="$3" marginBottom="$4" role="alert">
          {inputError}
        </Text>
      ) : null}

      {rows.length > 0 && stats.length > 0 ? (
        <YStack flex={1} marginTop="$2">
          {totalLabel ? (
            <Text
              fontSize="$3"
              color="$gray10"
              marginBottom="$2"
              data-testid="game-logs-total-label"
            >
              {totalLabel}
            </Text>
          ) : null}
          <VirtualBody
            stats={stats}
            rows={rows}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onEndReached={handleEndReached}
          />
          {hitCap ? (
            <YStack marginTop="$3" alignItems="center">
              <Text fontSize="$3" color="$gray10" marginBottom="$2">
                Rendering capped at {RENDER_CAP} rows for performance.
              </Text>
              <Button
                onPress={() => {
                  setShowAll(true);
                  if (
                    total != null &&
                    rows.length < total &&
                    !loadingMore &&
                    !loading
                  ) {
                    void fetchPage(offset, true);
                  }
                }}
                testID="game-logs-load-all"
              >
                <Text>Load all {total ?? ''} rows</Text>
              </Button>
            </YStack>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}

export { GameLogsTable };
export default GameLogsTable;

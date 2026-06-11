import { useVirtualizer } from '@tanstack/react-virtual';
import React, {
  startTransition,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Input,
  ScrollView,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { Platform, Table } from '../../platform-components';
import { Select as OpponentSelect } from '../../components/Select';
import { handleError } from '../../utils/ErrorHandler';
import {
  expandMlbFranchiseAbbrs,
  expandNflFranchiseAbbrs,
  MLB_TEAMS,
  NFL_FRANCHISES,
} from '../../constants/teams';

// Platform-agnostic React components (no React Native imports)
// Using CSS-in-JS for styling instead of StyleSheet

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

// Cross-platform table implementation
interface TableProps {
  headers: string[];
  data: Array<Array<CellValue>>;
  title?: string;
  /**
   * Stable identifier per row (e.g. gameId). Used as React key so that
   * sort/filter changes don't cause reconciliation churn — the wrong rows
   * keep their internal state if we use the array index. (LS-7460)
   */
  rowKeys?: string[];
}

/**
 * Activate row virtualization once the result set crosses this threshold.
 * Below it the DOM is small enough that virtualizing adds no value. (LS-7475)
 */
export const VIRTUAL_ROW_THRESHOLD = 100;

/** Visible height (px) of the scroll window when virtualization is active. */
const VIRTUAL_CONTAINER_HEIGHT = 600;

/** Pixel height used by the virtualizer to estimate each row before measuring. */
const ESTIMATED_ROW_HEIGHT = 37;

const CrossPlatformTable: React.FC<TableProps> = ({
  headers,
  data,
  title,
  rowKeys,
}) => {
  // Ref for the scrollable container. Attached to the DOM element only when
  // virtualization is active; the virtualizer reads scroll position from it.
  const scrollRef = useRef<HTMLDivElement>(null);

  // Always call the hook (rules-of-hooks). The virtualizer is inactive when
  // the container ref is null (i.e. for small datasets or native), so it
  // computes zero virtual items without side effects.
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
  });

  if (Platform.OS === 'web') {
    // LS-7475 — virtualise rows for large (premium career) result sets so that
    // only the rows in the viewport are in the DOM, keeping rendering O(1) with
    // respect to career length.
    const shouldVirtualize = data.length > VIRTUAL_ROW_THRESHOLD;

    const virtualItems = shouldVirtualize
      ? rowVirtualizer.getVirtualItems()
      : null;
    const totalVirtualSize = rowVirtualizer.getTotalSize();

    const firstVirtual =
      virtualItems !== null && virtualItems.length > 0
        ? virtualItems[0]
        : undefined;
    const lastVirtual =
      virtualItems !== null && virtualItems.length > 0
        ? virtualItems[virtualItems.length - 1]
        : undefined;

    // Padding rows stand in for the off-screen rows so the scrollbar reflects
    // the true total height without rendering every <tr>. (LS-7475)
    const paddingTop = firstVirtual !== undefined ? firstVirtual.start : 0;
    const paddingBottom =
      lastVirtual !== undefined ? totalVirtualSize - lastVirtual.end : 0;

    // Indices of rows to render: all of them when small, virtual slice when large.
    const rowIndices: number[] =
      virtualItems !== null
        ? virtualItems.map((vi) => vi.index)
        : data.map((_, i) => i);

    return (
      <div
        // LS-7459 — wrap the table in a horizontally-scrollable container so
        // wide stat tables don't overflow the viewport on narrow screens.
        // `minWidth` on the inner table keeps columns from collapsing.
        // LS-7475 — also the vertical scroll anchor for the virtualizer when
        // shouldVirtualize is true.
        ref={shouldVirtualize ? scrollRef : undefined}
        style={{
          overflowX: 'auto',
          maxWidth: '100%',
          marginTop: 16,
          ...(shouldVirtualize
            ? { overflowY: 'auto', maxHeight: VIRTUAL_CONTAINER_HEIGHT }
            : {}),
        }}
      >
        <table
          style={{
            width: '100%',
            minWidth: 600,
            borderCollapse: 'collapse',
          }}
        >
          <thead
            // LS-7458 — keep column labels in view as the user scrolls a
            // 162-game MLB season. `position: sticky` resolves against the
            // nearest scrollable ancestor (the page's outer ScrollView).
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              backgroundColor: '#f5f5f5',
            }}
          >
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: 8,
                    border: '1px solid #ddd',
                    backgroundColor: '#f5f5f5',
                    textAlign: 'left',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Top spacer row — represents the off-screen rows above the viewport */}
            {paddingTop > 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  style={{ height: paddingTop, padding: 0, border: 'none' }}
                />
              </tr>
            ) : null}
            {rowIndices.map((rowIndex) => {
              const row = data[rowIndex];
              return (
                // LS-7460 — prefer the explicit row key (e.g. gameId) so React
                // re-uses the right <tr> across sort/filter changes.
                <tr key={rowKeys?.[rowIndex] ?? rowIndex}>
                  {(row ?? []).map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      style={{
                        padding: 8,
                        border: '1px solid #ddd',
                      }}
                    >
                      {renderCell(cell)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {/* Bottom spacer row — represents the off-screen rows below the viewport */}
            {paddingBottom > 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  style={{ height: paddingBottom, padding: 0, border: 'none' }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  }

  // React Native implementation — normalize empty cells the same way so the
  // em-dash treatment is consistent across web + native. (LS-7461)
  const normalizedData = data.map((row) => row.map(renderCell));
  return <Table headers={headers} data={normalizedData} title={title} />;
};

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
  dateFrom: string;
  dateTo: string;
  opponentFranchiseIds: string[];
  venue: Venue;
}

type FilterAction =
  | { type: 'setPlayer'; value: string }
  | { type: 'setDateFrom'; value: string }
  | { type: 'setDateTo'; value: string }
  | { type: 'setOpponents'; value: string[] }
  | { type: 'setVenue'; value: Venue }
  | { type: 'reset' };

const INITIAL_FILTERS: FilterState = {
  player: '',
  dateFrom: '',
  dateTo: '',
  opponentFranchiseIds: [],
  venue: 'all',
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setPlayer':
      return { ...state, player: action.value };
    case 'setDateFrom':
      return { ...state, dateFrom: action.value };
    case 'setDateTo':
      return { ...state, dateTo: action.value };
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
 * (LS-7466, LS-7473, LS-7478)
 */
export function buildGameLogsRequestBody(
  filters: FilterState,
  sport: GameLogSport,
  options?: { limit?: number },
): {
  player_id: string;
  game_date_from?: string;
  game_date_to?: string;
  opponent_franchise_ids?: string[];
  opponent_abbrs?: string[];
  venue?: 'home' | 'away';
  limit?: number;
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
    ...(filters.dateFrom ? { game_date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { game_date_to: filters.dateTo } : {}),
    ...(filters.opponentFranchiseIds.length > 0
      ? {
          opponent_franchise_ids: filters.opponentFranchiseIds,
          opponent_abbrs: opponentAbbrs,
        }
      : {}),
    ...(filters.venue !== 'all' ? { venue: filters.venue } : {}),
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
  };
}

/** Maximum game logs returned per request for non-premium users (LS-7473). */
export const DEFAULT_GAME_LOGS_LIMIT = 50;

// Strict format guards applied before sending to the API (defense-in-depth;
// backend must still use parameterized queries — see LS-5704 follow-up).
const PLAYER_ID_RE = /^[\w-]+$/; // alphanumeric, hyphens, underscores
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export interface GameLogsTableProps {
  /**
   * API endpoint for fetching game logs.
   *
   * When omitted, the endpoint is resolved from `VITE_STATS_API_URL` (web) or
   * `EXPO_PUBLIC_STATS_API_URL` (native). In a production build the resolver
   * REFUSES to fall back to localhost — see {@link resolveStatsApiEndpoint}
   * and the wire-up note above it. (LS-7691)
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
}

// React Native injects `__DEV__` globally; on web it is defined via Vite's
// `define` block. May be undefined under Jest, so we treat that as "not prod".
declare const __DEV__: boolean | undefined;

const LOCALHOST_RE = /(?:localhost|127\.0\.0\.1)/;
const DEV_FALLBACK_URL = 'http://localhost:5000/baseball-game-logs';
const LOCALHOST_BUILD_HINT =
  'This typically means VITE_STATS_API_URL was not injected at build time.';

/**
 * Resolve the stats API endpoint at component mount.
 *
 * Production wire-up (must be set per build target — otherwise this throws
 * in prod):
 *   - Web (Vite): `VITE_STATS_API_URL` in the workspace `.env` consumed by
 *     `apps/web/vite.config.mts` (envDir points at the repo root). Vite reads
 *     it via `import.meta.env` in `lib/app-config/src/lib/config.web.ts`; for
 *     this shared component we read `process.env.VITE_STATS_API_URL`, which
 *     Vite replaces at build time alongside `import.meta.env.VITE_*`.
 *   - Native (Expo): `EXPO_PUBLIC_STATS_API_URL` in `apps/app/.env`, picked up
 *     by `babel-preset-expo` (see `lib/app-config/src/lib/statsApiUrl.ts` and
 *     the LS-6402 RFC). The native screens use that helper directly.
 *
 * Mirrors the native-side `resolveStatsApiUrl` pattern (LS-6402): refuse the
 * localhost fallback in release builds so a misconfigured deploy fails loudly
 * instead of silently rendering an empty table. (LS-7691, same bug class as
 * LS-7585 / Google Sign-In redirect loop.)
 */
export function resolveStatsApiEndpoint(): string {
  const fromEnv = process.env.VITE_STATS_API_URL;
  const candidate = fromEnv && fromEnv.length > 0 ? fromEnv : DEV_FALLBACK_URL;
  const isProd =
    typeof __DEV__ !== 'undefined'
      ? __DEV__ === false
      : process.env.NODE_ENV === 'production';
  if (isProd && LOCALHOST_RE.test(candidate)) {
    throw new Error(
      'VITE_STATS_API_URL is not configured for this build. Set it in eas.json / vite config before deploying.',
    );
  }
  return candidate;
}

function GameLogsTable({
  apiEndpoint,
  sport = 'mlb',
  isPremium = false,
}: GameLogsTableProps) {
  // Resolve once per mount. If we're in a production build and the env var
  // is unset (or pinned to localhost), this throws — we render an error state
  // instead of attempting the fetch. (LS-7691)
  const resolution = useMemo<{
    url: string | null;
    error: Error | null;
  }>(() => {
    try {
      return { url: apiEndpoint ?? resolveStatsApiEndpoint(), error: null };
    } catch (err) {
      return {
        url: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [apiEndpoint]);
  if (resolution.error) {
    handleError(resolution.error);
  }
  const resolvedEndpoint = resolution.url;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [filters, dispatch] = useReducer(filterReducer, INITIAL_FILTERS);
  // Store the raw server payload (stat → gameNum → value). The O(stats*games)
  // reshape is done lazily in useMemo below so the fetch callback never blocks
  // the main thread. startTransition defers the resulting render. (LS-7472)
  const [rawData, setRawData] = useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  // Reshape raw payload from { stat: { gameNum: value } } to
  // { gameNum: { stat: value } } and collect the stat-key list.
  // Memoised so it only re-runs when the server response changes. (LS-7472)
  const { games, stats } = useMemo(() => {
    if (!rawData) return { games: undefined, stats: [] as string[] };

    const reshapedGames: Record<string, Record<string, string | number>> = {};
    const gameStats: Set<string> = new Set();

    for (const key of Object.keys(rawData)) {
      gameStats.add(key);
      const statData = rawData[key];

      for (const gameNum of Object.keys(statData)) {
        if (!(gameNum in reshapedGames)) {
          reshapedGames[gameNum] = {};
        }
        reshapedGames[gameNum][key] = statData[gameNum];
      }
    }

    return { games: reshapedGames, stats: Array.from(gameStats) };
  }, [rawData]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [opponentSheetOpen, setOpponentSheetOpen] = useState(false);

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

  const getGameLog = async () => {
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
    if (filters.dateFrom && !DATE_RE.test(filters.dateFrom)) {
      setInputError(
        'Start date must be in YYYY-MM-DD format (e.g. 2024-06-01)',
      );
      return;
    }
    if (filters.dateTo && !DATE_RE.test(filters.dateTo)) {
      setInputError('End date must be in YYYY-MM-DD format (e.g. 2024-06-01)');
      return;
    }
    if (
      filters.dateFrom &&
      DATE_RE.test(filters.dateFrom) &&
      filters.dateFrom > todayStr
    ) {
      setInputError('Start date cannot be in the future');
      return;
    }
    if (
      filters.dateTo &&
      DATE_RE.test(filters.dateTo) &&
      filters.dateTo > todayStr
    ) {
      setInputError('End date cannot be in the future');
      return;
    }

    if (!resolvedEndpoint) return;

    setLoading(true);
    try {
      // Use fetch for cross-platform compatibility
      // Non-premium requests cap results server-side to avoid large payloads
      // and slow renders for users who haven't unlocked full history. (LS-7473)
      const limit = isPremium ? undefined : DEFAULT_GAME_LOGS_LIMIT;
      const response = await fetch(resolvedEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildGameLogsRequestBody(filters, sport, { limit }),
        ),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- fetch response.json() returns any
      const serverData: Record<
        string,
        Record<string, string | number>
      > = await response.json();

      // Store the raw payload; the reshape runs in useMemo, deferred by
      // startTransition so the main thread yields before the re-render. (LS-7472)
      startTransition(() => {
        setRawData(serverData);
      });
    } catch (error) {
      // If the URL was localhost when fetch blew up, the network error is
      // almost always a missing build-time env var rather than a server fault.
      // Surface that explicitly so support tickets don't sit at "no data". (LS-7691)
      if (LOCALHOST_RE.test(resolvedEndpoint)) {
        const message = error instanceof Error ? error.message : String(error);
        handleError(new Error(`${message} — ${LOCALHOST_BUILD_HINT}`));
      } else {
        handleError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Prepare table data + stable row identifiers (gameIds) so the table can use
  // them as React keys. Use `??` (not `||`) so a real `0` stat is preserved as
  // `0`, not coerced to the missing-value sentinel. (LS-7460, LS-7461)
  const gameIds: string[] = games ? Object.keys(games) : [];
  const tableData: Array<Array<CellValue>> = gameIds.map((gameId) =>
    stats.map((s) => games?.[gameId]?.[s] ?? null),
  );

  if (resolution.error) {
    return (
      <ScrollView flex={1} padding="$4">
        <Text
          fontSize="$5"
          fontWeight="bold"
          marginBottom="$4"
          textAlign="center"
        >
          Game logs unavailable
        </Text>
        <Text color="$red10" fontSize="$4">
          {resolution.error.message}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView flex={1} padding="$4">
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

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Date range (optional):
        </Text>
        <YStack gap="$2">
          <Input
            borderWidth={1}
            borderColor="$gray8"
            borderRadius="$3"
            padding="$3"
            fontSize="$4"
            backgroundColor="$white"
            value={filters.dateFrom}
            onChangeText={(v: string) =>
              dispatch({ type: 'setDateFrom', value: v })
            }
            placeholder="Start date (YYYY-MM-DD)"
            editable={!loading}
          />
          <Input
            borderWidth={1}
            borderColor="$gray8"
            borderRadius="$3"
            padding="$3"
            fontSize="$4"
            backgroundColor="$white"
            value={filters.dateTo}
            onChangeText={(v: string) =>
              dispatch({ type: 'setDateTo', value: v })
            }
            placeholder="End date (YYYY-MM-DD)"
            editable={!loading}
          />
        </YStack>
      </YStack>

      {/* Opponent filter (LS-7865). Web: native <select> preserved so existing
          tests remain green. Native: Tamagui Select (non-premium single-select)
          or Sheet with checkmarks (premium multi-select). Native screen routing
          is deferred; the picker is verified via GameLogsTable.stories.tsx. */}
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
      ) : isPremium ? (
        <YStack marginBottom="$4">
          <Text fontSize="$4" fontWeight="600" marginBottom="$2">
            Opponent:
          </Text>
          <Button
            borderWidth={1}
            borderColor="$gray8"
            borderRadius="$3"
            paddingHorizontal="$3"
            paddingVertical="$3"
            backgroundColor="$white"
            onPress={() => setOpponentSheetOpen(true)}
            disabled={loading}
            opacity={loading ? 0.5 : 1}
            justifyContent="flex-start"
          >
            <Text fontSize="$4" color="$gray11">
              {filters.opponentFranchiseIds.length === 0
                ? 'All opponents'
                : `${filters.opponentFranchiseIds.length} selected`}
            </Text>
          </Button>
          <Sheet
            open={opponentSheetOpen}
            onOpenChange={setOpponentSheetOpen}
            modal
            snapPointsMode="fit"
          >
            <Sheet.Frame>
              <Sheet.Handle />
              <Sheet.ScrollView>
                {teamOptions.map((t) => {
                  const checked = filters.opponentFranchiseIds.includes(t.id);
                  return (
                    <XStack
                      key={t.id}
                      role="checkbox"
                      aria-checked={checked}
                      onPress={() => {
                        const next = checked
                          ? filters.opponentFranchiseIds.filter(
                              (id) => id !== t.id,
                            )
                          : [...filters.opponentFranchiseIds, t.id];
                        dispatch({ type: 'setOpponents', value: next });
                      }}
                      padding="$3"
                      alignItems="center"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                    >
                      <Text flex={1} fontSize="$4">
                        {t.label}
                      </Text>
                      {checked ? <Check size={16} color="$blue10" /> : null}
                    </XStack>
                  );
                })}
              </Sheet.ScrollView>
            </Sheet.Frame>
            <Sheet.Overlay />
          </Sheet>
        </YStack>
      ) : (
        <YStack marginBottom="$4">
          <Text fontSize="$4" fontWeight="600" marginBottom="$2">
            Opponent:
          </Text>
          <OpponentSelect
            value={filters.opponentFranchiseIds[0] ?? ''}
            onValueChange={(id) =>
              dispatch({ type: 'setOpponents', value: id ? [id] : [] })
            }
            options={[
              { value: '', label: 'All opponents' },
              ...teamOptions.map((t) => ({ value: t.id, label: t.label })),
            ]}
            placeholder="All opponents"
            disabled={loading}
          />
        </YStack>
      )}

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
        backgroundColor={loading ? '$gray8' : '$blue10'}
        paddingVertical="$3"
        paddingHorizontal="$6"
        borderRadius="$3"
        alignItems="center"
        marginBottom="$4"
        onPress={() => void getGameLog()}
        disabled={loading}
        opacity={loading ? 0.5 : 1}
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

      {games && stats.length > 0 ? (
        <YStack marginTop="$4">
          <CrossPlatformTable
            headers={stats}
            data={tableData}
            rowKeys={gameIds}
          />
        </YStack>
      ) : null}
    </ScrollView>
  );
}

export { GameLogsTable };
export default GameLogsTable;

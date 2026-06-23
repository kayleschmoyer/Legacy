import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  isValidBattingSortField,
  normalizeViewMode,
  parseVisibleColumns,
  PlayerStatsPage,
  type PlayerStatsViewMode,
  serializeVisibleColumns,
  STATS_TOGGLEABLE_COLUMN_KEYS,
} from '@legacy-sports/shared-components/players';
import type {
  PlayerStatsExportData,
  PlayerStatsFilters,
  PlayerWithStats,
} from '@legacy-sports/shared-components/players';
import { LOGGER } from '@legacy-sports/logging';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Sport,
  useGetPlayerIdByBrefIdQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SURFACE_CARD,
  TEXT_HIGH_CONTRAST,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { PlayerDetailModal } from '../../components/PlayerDetailModal';
import { useLeagueRosteredPlayerIds } from '../../hooks/useLeagueRosteredPlayerIds';
import { useFeatureValue } from '../../context/GrowthBookProvider';

// Football statistics are served by the dedicated football players browser,
// rendered inline when the sport switcher selects NFL (LS-8104). Lazy-loaded so
// the default MLB stats route doesn't pull the football bundle for every user.
const FootballPlayersPageLazy = React.lazy(() =>
  import('../football/FootballPlayersPage').then((m) => ({
    default: m.FootballPlayersPage,
  })),
);

// GraphQL Int is a 32-bit signed integer — clamp URL param values to prevent query errors
const MAX_GRAPHQL_INT = 2147483647;

const SEARCH_PARAM_MAX_LENGTH = 64;

// Allowed page sizes for the player-stats grid — mirrors the selector rendered
// in PlayerStatsDataGrid ([10, 25, 50, 100]). Kept as a typed tuple so the
// default (25) is provably a member of the set.
const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

/**
 * Parse an integer URL search param and clamp it to MAX_GRAPHQL_INT (the
 * 32-bit signed INT ceiling GraphQL accepts). The clamp is good defense
 * against query errors, but silently rewriting the user's requested filter to
 * ~2B is surprising — so emit a LOGGER.warn when the clamp actually triggers
 * (PST-102 / LS-7142). Out-of-range values still clamp as before; NaN passes
 * through unchanged (parseInt returned no digits) to preserve existing
 * behavior. Exported for unit testing.
 */
export function parseClampedInt(raw: string, paramName: string): number {
  const parsed = parseInt(raw, 10);
  if (parsed > MAX_GRAPHQL_INT) {
    LOGGER.warn(
      `[PlayerStatsRoute] ${paramName} value exceeds GraphQL INT max; clamping`,
      { paramName, requested: parsed, clampedTo: MAX_GRAPHQL_INT },
    );
    return MAX_GRAPHQL_INT;
  }
  return parsed;
}

/**
 * Parse the `pageSize` URL search param and validate it against the page-size
 * allow-list. The selector only offers 10/25/50/100, but the value is also
 * URL-driven — a hand-edited or injected `?pageSize=99999` would otherwise be
 * forwarded verbatim to the GraphQL query as `first: 99999`, and `?pageSize=abc`
 * would yield `NaN` and propagate downstream (PST-031 / LS-7118). Any value
 * outside the allow-list — including non-numeric input and an absent param —
 * falls back to DEFAULT_PAGE_SIZE (25). Exported for unit testing.
 */
export function parsePageSize(raw: string | null): number {
  const parsed = parseInt(raw ?? '', 10);
  return (ALLOWED_PAGE_SIZES as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_PAGE_SIZE;
}

/**
 * Current version of the URL query-param schema for this page.
 *
 * Bump this whenever a breaking change is made to the param contract — a filter
 * key is renamed, a key is split into two, or a value's format changes. Every
 * URL written by {@link buildStatsSearchParams} carries this as the `v` param so
 * the schema a bookmark was created under is recoverable later.
 *
 * Deprecation policy: never delete or repurpose an old key's meaning in place.
 * When the schema changes, leave the previous behaviour described by a migration
 * step (see {@link SCHEMA_MIGRATIONS}) so URLs minted under the old schema keep
 * resolving to the equivalent new filters instead of breaking silently (PST-101).
 */
export const URL_SCHEMA_VERSION = 1;

type ParamRenames = Record<string, string>;

/**
 * Ordered key-rename maps that upgrade a URL from one schema version to the next.
 *
 * The array index is the *source* version: `SCHEMA_MIGRATIONS[0]` upgrades an
 * unversioned (pre-`v=1`) URL to v1, `SCHEMA_MIGRATIONS[1]` would upgrade v1 → v2,
 * and so on. v1 is the original key set — it shipped before the `v` flag existed,
 * so the v0 → v1 step renames nothing.
 *
 * When a future change renames a filter key (e.g. `minHomeRuns` → `minHR`) or
 * splits one (e.g. `maxERA` → `maxSeasonERA`), bump {@link URL_SCHEMA_VERSION}
 * and append the rename map for that step, e.g. `{ minHomeRuns: 'minHR' }`. Never
 * edit an existing entry — old bookmarks depend on it staying stable.
 */
const SCHEMA_MIGRATIONS: ParamRenames[] = [
  // v0 (unversioned) → v1: no key renames.
  {},
];

/**
 * Apply a key-rename map to a search-param snapshot, returning a new instance.
 * Values (and repeated keys) are preserved; only matching keys are relabeled.
 * Exported so the rename mechanism can be unit-tested in isolation.
 */
export function applyParamRenames(
  params: URLSearchParams,
  renames: ParamRenames,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    out.append(renames[key] ?? key, value);
  }
  return out;
}

/**
 * Upgrade a URL search-param snapshot to the current schema version.
 *
 * Reads the `v` flag (absent ⇒ legacy/pre-`v=1`), applies each migration step in
 * order, and stamps the result with the current version. Unknown/garbage `v`
 * values are treated as legacy; a *newer* version than this client understands is
 * left untouched (forward-compatible — a future client wrote it). Old bookmarked
 * URLs are migrated here instead of being silently misinterpreted (PST-101).
 */
export function migrateStatsSearchParams(
  input: URLSearchParams,
): URLSearchParams {
  const rawVersion = input.get('v');
  const parsed = rawVersion === null ? 0 : Number.parseInt(rawVersion, 10);
  let version = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  let params = new URLSearchParams(input.toString());
  while (version < URL_SCHEMA_VERSION && SCHEMA_MIGRATIONS[version]) {
    params = applyParamRenames(params, SCHEMA_MIGRATIONS[version]);
    version += 1;
  }
  // Stamp the schema we resolved to, but never downgrade a future version we
  // didn't understand (leave a newer client's `v` intact).
  if (version <= URL_SCHEMA_VERSION) {
    params.set('v', String(URL_SCHEMA_VERSION));
  }
  return params;
}

/**
 * Sanitize a URL search parameter value before forwarding to filters.
 * Strips control characters (U+0000–U+001F, U+007F–U+009F) and enforces a
 * maximum length to prevent injection via string-concatenating audit paths.
 */
export function sanitizeSearchParam(value: string | null): string | null {
  if (value === null) return null;
  let stripped = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && (code < 0x7f || code > 0x9f)) {
      stripped += value[i];
    }
  }
  if (!stripped) return null;
  return stripped.slice(0, SEARCH_PARAM_MAX_LENGTH);
}

/**
 * Parse the batting sort from URL params (LS-7115 / PST-022). Returns the
 * `sortBy`/`sortDir` pair only when `sortBy` is a recognized batting sort field
 * — an unknown/garbage value is ignored so it never reaches GraphQL. `sortDir`
 * defaults to `desc` unless an explicit `asc` is supplied. Exported for unit
 * testing.
 */
export function parseStatsSortParams(
  params: URLSearchParams,
): { sortBy: string; sortDir: 'asc' | 'desc' } | null {
  const sortBy = sanitizeSearchParam(params.get('sortBy'));
  if (!sortBy || !isValidBattingSortField(sortBy)) return null;
  const sortDir = params.get('sortDir') === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortDir };
}

/**
 * Sanitize a string before interpolating it into a download filename segment
 * (`link.download`). Strips everything outside `[a-z0-9-]` so an arbitrary
 * value can never inject slashes or dot-segments into the download path
 * (PST-013). `viewMode` is constrained to a fixed union today, but a future
 * user-named-views feature could route arbitrary text here — Firefox has
 * historically honored embedded slashes in `download`, so sanitize defensively.
 */
export function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, '');
}

/**
 * Build URL search params from a committed filter snapshot. Exported for unit
 * testing — the host component wraps this with `setSearchParams(...)`.
 *
 * Numeric formatting matches the URL param contract documented in
 * `docs/agents/pages/players/stats.md` (3 decimals for AVG, 2 for ERA).
 */
export function buildStatsSearchParams(state: {
  viewMode: PlayerStatsViewMode;
  pageSize: number;
  filters: PlayerStatsFilters;
  sport?: 'mlb' | 'nfl';
  /** Explicit per-column visibility selection; `null`/omitted ⇒ no `cols` key. */
  visibleColumns?: readonly string[] | null;
  /**
   * Selected-player deep link (PST-051 / LS-7124). When the detail modal is open
   * its `playerId` is threaded through here so a filter commit doesn't strip the
   * shareable selection from the URL. Included in the deterministic sort below.
   */
  playerId?: string | null;
}): URLSearchParams {
  const next = new URLSearchParams();
  // Stamp the schema version so a bookmark of this URL is recoverable if the
  // param contract changes later (migrated by migrateStatsSearchParams on read).
  next.set('v', String(URL_SCHEMA_VERSION));
  next.set('view', state.viewMode);
  next.set('pageSize', String(state.pageSize));
  if (state.sport) next.set('sport', state.sport);
  if (state.playerId) next.set('playerId', state.playerId);
  // Column-visibility selection (LS-7105 / PST-001). Only written when an
  // explicit selection exists; an explicit "hide everything" serializes to the
  // `none` sentinel so it round-trips distinctly from "no selection".
  const colsParam = serializeVisibleColumns(state.visibleColumns ?? null);
  if (colsParam !== null) next.set('cols', colsParam);
  if (state.filters.searchTerm)
    next.set('searchTerm', state.filters.searchTerm);
  if (state.filters.position) next.set('position', state.filters.position);
  if (state.filters.team) next.set('team', state.filters.team);
  if (state.filters.playerType)
    next.set('playerType', state.filters.playerType);
  // Career batting filters. Every key written here must be one the initialState
  // parser reads back, otherwise the URL roundtrip is lossy (PST-040 / LS-7120):
  // a filter applied on load is dropped the moment any control fires
  // onFiltersChange and the truncated URL replaces the original. Integer counts
  // serialize as plain strings; AVG uses 3 decimals per the documented contract.
  if (state.filters.minHomeRuns !== undefined) {
    next.set('minHomeRuns', String(state.filters.minHomeRuns));
  }
  if (state.filters.maxHomeRuns !== undefined) {
    next.set('maxHomeRuns', String(state.filters.maxHomeRuns));
  }
  if (state.filters.minRBI !== undefined) {
    next.set('minRBI', String(state.filters.minRBI));
  }
  if (state.filters.maxRBI !== undefined) {
    next.set('maxRBI', String(state.filters.maxRBI));
  }
  if (state.filters.minBattingAvg !== undefined) {
    next.set('minBattingAvg', state.filters.minBattingAvg.toFixed(3));
  }
  if (state.filters.maxBattingAvg !== undefined) {
    next.set('maxBattingAvg', state.filters.maxBattingAvg.toFixed(3));
  }

  // Career pitching filters. ERA uses 2 decimals per the contract; Wins and
  // Strikeouts are integer counts. These were parsed but never written before
  // PST-040, making pitcher deep-links one-shot.
  if (state.filters.minERA !== undefined) {
    next.set('minERA', state.filters.minERA.toFixed(2));
  }
  if (state.filters.maxERA !== undefined) {
    next.set('maxERA', state.filters.maxERA.toFixed(2));
  }
  if (state.filters.minWins !== undefined) {
    next.set('minWins', String(state.filters.minWins));
  }
  if (state.filters.maxWins !== undefined) {
    next.set('maxWins', String(state.filters.maxWins));
  }
  if (state.filters.minStrikeouts !== undefined) {
    next.set('minStrikeouts', String(state.filters.minStrikeouts));
  }
  if (state.filters.maxStrikeouts !== undefined) {
    next.set('maxStrikeouts', String(state.filters.maxStrikeouts));
  }
  // Persist the batting sort so a shared link restores the user's chosen sort
  // instead of reverting to the HR default (LS-7115 / PST-022). The shared shell
  // only populates these when the sort differs from the default, so a default
  // view stays clean. Both keys are written together so the URL never carries a
  // partial sort spec.
  if (state.filters.sortBy) {
    next.set('sortBy', state.filters.sortBy);
    next.set('sortDir', state.filters.sortDir ?? 'desc');
  }

  // Serialize keys in a deterministic alphabetical order (PST-104). URLSearchParams
  // preserves insertion order, so the same filter state could otherwise produce
  // different query strings depending on which conditional keys were present — bad
  // for CDN caching, analytics deduping, and back-button URL comparisons. Sort by
  // key with a code-unit comparison (locale-independent) so the result is
  // byte-identical across environments.
  const sorted = new URLSearchParams();
  for (const [key, value] of Array.from(next.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    sorted.append(key, value);
  }
  return sorted;
}

/**
 * Parse a URL search-param snapshot back into the page's initial state — the
 * inverse of {@link buildStatsSearchParams}. Migrates legacy/unversioned URLs to
 * the current schema first (PST-101), then reads every filter key the page
 * supports. Every key read here must be one {@link buildStatsSearchParams}
 * writes, otherwise the roundtrip is lossy (PST-040 / LS-7120). Exported so the
 * parser ↔ serializer roundtrip can be unit-tested directly.
 */
export function parseStatsSearchParams(searchParams: URLSearchParams): {
  viewMode: PlayerStatsViewMode;
  pageSize: number;
  search: string;
  filters: Partial<PlayerStatsFilters>;
  /** Per-column visibility selection from `cols` (`null` ⇒ preset default). */
  visibleColumns: string[] | null;
} {
  // Upgrade older/unversioned URLs to the current schema before reading any
  // filter keys, so bookmarks minted under a prior schema resolve to the
  // equivalent filters instead of being silently misinterpreted (PST-101).
  const params = migrateStatsSearchParams(searchParams);

  // Run the raw `view` param through the shared shell's normalizer so the tab
  // we render is always canonical (combined/hitters/pitchers), honoring legacy
  // aliases (batting→hitters, pitching→pitchers) and unknown values (LS-7146).
  const viewMode = normalizeViewMode(
    (params.get('view') as PlayerStatsViewMode) || 'combined',
  );
  const pageSize = parsePageSize(params.get('pageSize'));
  const search = params.get('search') || '';

  // Per-column visibility (LS-7105). Validated against the real column set so a
  // hand-edited `cols` param can't inject unknown keys.
  const visibleColumns = parseVisibleColumns(
    params.get('cols'),
    STATS_TOGGLEABLE_COLUMN_KEYS,
  );

  // Parse filters from URL
  const filters: Partial<PlayerStatsFilters> = {};

  // Career batting filters
  const minHR = params.get('minHomeRuns');
  const maxHR = params.get('maxHomeRuns');
  const minRBI = params.get('minRBI');
  const maxRBI = params.get('maxRBI');
  const minAVG = params.get('minBattingAvg');
  const maxAVG = params.get('maxBattingAvg');

  // Career pitching filters
  const minERA = params.get('minERA');
  const maxERA = params.get('maxERA');
  const minWins = params.get('minWins');
  const maxWins = params.get('maxWins');
  const minSO = params.get('minStrikeouts');
  const maxSO = params.get('maxStrikeouts');

  // Player info filters — sanitized to strip control chars and cap length
  const position = sanitizeSearchParam(params.get('position'));
  const team = sanitizeSearchParam(params.get('team'));
  const playerType: PlayerStatsFilters['playerType'] =
    sanitizeSearchParam(params.get('playerType')) ?? undefined;
  const searchTerm = sanitizeSearchParam(params.get('searchTerm'));

  // Apply batting filters
  if (minHR) filters.minHomeRuns = parseClampedInt(minHR, 'minHomeRuns');
  if (maxHR) filters.maxHomeRuns = parseClampedInt(maxHR, 'maxHomeRuns');
  if (minRBI) filters.minRBI = parseClampedInt(minRBI, 'minRBI');
  if (maxRBI) filters.maxRBI = parseClampedInt(maxRBI, 'maxRBI');
  if (minAVG) filters.minBattingAvg = parseFloat(minAVG);
  if (maxAVG) filters.maxBattingAvg = parseFloat(maxAVG);

  // Apply pitching filters
  if (minERA) filters.minERA = parseFloat(minERA);
  if (maxERA) filters.maxERA = parseFloat(maxERA);
  if (minWins) filters.minWins = parseClampedInt(minWins, 'minWins');
  if (maxWins) filters.maxWins = parseClampedInt(maxWins, 'maxWins');
  if (minSO) filters.minStrikeouts = parseClampedInt(minSO, 'minStrikeouts');
  if (maxSO) filters.maxStrikeouts = parseClampedInt(maxSO, 'maxStrikeouts');

  // Apply player info filters
  if (position) filters.position = position;
  if (team) filters.team = team;
  if (playerType) filters.playerType = playerType;
  if (searchTerm) filters.searchTerm = searchTerm;

  // Apply batting sort from URL so deep links / reloads restore the chosen
  // sort instead of the hard-coded HR default (LS-7115 / PST-022).
  const sort = parseStatsSortParams(params);
  if (sort) {
    filters.sortBy = sort.sortBy;
    filters.sortDir = sort.sortDir;
  }

  return {
    viewMode,
    pageSize,
    search,
    filters,
    visibleColumns,
  };
}

/**
 * Maximum serialized size (in bytes) the client-side JSON export will write to a
 * Blob. The export path is a synchronous `JSON.stringify` + `Blob` + object-URL
 * download — it holds the entire payload in memory and blocks the main thread.
 * With no upper bound, a large export (e.g. once row data is included per
 * PST-011) could freeze the tab or exhaust memory (PST-012 / LS-7110). Past this
 * cap the client refuses the download and asks the user to narrow filters
 * instead of locking up. 5 MB is comfortably larger than any realistic filtered
 * export today while still bounding the worst case.
 */
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024;

export interface ExportPayloadResult {
  /** Whether the serialized payload is within MAX_EXPORT_BYTES. */
  ok: boolean;
  /** Pretty-printed JSON payload. */
  json: string;
  /** Serialized size in bytes (UTF-8 encoded). */
  bytes: number;
}

/**
 * Compute the UTF-8 byte length of a string without relying on `TextEncoder` or
 * `Blob` — both are absent from the jsdom test environment, and this keeps the
 * size check deterministic and portable. Multi-byte characters (e.g. player
 * names with diacritics) and surrogate pairs are counted at their real byte
 * cost, so the result matches the actual `Blob` size produced at download time.
 * Exported for unit testing.
 */
export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: combines with the following low surrogate into a single
      // 4-byte sequence. Advance past the low surrogate so it isn't recounted.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * The serializable shape written to the exported JSON file.
 *
 * Carries the filter context the original stub exported (`viewMode`, `filters`,
 * `exportedAt`, `totalFilters`) so the file stays self-describing, plus the
 * actual player rows the user is looking at under `players` — the original stub
 * exported only the filter spec, which made the feature useless (PST-011 /
 * LS-7109). `rowCount` is the total number of exported rows across both grids.
 */
export interface PlayerStatsExportPayload {
  viewMode: PlayerStatsViewMode;
  filters: PlayerStatsFilters;
  exportedAt: string;
  totalFilters: number;
  rowCount: number;
  players: {
    batting: readonly unknown[];
    pitching: readonly unknown[];
  };
}

/**
 * Build and serialize the player-stats export payload, enforcing an upper size
 * bound. Includes the actual rows the user is looking at under `players`
 * (PST-011 / LS-7109) alongside the self-describing filter context, then
 * stringifies and measures the UTF-8 byte size so the caller can refuse an
 * oversized download instead of blocking the main thread with an unbounded
 * `JSON.stringify` + `Blob` (PST-012 / LS-7110). Size is measured in UTF-8
 * bytes, not string length, because multi-byte characters (e.g. player names
 * with diacritics) inflate the actual Blob size beyond the character count.
 * `exportedAt` is injectable so the serialization is deterministic under test.
 * Exported for unit testing.
 */
export function buildExportPayload(
  filters: PlayerStatsFilters,
  viewMode: PlayerStatsViewMode,
  data: PlayerStatsExportData,
  exportedAt: string = new Date().toISOString(),
): ExportPayloadResult {
  const batting = data.batting ?? [];
  const pitching = data.pitching ?? [];
  const payload: PlayerStatsExportPayload = {
    viewMode,
    filters,
    exportedAt,
    totalFilters: Object.keys(filters as Record<string, unknown>).length,
    rowCount: batting.length + pitching.length,
    players: {
      batting,
      pitching,
    },
  };
  const json = JSON.stringify(payload, null, 2);
  const bytes = utf8ByteLength(json);
  return { ok: bytes <= MAX_EXPORT_BYTES, json, bytes };
}

const PREFS_STORAGE_KEY = 'ls_user_preferences';

export function readStatsFormat(): 'standard' | 'expanded' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'standard';
    const parsed = JSON.parse(raw) as { statsFormat?: string };
    if (
      parsed.statsFormat === 'standard' ||
      parsed.statsFormat === 'expanded'
    ) {
      return parsed.statsFormat;
    }
    return 'standard';
  } catch (err) {
    // localStorage can hold corrupted JSON (browser extensions, manual DevTools
    // edits). Log a warning so a silently reverted preference is debuggable
    // instead of vanishing, then fall back to the default. (LS-7139 / PST-091)
    // Per the project logging convention, the Error instance is the second
    // argument and extra context goes in the third (.github/reviewer-rules.md).
    const error = err instanceof Error ? err : new Error(String(err));
    LOGGER.warn('readStatsFormat parse failed', error, {
      storageKey: PREFS_STORAGE_KEY,
    });
    return 'standard';
  }
}

/**
 * Read the persisted per-column visibility selection from localStorage
 * (LS-7105 / PST-001). Stored as the same serialized string used in the URL
 * (`a,b` or the `none` sentinel) under the shared preferences object. Returns
 * `null` when absent/corrupt — the caller then falls back to the statsFormat
 * preset. Validated against the real column set so stale keys are dropped.
 */
export function readVisibleColumnsPref(): string[] | null {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { statsVisibleColumns?: unknown };
    return typeof parsed.statsVisibleColumns === 'string'
      ? parseVisibleColumns(
          parsed.statsVisibleColumns,
          STATS_TOGGLEABLE_COLUMN_KEYS,
        )
      : null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    LOGGER.warn('readVisibleColumnsPref parse failed', error, {
      storageKey: PREFS_STORAGE_KEY,
    });
    return null;
  }
}

/**
 * Persist the per-column visibility selection to localStorage, merging into the
 * shared preferences object without clobbering other keys (statsFormat,
 * defaultSport). `null` clears the stored selection. Failures are logged and
 * swallowed — a persistence miss must not break the page.
 */
export function writeVisibleColumnsPref(cols: string[] | null): void {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const serialized = serializeVisibleColumns(cols);
    if (serialized === null) {
      delete parsed.statsVisibleColumns;
    } else {
      parsed.statsVisibleColumns = serialized;
    }
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    LOGGER.warn('writeVisibleColumnsPref failed', error, {
      storageKey: PREFS_STORAGE_KEY,
    });
  }
}

function readDefaultSport(): 'baseball' | 'football' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'baseball';
    const parsed = JSON.parse(raw) as { defaultSport?: string };
    return parsed.defaultSport === 'football' ? 'football' : 'baseball';
  } catch {
    return 'baseball';
  }
}

/**
 * Web App Player Statistics Page
 *
 * Integrates the PlayerStatsPage component with React Router for:
 * - URL query parameter state persistence
 * - Navigation integration
 * - Export and sharing functionality
 * - Deep linking support
 */
const TOAST_DURATION_MS = 2400;

const SPORT_SWITCH_FONT = "'Big Shoulders Display', sans-serif";

const sportSwitchButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  minHeight: 40,
  borderRadius: 9999,
  border: 'none',
  backgroundColor: active ? BRAND_NAVY_LIGHT : 'transparent',
  color: active ? WHITE : TEXT_HIGH_CONTRAST,
  fontFamily: SPORT_SWITCH_FONT,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: active ? 'default' : 'pointer',
});

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const NFL_HEADER_FG_MUTED = '#9CAAC5';
const NFL_HEADER_FG_DIM = '#6C80BA';
const NFL_HEADER_OUTLINE = '#1C2740';

const nflGoldButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  minHeight: 40,
  borderRadius: 12,
  border: `1px solid ${withAlpha(BRAND_GOLD, 0.4)}`,
  background: withAlpha(BRAND_GOLD, 0.08),
  color: BRAND_GOLD_LIGHT,
  fontFamily: FONT_DISPLAY,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

/**
 * Editorial hero rendered above the inline NFL stats view (LS-8132) so the
 * football route matches the MLB stats page's branded header pattern instead
 * of dropping straight into the football browser's bare title row.
 */
function NflStatsHeader({
  urlPreview,
  onShare,
}: {
  urlPreview: string;
  onShare: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 1280,
        width: '100%',
        margin: '0 auto',
        padding: '32px 24px 0',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 24,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 240,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          Players · League Archive
        </span>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(40px, 4.4vw, 60px)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: WHITE,
            margin: 0,
          }}
        >
          NFL Player Statistics
        </h1>
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: 17,
            lineHeight: 1.55,
            color: NFL_HEADER_FG_MUTED,
            maxWidth: '64ch',
            margin: 0,
          }}
        >
          Every active and recent NFL player. Filter by position, compare
          seasons, and find the next addition to your dynasty roster.
        </p>
        <div
          style={{
            marginTop: 14,
            padding: '8px 14px',
            background: 'rgba(13,21,38,0.6)',
            border: `1px solid ${NFL_HEADER_OUTLINE}`,
            borderRadius: 8,
            maxWidth: '100%',
            overflow: 'hidden',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: NFL_HEADER_FG_DIM,
              flexShrink: 0,
            }}
          >
            URL
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: NFL_HEADER_FG_MUTED,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {urlPreview}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onShare}
        aria-label="Share NFL player statistics link"
        style={nflGoldButtonStyle}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND_GOLD_LIGHT}
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
    </div>
  );
}

/**
 * Sport switcher rendered above the stats page. Toggling between MLB and NFL
 * updates the `sport` URL param in place (LS-8104) so the page renders the
 * matching sport's statistics inline — giving football the same on-page stats
 * experience as baseball, instead of redirecting away. Only rendered when
 * football is enabled so a disabled sport is never offered.
 */
function StatsSportSwitcher({
  active,
  onSelectMlb,
  onSelectNfl,
}: {
  active: 'mlb' | 'nfl';
  onSelectMlb: () => void;
  onSelectNfl: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 1280,
        width: '100%',
        margin: '0 auto',
        padding: '24px 24px 0',
      }}
    >
      <div
        role="group"
        aria-label="Select sport"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 5,
          background: SURFACE_CARD,
          border: `1px solid ${withAlpha(BRAND_GOLD, 0.2)}`,
          borderRadius: 9999,
        }}
      >
        <button
          type="button"
          onClick={onSelectMlb}
          aria-pressed={active === 'mlb'}
          aria-label="View MLB statistics"
          style={sportSwitchButtonStyle(active === 'mlb')}
        >
          MLB
        </button>
        <button
          type="button"
          onClick={onSelectNfl}
          aria-pressed={active === 'nfl'}
          aria-label="View NFL statistics"
          style={sportSwitchButtonStyle(active === 'nfl')}
        >
          NFL
        </button>
      </div>
    </div>
  );
}

export function PlayerStatsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [liveMsg, setLiveMsg] = React.useState('');
  // When sharing fails terminally (native share errors AND clipboard write
  // fails or is unavailable) the user has no way to recover from the prose-only
  // toast. Holding the URL here lets us render it inline, pre-selected, so it
  // can be copied manually (LS-7132 / PST-072).
  const [shareFallbackUrl, setShareFallbackUrl] = React.useState('');
  const isPremium = useHasEntitlement(ENTITLEMENTS.advanced_search_filters);

  // `/players/stats` is a PUBLIC, shareable route (LS-3548) — a shared link can
  // be opened by a signed-out recipient. Track auth state so we never fire
  // auth-gated queries for anonymous visitors.
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Check if the user is in at least one baseball league — availability filter
  // is only surfaced when this is true.
  //
  // PST-070 (LS-7130): `userLeagues` is auth-gated and throws
  // AuthenticationError for signed-out users. On a public shared link this
  // surfaced an opaque global auth-error toast to the recipient. Skip the query
  // for anonymous visitors (and while auth is still resolving, to avoid a
  // premature fire before `isAuthenticated` settles) — the career stats grids
  // are already public-readable, and the league availability filter is
  // meaningless without a session.
  const { data: leaguesData } = useGetUserLeaguesQuery({
    fetchPolicy: 'cache-first',
    skip: !isAuthenticated || authLoading,
  });
  const hasBaseballLeagues = (leaguesData?.userLeagues ?? []).some(
    (l) => l.sport === Sport.Baseball,
  );
  const { playerIds: baseballRosteredIds } = useLeagueRosteredPlayerIds(
    Sport.Baseball,
    !hasBaseballLeagues,
  );

  // Derive the active sport from the URL param, falling back to the user's
  // saved default-sport preference. NFL renders football statistics inline
  // (LS-8104) rather than redirecting away to /football/players. Validates
  // against known values so an unrecognised param doesn't corrupt state.
  const sportParam = searchParams.get('sport');
  const sport: 'mlb' | 'nfl' =
    sportParam === 'nfl'
      ? 'nfl'
      : sportParam === 'mlb'
        ? 'mlb'
        : readDefaultSport() === 'football'
          ? 'nfl'
          : 'mlb';

  // Football availability gates the visible sport switcher and the inline
  // football view. Defaults to `true` (matching the route-level FootballGate)
  // so the control isn't hidden while GrowthBook loads or in unconfigured
  // environments.
  const footballEnabled = useFeatureValue('football_enabled', true);
  const showFootball = sport === 'nfl' && footballEnabled !== false;

  // Switch the viewed sport by updating the `sport` URL param in place. Pushes
  // (not replace) so Back returns to the previously viewed sport.
  const handleSelectSport = useCallback(
    (next: 'mlb' | 'nfl') => {
      const params = new URLSearchParams(window.location.search);
      params.set('sport', next);
      setSearchParams(params);
    },
    [setSearchParams],
  );

  // Auto-dismiss the visible toast after TOAST_DURATION_MS while leaving the
  // sr-only live region populated (screen readers re-announce changes; the
  // visible affordance is the confirmation for sighted users).
  useEffect(() => {
    // Keep the toast up indefinitely while the manual-copy fallback URL is
    // showing — auto-dismissing it would defeat the whole point (the user
    // needs time to select and copy the link).
    if (!liveMsg || shareFallbackUrl) return undefined;
    const timer = window.setTimeout(() => setLiveMsg(''), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [liveMsg, shareFallbackUrl]);

  // Stats format preference from user settings
  const [statsFormat, setStatsFormat] = useState<'standard' | 'expanded'>(
    readStatsFormat,
  );

  // Re-read preference when the page gains focus (user may have changed it on the Preferences page)
  useEffect(() => {
    const handleFocus = () => setStatsFormat(readStatsFormat());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Rewrite a legacy/aliased `view` param to its canonical form so the address
  // bar stays in sync with the rendered tab (LS-7146 / PST-111). Without this,
  // /players/stats?view=batting renders the Hitters tab but the URL keeps the
  // `batting` alias forever, which is confusing when the link is shared. Only
  // rewrites when the param is present and non-canonical — an absent or already
  // canonical `view` is left untouched. `replace` avoids polluting history.
  useEffect(() => {
    const rawView = searchParams.get('view');
    if (rawView === null) return;
    const canonical = normalizeViewMode(rawView as PlayerStatsViewMode);
    if (rawView === canonical) return;
    const next = new URLSearchParams(searchParams);
    next.set('view', canonical);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Parse URL parameters for initial state
  const initialState = useMemo(
    () => parseStatsSearchParams(searchParams),
    [searchParams],
  );

  // Per-column visibility selection (LS-7105 / PST-001). Seeded from the `cols`
  // URL param, falling back to the localStorage preference; `null` ⇒ use the
  // statsFormat preset. Only seeded once (matching the initialFilters pattern);
  // subsequent updates flow through handleVisibleColumnsChange.
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(
    () => initialState.visibleColumns ?? readVisibleColumnsPref(),
  );

  // Persist a column-visibility change to both the URL (`cols`) and localStorage
  // so the selection survives reload and is shareable. `null` resets to preset.
  const handleVisibleColumnsChange = useCallback(
    (cols: string[] | null) => {
      setVisibleColumns(cols);
      writeVisibleColumnsPref(cols);
      const params = new URLSearchParams(window.location.search);
      const serialized = serializeVisibleColumns(cols);
      if (serialized === null) {
        params.delete('cols');
      } else {
        params.set('cols', serialized);
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  // Selected-player deep link (PST-051 / LS-7124). The detail modal opens in
  // place over the filtered list when `?playerId=X` is present — by a row click
  // or restored on reload of a shared link — so the URL is a shareable "player X
  // within these filters" deep link. Validated the same way as PlayerDetailPage's
  // numeric `:id` (positive, safe, ≤ GraphQL INT); a non-numeric value is ignored
  // so the modal never opens for a garbage param.
  const playerIdParam = searchParams.get('playerId');
  const selectedPlayerId = useMemo(() => {
    if (!playerIdParam) return null;
    const parsed = Number.parseInt(playerIdParam, 10);
    return Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= MAX_GRAPHQL_INT
      ? parsed
      : null;
  }, [playerIdParam]);

  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      // "Both": a numeric id opens the detail modal in place via `?playerId`,
      // preserving the active filters (PST-051 / LS-7124). A non-numeric,
      // brefId-style id (e.g. 'troutmi01') can't be represented as a numeric
      // `?playerId`, so fall back to the standalone `/players/:id` route with the
      // raw id — never coerced to NaN (PST-050 / LS-7123). Pushing history means
      // Back closes the modal / returns to the list.
      const rawId = String(player.id);
      if (/^\d+$/.test(rawId)) {
        const params = new URLSearchParams(searchParams);
        params.set('playerId', rawId);
        setSearchParams(params);
      } else {
        navigate(`/players/${rawId}`);
      }
    },
    [searchParams, setSearchParams, navigate],
  );

  // Close the in-place modal by stripping only the playerId param; filters are
  // untouched. Replaces history so re-opening doesn't stack duplicate entries.
  const handleClosePlayerDetails = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('playerId');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // "Ability to navigate externally": open the standalone, full-page
  // `/players/:id` route for the player shown in the modal. The modal surfaces
  // this affordance via `onViewFullPage` (PST-050 + PST-051 reconciliation).
  const handleViewFullPage = useCallback(() => {
    if (selectedPlayerId !== null) navigate(`/players/${selectedPlayerId}`);
  }, [navigate, selectedPlayerId]);

  // Latest visible rows surfaced by the shared PlayerStatsPage via
  // onVisibleRowsChange — read at export time so the download contains the
  // actual rows the user is looking at (PST-011 / LS-7109). Held in a ref so
  // grid fetches don't re-render this route, and so onExport keeps its original
  // (filters, viewMode) signature instead of growing a data parameter.
  const exportDataRef = React.useRef<PlayerStatsExportData>({
    batting: [],
    pitching: [],
  });
  const handleVisibleRowsChange = useCallback((data: PlayerStatsExportData) => {
    exportDataRef.current = data;
  }, []);

  // Handle export functionality
  const handleExport = useCallback(
    (filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => {
      // Export is a premium feature (PST-010 / LS-7108). The Export button is
      // already hidden for non-premium viewers (canExport below), but guard the
      // handler too so the client-side download can never run for a free user
      // even if reached programmatically or via a keyboard activation path that
      // the page-level PremiumGate's pointer-event block does not cover.
      if (!isPremium) return;

      // Serialize the visible rows (PST-011 / LS-7109) with an upper size bound.
      // The download path is a synchronous stringify + Blob that blocks the main
      // thread; refusing an oversized payload here prevents a large export from
      // freezing the tab or exhausting memory (PST-012 / LS-7110). The rows are
      // captured from the grids via onVisibleRowsChange (see exportDataRef).
      const { ok, json, bytes } = buildExportPayload(
        filters,
        viewMode,
        exportDataRef.current,
      );
      if (!ok) {
        LOGGER.warn(
          'Player statistics export exceeded size cap; refusing download',
          { bytes, cap: MAX_EXPORT_BYTES },
        );
        setLiveMsg(
          'Export is too large to download here. Narrow your filters and try again.',
        );
        return;
      }

      // Create downloadable file
      const dataBlob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      // Create download link. The object URL is revoked in a `finally` so the
      // resource is released on EVERY export — including the error path where
      // appendChild/click throws — preventing leaked object URLs across repeated
      // or concurrent exports (LS-7660). Each export owns its own `url`, so
      // concurrent exports clean up independently.
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = `player-stats-${sanitizeFilenameSegment(viewMode)}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }

      // Log a compact summary (byte size), not the full row set — the payload
      // now carries the entire visible result set and would flood the logs.
      LOGGER.info('Exported player statistics', { bytes });
      setLiveMsg('Player statistics exported. Download started.');
    },
    [isPremium],
  );

  // Mirror committed filter state into URL params so reload restores the view.
  // sport is included so shared links preserve the active sport context.
  const handleFiltersChange = useCallback(
    (state: {
      viewMode: PlayerStatsViewMode;
      pageSize: number;
      filters: PlayerStatsFilters;
    }) => {
      // Carry the current column-visibility selection AND any open player deep
      // link through so a filter change (which rebuilds the whole param set, and
      // fires on mount too) never drops the `cols` key or the `playerId` modal
      // selection (PST-051 / LS-7124).
      setSearchParams(
        buildStatsSearchParams({
          ...state,
          sport,
          visibleColumns,
          playerId: searchParams.get('playerId'),
        }),
        {
          replace: true,
        },
      );
    },
    [searchParams, setSearchParams, sport, visibleColumns],
  );

  // Handle share functionality — shared component passes a relative URL; prepend origin here.
  // Sport is appended so the recipient lands on the correct sport variant.
  const handleShare = useCallback(
    (relativeUrl: string) => {
      const [path, qs] = relativeUrl.split('?');
      const params = new URLSearchParams(qs ?? '');
      params.set('sport', sport);
      const url = `${window.location.origin}${path}?${params.toString()}`;
      setLiveMsg('');
      setShareFallbackUrl('');
      // Terminal failure: neither native share nor clipboard worked. Surface the
      // URL inline (pre-selected) so the user can copy it manually instead of
      // hunting through the address bar (LS-7132).
      const showManualCopyFallback = () => {
        setLiveMsg('Could not share link. Copy the URL below manually.');
        setShareFallbackUrl(url);
      };
      void (async () => {
        try {
          if (navigator.share) {
            await navigator.share({
              title: 'Player Statistics - Legacy Sports',
              text: 'Check out these player statistics from Legacy Sports',
              url: url,
            });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            setLiveMsg('Link copied to clipboard.');
          } else {
            showManualCopyFallback();
          }
        } catch (error) {
          // AbortError means the user dismissed the native share sheet — not an error
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          LOGGER.error(
            'Error sharing:',
            error instanceof Error ? error : String(error),
          );
          if (navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(url);
              setLiveMsg('Link copied to clipboard.');
            } catch (clipboardError) {
              LOGGER.error(
                'Clipboard error:',
                clipboardError instanceof Error
                  ? clipboardError
                  : String(clipboardError),
              );
              showManualCopyFallback();
            }
          } else {
            showManualCopyFallback();
          }
        }
      })();
    },
    [sport],
  );

  // NFL view — render the football statistics browser inline (LS-8104) instead
  // of redirecting away, so football gets the same on-page stats experience as
  // baseball. Wraps the football browser in the same editorial header pattern
  // used by the MLB stats page (LS-8132) so the two sports share UI patterns.
  // Placed after all hooks to satisfy Rules of Hooks.
  if (showFootball) {
    const nflUrlPreview = `/players/stats?${searchParams.toString()}`;
    const handleNflShare = () => {
      const url = `${window.location.origin}/players/stats?${searchParams.toString()}`;
      void (async () => {
        try {
          if (navigator.share) {
            await navigator.share({
              title: 'NFL Player Statistics - Legacy Sports',
              text: 'Check out these NFL player statistics from Legacy Sports',
              url,
            });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            setLiveMsg('Link copied to clipboard.');
          } else {
            setLiveMsg('Could not share link. Please copy the URL manually.');
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
          LOGGER.error(
            'Error sharing NFL stats:',
            error instanceof Error ? error : String(error),
          );
        }
      })();
    };

    return (
      <div
        style={{
          flex: 1,
          backgroundColor: `var(--background, ${BG_DARK})`,
          color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
          padding: 0,
        }}
      >
        <PageMeta
          title="NFL Player Statistics"
          description="Browse career and season statistics for every NFL player available in your Legacy Sports fantasy league."
        />
        <StatsSportSwitcher
          active="nfl"
          onSelectMlb={() => handleSelectSport('mlb')}
          onSelectNfl={() => handleSelectSport('nfl')}
        />
        <NflStatsHeader urlPreview={nflUrlPreview} onShare={handleNflShare} />
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{ padding: '2rem', textAlign: 'center' }}
            >
              Loading NFL statistics…
            </div>
          }
        >
          <FootballPlayersPageLazy showHeader={false} />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: 0, // Remove default padding as PlayerStatsPage handles its own
      }}
    >
      <PageMeta
        title="Player Statistics"
        description="Browse career and season statistics for every MLB player available in your Legacy Sports fantasy league."
      />
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
      {/* Visible toast confirmation — paired with the sr-only live region above.
          Crossfade-only animation honors prefers-reduced-motion. */}
      <style>{`
        @keyframes ls-stats-toast-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ls-stats-toast { animation: ls-stats-toast-fade 180ms ease forwards; }
        }
        @keyframes ls-stats-toast-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {liveMsg && (
        <div
          className="ls-stats-toast"
          role="status"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: SURFACE_CARD,
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.4)}`,
            borderRadius: shareFallbackUrl ? 14 : 9999,
            padding: shareFallbackUrl ? '12px 16px' : '12px 20px 12px 16px',
            color: BRAND_GOLD_LIGHT,
            fontFamily: "'Literata', serif",
            fontSize: 14,
            fontWeight: 600,
            display: shareFallbackUrl ? 'flex' : 'inline-flex',
            flexDirection: shareFallbackUrl ? 'column' : 'row',
            alignItems: shareFallbackUrl ? 'stretch' : 'center',
            gap: 10,
            maxWidth: shareFallbackUrl
              ? 'min(420px, calc(100vw - 32px))'
              : undefined,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            animation: 'ls-stats-toast-in 180ms ease forwards',
          }}
        >
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
          >
            {/* Success uses a check; the manual-copy fallback is an error state,
                so a check would be misleading — show a warning glyph instead. */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={shareFallbackUrl ? BRAND_SEAM_RED : BRAND_GOLD}
              strokeWidth="2"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              {shareFallbackUrl ? (
                <>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </>
              ) : (
                <polyline points="20 6 9 17 4 12" />
              )}
            </svg>
            {liveMsg}
          </div>
          {shareFallbackUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={(node) => {
                  // Pre-select the URL so the user can copy immediately, per the
                  // ticket recommendation ("URL pre-selected").
                  if (node) node.select();
                }}
                readOnly
                value={shareFallbackUrl}
                aria-label="Shareable link to copy"
                onFocus={(event) => event.currentTarget.select()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: BG_DARK,
                  border: `1px solid ${withAlpha(BRAND_GOLD, 0.3)}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: TEXT_HIGH_CONTRAST,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 400,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setShareFallbackUrl('');
                  setLiveMsg('');
                }}
                aria-label="Dismiss"
                style={{
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: BRAND_GOLD_LIGHT,
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}
      {footballEnabled !== false && (
        <StatsSportSwitcher
          active="mlb"
          onSelectMlb={() => handleSelectSport('mlb')}
          onSelectNfl={() => handleSelectSport('nfl')}
        />
      )}
      <PremiumGate
        isPremium={isPremium}
        featureName="Player Statistics & Projections"
        featureDescription="Unlock advanced player statistics, projected fantasy points, ADP rankings, and injury-status filters with Premium."
      >
        <PlayerStatsPage
          title="MLB Player Statistics"
          initialViewMode={initialState.viewMode}
          initialFilters={initialState.filters}
          initialPageSize={initialState.pageSize}
          showHeader={true}
          showActions={true}
          canExport={isPremium}
          statsFormat={statsFormat}
          initialVisibleColumns={visibleColumns}
          onVisibleColumnsChange={handleVisibleColumnsChange}
          onPlayerDetails={handlePlayerDetails}
          onExport={handleExport}
          onVisibleRowsChange={handleVisibleRowsChange}
          onShare={handleShare}
          onFiltersChange={handleFiltersChange}
          showAvailabilityFilter={hasBaseballLeagues}
          rosteredPlayerIds={baseballRosteredIds}
        />
      </PremiumGate>
      {/* Routable player detail modal (PST-051 / LS-7124). Rendered in place over
          the filtered list when ?playerId=X is present — opened by a row click or
          restored on reload of a shared deep link — and offers an "open full
          page" affordance (onViewFullPage) to navigate externally to the
          standalone /players/:id route (PST-050 reconciliation). Gated on the
          same entitlement as the stats list, since the modal surfaces premium
          career stats and /players/:id already handles the non-premium case. The
          modal resolves the player's name from its own query, so the deep-link
          mount (no name in the URL) renders correctly with a fallback. */}
      {isPremium && selectedPlayerId !== null && (
        <PlayerDetailModal
          open={true}
          onOpenChange={(open) => {
            if (!open) handleClosePlayerDetails();
          }}
          playerId={selectedPlayerId}
          playerName="Player details"
          onViewFullPage={handleViewFullPage}
          onBack={handleClosePlayerDetails}
        />
      )}
    </div>
  );
}

/**
 * Player Detail Page
 *
 * Handles both `/players/:id` (numeric) and `/players/:brefid` (Baseball
 * Reference ID string) — React Router matches both to the same `:id` param.
 * When the param is non-numeric we resolve it via `playerByBrefId` first.
 */
export function PlayerDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: identifier } = useParams<{ id: string }>();
  const isPremium = useHasEntitlement(ENTITLEMENTS.advanced_search_filters);

  const isNumeric = !!identifier && /^\d+$/.test(identifier);
  const parsedNumericId = isNumeric ? Number(identifier) : null;
  const isValidNumericId =
    parsedNumericId !== null &&
    Number.isSafeInteger(parsedNumericId) &&
    parsedNumericId > 0 &&
    parsedNumericId <= MAX_GRAPHQL_INT;
  const numericId = isValidNumericId ? parsedNumericId : null;
  const brefId = !isNumeric ? (identifier?.trim().toLowerCase() ?? null) : null;

  const {
    data: brefData,
    loading: brefLoading,
    error: brefError,
  } = useGetPlayerIdByBrefIdQuery({
    variables: { brefId: brefId ?? '' },
    skip: !brefId,
  });

  const resolvedId = isNumeric
    ? numericId
    : (brefData?.playerByBrefId?.id ?? null);

  const resolvedName =
    [brefData?.playerByBrefId?.firstName, brefData?.playerByBrefId?.lastName]
      .filter(Boolean)
      .join(' ') || 'Player details';

  useEffect(() => {
    if (brefError) {
      LOGGER.error('[PlayerDetailPage] brefId lookup error:', brefError);
    }
  }, [brefError]);

  useEffect(() => {
    if (isNumeric && !isValidNumericId) {
      LOGGER.warn('[PlayerDetailPage] invalid id', { identifier });
    }
  }, [isNumeric, isValidNumericId, identifier]);

  useEffect(() => {
    if (brefId && identifier && identifier !== brefId) {
      navigate(`/players/${brefId}`, { replace: true });
    }
  }, [brefId, identifier, navigate]);

  const handleBack = useCallback(() => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/players/stats', { replace: true });
    }
  }, [navigate, location.key]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: '2rem',
      }}
    >
      <PageMeta
        title="Player Profile"
        description="View detailed career statistics and performance history for this baseball player on Legacy Sports."
      />
      <button
        className="player-back-btn"
        onClick={handleBack}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: BRAND_NAVY_LIGHT,
          color: WHITE,
          border: '1px solid rgba(197,165,90,0.2)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: "'Big Shoulders Display', sans-serif",
          letterSpacing: '0.3px',
        }}
      >
        ← Back
      </button>

      {brefLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: TEXT_HIGH_CONTRAST,
          }}
        >
          Loading player…
        </div>
      )}

      {brefError && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
            border: `1px solid ${BRAND_SEAM_RED}`,
            borderRadius: '6px',
            color: BRAND_SEAM_RED,
            marginBottom: '1rem',
          }}
        >
          Error loading player. Please try again.
        </div>
      )}

      {isNumeric && !isValidNumericId && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
            border: `1px solid ${BRAND_SEAM_RED}`,
            borderRadius: '6px',
            color: BRAND_SEAM_RED,
            marginBottom: '1rem',
          }}
        >
          Invalid player ID &ldquo;{identifier}&rdquo;.
        </div>
      )}

      {!brefLoading &&
        !brefError &&
        !resolvedId &&
        (isValidNumericId || brefId) && (
          <div
            role="alert"
            style={{
              padding: '1rem',
              backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
              border: `1px solid ${BRAND_SEAM_RED}`,
              borderRadius: '6px',
              color: BRAND_SEAM_RED,
              marginBottom: '1rem',
            }}
          >
            {brefId
              ? `No player found with Baseball Reference ID "${brefId}".`
              : `No player found for ID "${identifier}".`}
          </div>
        )}

      {resolvedId !== null &&
        !brefError &&
        (isPremium ? (
          <PlayerDetailModal
            open={true}
            onOpenChange={(open) => {
              if (!open) handleBack();
            }}
            playerId={resolvedId}
            playerName={resolvedName}
          />
        ) : (
          // Free users: the detail modal renders its content in a Dialog portal
          // (outside any wrapper), so gating the modal directly would leak the
          // stats. Instead render an inline, non-portal panel behind PremiumGate
          // so the blur + upgrade CTA actually cover the career-stats surface.
          <PremiumGate
            isPremium={false}
            featureName="Player Career Stats"
            featureDescription="Unlock full career statistics, season-by-season splits, and advanced metrics for every player."
          >
            <div
              style={{
                minHeight: 360,
                borderRadius: '16px',
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                backgroundColor: SURFACE_CARD,
                padding: '2rem',
              }}
            >
              <h1
                style={{
                  fontFamily: "'Big Shoulders Display', sans-serif",
                  color: WHITE,
                  margin: 0,
                }}
              >
                {resolvedName}
              </h1>
              <p
                style={{
                  fontFamily: "'Literata', serif",
                  color: TEXT_HIGH_CONTRAST,
                  marginTop: '0.75rem',
                }}
              >
                Career statistics — season-by-season batting, pitching, and
                fielding splits — are a Premium feature.
              </p>
            </div>
          </PremiumGate>
        ))}
    </div>
  );
}

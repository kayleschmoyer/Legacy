import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { CareerPitchingFragment } from '@legacy-sports/graphql';
import {
  BATTING_NAME_COLUMN_KEY,
  CAREER_STATS_COLUMNS,
  PlayerStatsDataGrid,
} from './PlayerStatsDataGrid';
import {
  PITCHING_NAME_COLUMN_KEY,
  PITCHING_STATS_COLUMNS,
  PitchingStatsDataGrid,
} from './PitchingStatsDataGrid';
import {
  buildToggleableColumns,
  type ColumnGroup,
  presetVisibleKeys,
  type ToggleableColumn,
  toggleColumnKey,
} from './columnVisibility';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';
import { csp } from './crossPlatformStyle';
import { Animated, Platform } from '../../platform-components';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  STATS_BORDER,
  STATS_PAGE_TOKENS,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const OUTLINE_SUBTLE = '#1C2740';
const OUTLINE_DEFAULT = '#2F3B53';
const FG3 = '#9CAAC5';
const FG4 = '#6C80BA';

// Stats Page surfaces (LS-4612 tokens). Re-exported here for clarity at call sites.
const BG_PAGE = STATS_PAGE_TOKENS.BG_PAGE;
const BG_PANEL = STATS_PAGE_TOKENS.BG_PANEL;
const BG_ELEVATED = STATS_PAGE_TOKENS.BG_ELEVATED;

// Export / Share gold-accent button — matches the BRAND_GOLD heritage treatment
// from the Stats Page design (project/stats.css `.sp-btn-ghost` + toast border).
const GOLD_ACCENT_BUTTON_STYLE = {
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: withAlpha(BRAND_GOLD, 0.4),
  backgroundColor: withAlpha(BRAND_GOLD, 0.08),
  borderStyle: 'solid' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
  minHeight: 40,
};

// `letterSpacing: '0.08em'` is web-only (RN needs a numeric px); csp() keeps it
// verbatim on web and drops it on native so the shared label never crashes RN.
const GOLD_ACCENT_BUTTON_LABEL_STYLE = csp({
  color: BRAND_GOLD_LIGHT,
  fontSize: 12,
  fontFamily: FONT_DISPLAY,
  fontWeight: '700' as const,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
});

const POSITIONS = [
  'All Positions',
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'UT',
  'DH',
];

const MLB_TEAMS = [
  'All Teams',
  'ARI',
  'ATL',
  'BAL',
  'BOS',
  'CHC',
  'CHW',
  'CIN',
  'CLE',
  'COL',
  'DET',
  'HOU',
  'KCR',
  'LAA',
  'LAD',
  'MIA',
  'MIL',
  'MIN',
  'NYM',
  'NYY',
  'OAK',
  'PHI',
  'PIT',
  'SDP',
  'SEA',
  'SFG',
  'STL',
  'TBR',
  'TEX',
  'TOR',
  'WSN',
];

/**
 * Column groups (batting + pitching) paired with their always-visible name
 * column key. Drives the column-visibility picker and the host's `cols`
 * URL/storage validation (LS-7105 / PST-001).
 */
export const STATS_COLUMN_GROUPS: readonly ColumnGroup[] = [
  { columns: CAREER_STATS_COLUMNS, nameKey: BATTING_NAME_COLUMN_KEY },
  { columns: PITCHING_STATS_COLUMNS, nameKey: PITCHING_NAME_COLUMN_KEY },
];

/**
 * Every toggleable stat-column key across both grids (name columns excluded),
 * de-duplicated. Exported so the host can validate a hand-edited `cols` URL
 * param / stale localStorage against the real column set.
 */
export const STATS_TOGGLEABLE_COLUMN_KEYS: readonly string[] =
  buildToggleableColumns(
    STATS_COLUMN_GROUPS as ReadonlyArray<
      ColumnGroup<{
        key: string;
        label: string;
        priority: 'high' | 'medium' | 'low';
      }>
    >,
  ).map((c) => c.key);

/**
 * Shell-level conditional state. When omitted, the data grid renders and
 * handles its own internal loading/error/empty fallbacks. Setting this prop
 * (e.g. from an integrator that fetches above the shell) replaces the grid
 * with the design-spec state card.
 */
export type PlayerStatsShellState = 'loading' | 'error' | 'empty';

/**
 * Setters consumed by {@link createClearFiltersHandler}. Extracted so the
 * EmptyCard's clear-all-filters affordance can be unit-tested without
 * mounting the full page shell (LS-4613).
 */
export interface ClearFiltersSetters {
  setSearch: (v: string) => void;
  setPosition: (v: string) => void;
  setTeam: (v: string) => void;
  setMinHR: (v: number) => void;
  setMaxHR: (v: number) => void;
  setMinRBI: (v: number) => void;
  setMaxRBI: (v: number) => void;
  setMinAVG: (v: number) => void;
  setMaxAVG: (v: number) => void;
  setMinERA: (v: number) => void;
  setMaxERA: (v: number) => void;
  setMinWins: (v: number) => void;
  setMaxWins: (v: number) => void;
  setMinSO: (v: number) => void;
  setMaxSO: (v: number) => void;
}

/**
 * Builds the EmptyCard `onClear` handler. Resets every filter draft to its
 * page default (empty search, "All Positions"/"All Teams", zeroed sliders,
 * MaxERA back to the off-sentinel), commits the snapshot via `applyFilters`,
 * then forwards to the integrator's optional `onClearFilters` callback so
 * URL/query state can be mirrored.
 */
export function createClearFiltersHandler(
  setters: ClearFiltersSetters,
  applyFilters: () => void,
  onClearFilters?: () => void,
): () => void {
  return () => {
    setters.setSearch('');
    setters.setPosition('All Positions');
    setters.setTeam('All Teams');
    setters.setMinHR(0);
    setters.setMaxHR(HR_MAX);
    setters.setMinRBI(0);
    setters.setMaxRBI(RBI_MAX);
    setters.setMinAVG(0);
    setters.setMaxAVG(AVG_MAX);
    setters.setMinERA(0);
    setters.setMaxERA(ERA_MAX_OFF);
    setters.setMinWins(0);
    setters.setMaxWins(WINS_MAX);
    setters.setMinSO(0);
    setters.setMaxSO(SO_MAX);
    applyFilters();
    onClearFilters?.();
  };
}

/**
 * Advances a numeric range value by `delta` steps, snapping to the `step` grid
 * and clamping to `[min, max]`. Snapping avoids floating-point drift on
 * fractional steps (e.g. batting-average 0.005 increments). Extracted as a pure
 * function so the native stepper's arithmetic is unit-testable without mounting
 * the page (LS-7806).
 */
export function stepValue(
  value: number,
  delta: number,
  min: number,
  max: number,
  step: number,
): number {
  const next = value + delta;
  const snapped = Math.round(next / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  // Re-snap after clamping so min/max that aren't on the step grid stay exact.
  return Number(clamped.toFixed(6));
}

/**
 * Resolve the `playerType` query filter for the batting grid from the active
 * view mode (LS-7145). The Hitters tab must exclude pure pitchers, so it filters
 * the batting query to `playerType: 'hitter'`. Combined and Pitchers leave it
 * undefined — Combined intentionally shows every batter, and the Pitchers grid
 * is already pitcher-only via the separate `careerPitchingStats` query. Extracted
 * as a pure function so the mapping is unit-testable without mounting the shell.
 */
export function battingPlayerTypeForViewMode(
  viewMode: 'combined' | 'hitters' | 'pitchers',
): 'hitter' | undefined {
  return viewMode === 'hitters' ? 'hitter' : undefined;
}

/**
 * Parses a raw range-input value into a finite number, rejecting `NaN`/±Infinity
 * at the setter boundary. Browser range inputs are well-behaved, but malformed
 * states (e.g. the value cleared via devtools) can yield `Number('') === 0` or a
 * `NaN` that would otherwise propagate into filter state and on toward GraphQL.
 * Returns `null` for any non-finite parse so callers can ignore the change and
 * keep the prior valid value (LS-7137). Extracted as a pure function so the guard
 * is unit-testable without mounting the page.
 */
export function parseSliderValue(raw: string): number | null {
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

/**
 * Slider commits are debounced by this many ms. A fast drag or a held arrow key
 * (`onKeyUp` fires once per keystroke) would otherwise commit — and remount the
 * grid + refire the GraphQL query — once per keystroke (LS-7128 / PST-062).
 */
export const SLIDER_COMMIT_DEBOUNCE_MS = 250;

export interface DebouncedCommit {
  /**
   * Schedule a commit `delayMs` after the most recent call, replacing any
   * still-pending commit so a burst of calls collapses into one.
   */
  trigger: () => void;
  /** Fire a pending commit immediately; no-op when nothing is pending. */
  flush: () => void;
  /** Drop any pending commit without firing it. */
  cancel: () => void;
}

/**
 * Wraps `commit` in a trailing-edge debounce. The slider previously bound
 * `applyFilters` straight to `onKeyUp`/`onMouseUp`/`onTouchEnd`, so holding an
 * arrow key fired one commit — one grid remount + GraphQL refetch — per
 * keystroke (LS-7128). Routing the keyboard path through `trigger` collapses a
 * burst of keyups into a single commit, while `flush` lets a terminal event
 * (blur) commit a pending value without waiting out the delay. Extracted as a
 * pure factory so the coalescing is unit-testable without mounting the page.
 */
export function createDebouncedCommit(
  commit: () => void,
  delayMs: number = SLIDER_COMMIT_DEBOUNCE_MS,
): DebouncedCommit {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    trigger: () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        commit();
      }, delayMs);
    },
    flush: () => {
      if (timer !== null) {
        cancel();
        commit();
      }
    },
    cancel,
  };
}

// Default batting sort — mirrors DEFAULT_CAREER_STATS_PARAMS in CareerStatsService.
// When the active sort equals this default it is omitted from the URL so default
// links stay clean; any other sort is persisted so a shared link restores it
// (LS-7115 / PST-022).
export const DEFAULT_BATTING_SORT_BY = 'homeRuns';
export const DEFAULT_BATTING_SORT_DIR: 'asc' | 'desc' = 'desc';

/**
 * Returns the sort portion of a filter snapshot to persist to the URL: the
 * `sortBy`/`sortDir` pair when it differs from the batting default, or an empty
 * object when it matches (so default views produce clean URLs). Exported as a
 * pure function so the include/omit logic is unit-testable without mounting the
 * page (LS-7115).
 */
export function battingSortFilter(
  sortBy: string,
  sortDir: 'asc' | 'desc',
): Pick<PlayerStatsFilters, 'sortBy' | 'sortDir'> {
  if (
    sortBy === DEFAULT_BATTING_SORT_BY &&
    sortDir === DEFAULT_BATTING_SORT_DIR
  ) {
    return {};
  }
  return { sortBy, sortDir };
}

/**
 * The currently displayed result set, surfaced to a host via
 * {@link PlayerStatsPageProps.onVisibleRowsChange} so it can serialize the
 * actual player rows the user is looking at — not just the filter spec (PST-011
 * / LS-7109). Only the rows for the visible tab(s) are populated: the Hitters
 * tab fills `batting`, the Pitchers tab fills `pitching`, and Combined fills
 * both. A tab that is not shown contributes an empty array.
 */
export interface PlayerStatsExportData {
  batting: readonly PlayerCareerStats[];
  pitching: readonly CareerPitchingFragment[];
}

/** Export file format options for the player-stats download (PST-014 / LS-7112). */
export type ExportFormat = 'json' | 'csv' | 'xlsx';

/**
 * Computes a slider's fill percentage (0–100) for `value` within `[min, max]`.
 * Guards the denominator: when `max <= min` the range is degenerate (a future
 * config bug could pass `max === min`), so the naive `(value - min) / (max - min)`
 * would divide by zero and yield `NaN`/`Infinity` — which renders as the invalid
 * CSS length `NaN%` (silently dropped by Chrome, treated as `0%` by Firefox).
 * Defaults to `0` in that case and clamps the result to `[0, 100]` so the fill
 * width is always a valid percentage. Extracted as a pure function so the
 * arithmetic is unit-testable without mounting the page (LS-7134).
 */
export function sliderFillPct(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) {
    return 0;
  }
  const pct = Math.round(((value - min) / range) * 100);
  return Math.min(100, Math.max(0, pct));
}

export interface PlayerStatsPageProps {
  title?: string;
  initialViewMode?: PlayerStatsViewMode;
  initialFilters?: Partial<PlayerStatsFilters>;
  initialPageSize?: number;
  showHeader?: boolean;
  showActions?: boolean;
  /**
   * Whether the Export action is available to the current viewer. When `false`
   * the Export button is hidden and {@link PlayerStatsPageProps.onExport} is
   * never invoked. Defaults to `true` so callers that do not gate export are
   * unaffected. The Share button is independent and remains governed solely by
   * `showActions`.
   */
  canExport?: boolean;
  /**
   * Whether the column-visibility picker is available to the current viewer.
   * Column customization is a premium capability (PST-003 / LS-7107): when the
   * host marks the viewer as not entitled (`false`), the Columns button and
   * picker panel are hidden. Defaults to `true` so callers that do not gate
   * column control are unaffected.
   */
  canCustomizeColumns?: boolean;
  /**
   * Whether the current viewer holds the `large_player_stats_page_size` entitlement
   * (PST-032 / LS-7119). When `true` the rows-per-page selector shows additional
   * 250/500 options in single-grid modes. Defaults to `false` so non-premium callers
   * are unaffected.
   */
  isPremiumPageSize?: boolean;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
  /**
   * Initial per-column visibility selection (column keys to show). `null` /
   * omitted means "no explicit selection" — the `statsFormat` preset is used as
   * the baseline (LS-7105 / PST-001). The host seeds this from the `cols` URL
   * param and localStorage.
   */
  initialVisibleColumns?: readonly string[] | null;
  /**
   * Fired when the user toggles a column or resets to the preset. `null` signals
   * a reset (clear the persisted selection); an array is the new explicit set.
   */
  onVisibleColumnsChange?: (visibleColumns: string[] | null) => void;
  /** Force a shell-level state card (loading / error / empty) instead of the data grid. */
  state?: PlayerStatsShellState;
  /** Retry handler used by the error state. */
  onRetry?: () => void;
  /** Clear-filters handler used by the empty state. Defaults to resetting local filter draft. */
  onClearFilters?: () => void;
  onPlayerDetails?: (player: PlayerWithStats) => void;
  /**
   * Export formats available to the current viewer. Defaults to `['json']` so
   * existing callers are unaffected. Pass `['json', 'csv', 'xlsx']` to render
   * three export buttons for premium viewers (PST-014 / LS-7112).
   */
  exportFormats?: readonly ExportFormat[];
  onExport?: (
    filters: PlayerStatsFilters,
    viewMode: PlayerStatsViewMode,
    format?: ExportFormat,
  ) => void;
  /**
   * Fired with the rows currently visible in the grid(s) whenever they change
   * (data load or tab switch). Lets a host cache the result set so its
   * {@link onExport} handler can serialize the actual rows the user is looking
   * at rather than just the filter spec (PST-011 / LS-7109). Kept separate from
   * {@link onExport} so the export callback's signature stays unchanged.
   */
  onVisibleRowsChange?: (data: PlayerStatsExportData) => void;
  onShare?: (url: string) => void;
  /** Fired when the committed filter snapshot changes so the host can mirror to URL params. */
  onFiltersChange?: (state: {
    viewMode: 'combined' | 'hitters' | 'pitchers';
    pageSize: number;
    filters: PlayerStatsFilters;
  }) => void;
  /** Show the availability filter row. Only meaningful when the user is in at least one league. */
  showAvailabilityFilter?: boolean;
  /** Rostered player IDs from the user's fantasy leagues, used for client-side availability filtering. */
  rosteredPlayerIds?: ReadonlySet<number>;
}

// ERA "off" sentinel — sits at the high end of the slider so "Max ERA = 5.00" means
// no upper bound is applied. Matches the design reference (project/stats.jsx).
const ERA_MAX_OFF = 5;

// Minimum search length enforced before a search term is committed to a query.
// The toolbar placeholder advertises this minimum, so it is the single source of
// truth for both the placeholder copy and the commit-time guard (PST-061 / LS-7127).
const MIN_SEARCH_LENGTH = 2;

// Upper bound for the "Min Home Runs" slider. These are CAREER home-run totals, so the
// cap must span the career domain (the all-time leader, Barry Bonds, sits at 762) rather
// than a single-season figure. 800 gives headroom above the record so users can dial in
// thresholds like "500+" or "700+" career HR from the UI. The URL parser already accepts
// arbitrary values, so this only governs the slider control.
const HR_MAX = 800;
// Step the HR slider in increments of 5 so the wider 0–800 range stays practical to drag
// and to tap on the native +/- stepper (760 single-unit taps would be unusable). Exact
// off-grid values remain reachable via a hand-typed URL.
const HR_STEP = 5;

// Batting average upper bound and step. The all-time single-season record is .440
// (Hugh Duffy, 1894); 0.43 is a practical cap for the career-avg domain. Step matches
// the three-decimal display precision used in the format function.
const AVG_MAX = 0.43;
const AVG_STEP = 0.005;

// RBI career upper bound. Hank Aaron's career total of 2297 is the all-time record;
// 2500 gives headroom for future records and round thresholds like "2000+".
const RBI_MAX = 2500;
const RBI_STEP = 5;

// Wins career upper bound. Cy Young holds the all-time record at 511; 550 gives headroom.
const WINS_MAX = 550;
const WINS_STEP = 5;

// Strikeouts career upper bound. Nolan Ryan's record is 5714; 6000 gives headroom.
const SO_MAX = 6000;
const SO_STEP = 10;

// Rows-per-page choices for the toolbar selector.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
// Additional rows-per-page options unlocked for premium subscribers (PST-032 / LS-7119).
// Only offered in single-grid modes — combined view already withholds 100 to keep
// peak un-virtualized row count bounded, and 2×250 would be excessive.
const PREMIUM_PAGE_SIZE_OPTIONS = [250, 500] as const;
// In 'combined' view both the batting and pitching grids render simultaneously, so a
// pageSize of N paints 2×N rows in a single, un-virtualized layout (PST-030 / LS-7117).
// Cap the largest page size out of combined view to keep peak row count bounded — the
// 100-row option stays available in the single-grid Hitters/Pitchers modes.
const COMBINED_MAX_PAGE_SIZE = 50;

export interface AppliedFilters {
  search: string;
  position: string;
  team: string;
  pageSize: number;
  // Batting stat ranges
  minHR: number;
  maxHR: number;
  minRBI: number;
  maxRBI: number;
  minAVG: number;
  maxAVG: number;
  // Pitching stat ranges
  minERA: number;
  maxERA: number;
  minWins: number;
  maxWins: number;
  minSO: number;
  maxSO: number;
}

/**
 * True when the draft toolbar snapshot differs from the committed (applied)
 * snapshot — i.e. the user has pending filter edits that have not been applied
 * yet. Drives the toolbar's "Apply" button enabled/emphasis state.
 *
 * LS-7126 unified the toolbar on a single draft model: every control (search,
 * Position/Team/Rows selects, and the advanced sliders) writes only to draft
 * state, and an explicit Apply button commits the whole snapshot. Previously
 * Position/Team/Rows bypassed the draft/applied separation and applied on
 * change, so a typed-but-unsubmitted search silently stayed unapplied — the
 * "worst of both" mixed model the bug describes. Extracted as a pure function so
 * the dirty-check is unit-testable without mounting the page shell.
 */
export function hasPendingFilterChanges(
  draft: AppliedFilters,
  applied: AppliedFilters,
): boolean {
  return (
    draft.search !== applied.search ||
    draft.position !== applied.position ||
    draft.team !== applied.team ||
    draft.pageSize !== applied.pageSize ||
    draft.minHR !== applied.minHR ||
    draft.maxHR !== applied.maxHR ||
    draft.minRBI !== applied.minRBI ||
    draft.maxRBI !== applied.maxRBI ||
    draft.minAVG !== applied.minAVG ||
    draft.maxAVG !== applied.maxAVG ||
    draft.minERA !== applied.minERA ||
    draft.maxERA !== applied.maxERA ||
    draft.minWins !== applied.minWins ||
    draft.maxWins !== applied.maxWins ||
    draft.minSO !== applied.minSO ||
    draft.maxSO !== applied.maxSO
  );
}

/**
 * Map a (possibly legacy/aliased) view mode to a canonical tab value. Legacy
 * aliases `batting`→`hitters` and `pitching`→`pitchers` are honored, and any
 * other value (`fielding`, unknown) falls back to `combined`. Exported so URL
 * hosts can normalize and rewrite the `view` query param to canonical form,
 * keeping the address bar in sync with the rendered tab (LS-7146 / PST-111).
 */
export function normalizeViewMode(
  mode: PlayerStatsViewMode,
): 'combined' | 'hitters' | 'pitchers' {
  if (mode === 'pitching' || mode === 'pitchers') return 'pitchers';
  if (mode === 'hitters' || mode === 'batting') return 'hitters';
  return 'combined';
}

/**
 * Enforce the documented minimum search length before a term reaches the applied
 * filter snapshot. The toolbar placeholder advertises "min 2 chars", but the
 * field previously committed any value — pressing Enter with a single character
 * fired the GraphQL query (PST-061 / LS-7127). Returns the term unchanged when it
 * meets {@link MIN_SEARCH_LENGTH} after trimming surrounding whitespace, or an
 * empty string otherwise so callers treat a sub-minimum entry as "no search".
 * Extracted as a pure function so the guard is unit-testable without mounting the
 * page shell.
 */
export function enforceSearchMinLength(search: string): string {
  return search.trim().length >= MIN_SEARCH_LENGTH ? search : '';
}

/**
 * Serialize a committed filter snapshot into the shareable relative URL.
 *
 * Reads the *applied* snapshot — the committed state that actually drives the
 * grid queries — never the uncommitted toolbar draft. This guarantees a shared
 * link always reflects what the sender currently sees on screen: typing a
 * search term without pressing Enter (or otherwise committing) must not leak
 * into the shared URL (LS-7131 / PST-071). Extracted as a pure function so the
 * serialization is unit-testable without mounting the page shell.
 *
 * The caller is responsible for prepending the origin — this stays free of
 * `window.location` so it remains safe on native.
 */
export function buildShareUrl(
  viewMode: 'combined' | 'hitters' | 'pitchers',
  filters: AppliedFilters,
  sortBy: string = DEFAULT_BATTING_SORT_BY,
  sortDir: 'asc' | 'desc' = DEFAULT_BATTING_SORT_DIR,
): string {
  const params = new URLSearchParams({
    view: viewMode,
    pageSize: String(filters.pageSize),
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.position !== 'All Positions') {
    params.set('position', filters.position);
  }
  if (filters.team !== 'All Teams') params.set('team', filters.team);
  if (filters.minHR > 0) params.set('minHomeRuns', String(filters.minHR));
  if (filters.maxHR < HR_MAX) params.set('maxHomeRuns', String(filters.maxHR));
  if (filters.minRBI > 0) params.set('minRBI', String(filters.minRBI));
  if (filters.maxRBI < RBI_MAX) params.set('maxRBI', String(filters.maxRBI));
  if (filters.minAVG > 0) {
    params.set('minBattingAvg', filters.minAVG.toFixed(3));
  }
  if (filters.maxAVG < AVG_MAX) {
    params.set('maxBattingAvg', filters.maxAVG.toFixed(3));
  }
  if (filters.minERA > 0) params.set('minERA', filters.minERA.toFixed(2));
  if (filters.maxERA < ERA_MAX_OFF) {
    params.set('maxERA', filters.maxERA.toFixed(2));
  }
  if (filters.minWins > 0) params.set('minWins', String(filters.minWins));
  if (filters.maxWins < WINS_MAX)
    params.set('maxWins', String(filters.maxWins));
  if (filters.minSO > 0) params.set('minStrikeouts', String(filters.minSO));
  if (filters.maxSO < SO_MAX)
    params.set('maxStrikeouts', String(filters.maxSO));
  // Persist the active batting sort so the shared link restores it (LS-7115);
  // the default sort is omitted to keep the URL clean.
  const sortFilter = battingSortFilter(sortBy, sortDir);
  if (sortFilter.sortBy) {
    params.set('sortBy', sortFilter.sortBy);
    params.set('sortDir', sortFilter.sortDir ?? DEFAULT_BATTING_SORT_DIR);
  }
  return `/players/stats?${params.toString()}`;
}

/**
 * Rows-per-page options available for the given view mode (PST-030 / LS-7117).
 * 'combined' renders both grids at once, so the 100-row option is withheld there to
 * keep peak un-virtualized row count bounded; single-grid modes keep the full set.
 * Premium subscribers additionally see 250/500 options in single-grid modes
 * (PST-032 / LS-7119) — combined mode still caps at 50 regardless of tier.
 * Pure so the cap is unit-testable without mounting the Tamagui shell.
 */
export function pageSizeOptionsForViewMode(
  viewMode: 'combined' | 'hitters' | 'pitchers',
  isPremium = false,
): number[] {
  if (viewMode === 'combined') {
    return PAGE_SIZE_OPTIONS.filter((n) => n <= COMBINED_MAX_PAGE_SIZE);
  }
  return isPremium
    ? [...PAGE_SIZE_OPTIONS, ...PREMIUM_PAGE_SIZE_OPTIONS]
    : [...PAGE_SIZE_OPTIONS];
}

/**
 * Clamp a requested page size to what the given view mode allows (PST-030 / LS-7117).
 * In 'combined' view anything above COMBINED_MAX_PAGE_SIZE is reduced to the cap so a
 * carried-over or deep-linked pageSize=100 cannot paint 200 rows across both grids;
 * single-grid modes pass the value through unchanged. Pure for unit-testing.
 */
export function clampPageSizeForViewMode(
  pageSize: number,
  viewMode: 'combined' | 'hitters' | 'pitchers',
): number {
  return viewMode === 'combined' && pageSize > COMBINED_MAX_PAGE_SIZE
    ? COMBINED_MAX_PAGE_SIZE
    : pageSize;
}

/**
 * Player Statistics Page Component
 *
 * Editorial header with Combined/Hitters/Pitchers view tabs, unified toolbar
 * with search + position filter, advanced stat range sliders, and separate
 * batting/pitching grids wired to the GraphQL API.
 *
 * Design: nostalgic, sporty, professional (see AGENTS.md § Design Context). Tables are the product;
 * chrome is restrained so numbers read like a Sunday paper box score.
 */
export function PlayerStatsPage({
  title = 'Player Statistics',
  initialViewMode = 'combined',
  initialFilters = {},
  initialPageSize = 25,
  showHeader = true,
  showActions = true,
  canExport = true,
  canCustomizeColumns = true,
  exportFormats = ['json'],
  isPremiumPageSize = false,
  statsFormat = 'expanded',
  initialVisibleColumns = null,
  onVisibleColumnsChange,
  state,
  onRetry,
  onClearFilters,
  onPlayerDetails,
  onExport,
  onVisibleRowsChange,
  onShare,
  onFiltersChange,
  showAvailabilityFilter = false,
  rosteredPlayerIds,
}: PlayerStatsPageProps) {
  // ── View mode ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'combined' | 'hitters' | 'pitchers'>(
    () => normalizeViewMode(initialViewMode),
  );

  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'free_agents' | 'rostered'
  >(initialFilters.availabilityFilter ?? 'all');

  // ── Batting sort state (persisted to URL) ──────────────────────
  // Seeded from the initial filters (i.e. the URL) so arriving from a link like
  // "rookies sorted by AVG" loads sorted by AVG instead of the hard-coded HR
  // default. The grid owns its in-session sort and writes back through
  // onSortChange, which updates this state and round-trips to the URL (LS-7115).
  const [sortBy, setSortBy] = useState(
    () => initialFilters.sortBy ?? DEFAULT_BATTING_SORT_BY,
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => initialFilters.sortDir ?? DEFAULT_BATTING_SORT_DIR,
  );

  // ── Toolbar draft state (not applied until applyFilters()) ─────
  const [search, setSearch] = useState(initialFilters.searchTerm ?? '');
  const [position, setPosition] = useState(
    initialFilters.position ?? 'All Positions',
  );
  const [team, setTeam] = useState(initialFilters.team ?? 'All Teams');
  // Clamp the initial page size for combined view so a deep-linked view=combined
  // & pageSize=100 cannot mount 200 rows across both grids (PST-030 / LS-7117).
  const [pageSize, setPageSize] = useState(() =>
    clampPageSizeForViewMode(
      initialPageSize,
      normalizeViewMode(initialViewMode),
    ),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Column visibility (LS-7105) ────────────────────────────────
  // `null` = no explicit selection (use the statsFormat preset); an array = the
  // explicit set of stat-column keys to show. The picker panel toggles open.
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(() =>
    initialVisibleColumns ? [...initialVisibleColumns] : null,
  );

  // ── Advanced filter draft state ────────────────────────────────
  const [minHR, setMinHR] = useState(initialFilters.minHomeRuns ?? 0);
  const [maxHR, setMaxHR] = useState(initialFilters.maxHomeRuns ?? HR_MAX);
  const [minRBI, setMinRBI] = useState(initialFilters.minRBI ?? 0);
  const [maxRBI, setMaxRBI] = useState(initialFilters.maxRBI ?? RBI_MAX);
  const [minAVG, setMinAVG] = useState(initialFilters.minBattingAvg ?? 0);
  const [maxAVG, setMaxAVG] = useState(initialFilters.maxBattingAvg ?? AVG_MAX);
  const [minERA, setMinERA] = useState(initialFilters.minERA ?? 0);
  const [maxERA, setMaxERA] = useState(initialFilters.maxERA ?? ERA_MAX_OFF);
  const [minWins, setMinWins] = useState(initialFilters.minWins ?? 0);
  const [maxWins, setMaxWins] = useState(initialFilters.maxWins ?? WINS_MAX);
  const [minSO, setMinSO] = useState(initialFilters.minStrikeouts ?? 0);
  const [maxSO, setMaxSO] = useState(initialFilters.maxStrikeouts ?? SO_MAX);

  // ── Applied filters — committed snapshot that drives grid queries ─
  // Separate draft vs. applied state avoids mid-input query flicker and
  // removes the need for eslint-disable on useMemo dependency arrays.
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(() => ({
    search: enforceSearchMinLength(initialFilters.searchTerm ?? ''),
    position: initialFilters.position ?? 'All Positions',
    team: initialFilters.team ?? 'All Teams',
    pageSize: clampPageSizeForViewMode(
      initialPageSize,
      normalizeViewMode(initialViewMode),
    ),
    minHR: initialFilters.minHomeRuns ?? 0,
    maxHR: initialFilters.maxHomeRuns ?? HR_MAX,
    minRBI: initialFilters.minRBI ?? 0,
    maxRBI: initialFilters.maxRBI ?? RBI_MAX,
    minAVG: initialFilters.minBattingAvg ?? 0,
    maxAVG: initialFilters.maxBattingAvg ?? AVG_MAX,
    minERA: initialFilters.minERA ?? 0,
    maxERA: initialFilters.maxERA ?? ERA_MAX_OFF,
    minWins: initialFilters.minWins ?? 0,
    maxWins: initialFilters.maxWins ?? WINS_MAX,
    minSO: initialFilters.minStrikeouts ?? 0,
    maxSO: initialFilters.maxStrikeouts ?? SO_MAX,
  }));

  // Single draft snapshot, mirroring the committed AppliedFilters shape. Every
  // toolbar control writes only to draft state; applyFilters() commits the whole
  // snapshot at once so all controls share one apply model (LS-7126).
  const draftFilters = useMemo<AppliedFilters>(
    () => ({
      search,
      position,
      team,
      pageSize,
      minHR,
      maxHR,
      minRBI,
      maxRBI,
      minAVG,
      maxAVG,
      minERA,
      maxERA,
      minWins,
      maxWins,
      minSO,
      maxSO,
    }),
    [
      search,
      position,
      team,
      pageSize,
      minHR,
      maxHR,
      minRBI,
      maxRBI,
      minAVG,
      maxAVG,
      minERA,
      maxERA,
      minWins,
      maxWins,
      minSO,
      maxSO,
    ],
  );

  // The snapshot that Apply actually commits. Enforces the documented minimum
  // search length so a single-character term never fires the query on submit;
  // sub-minimum entries commit as "no search" while the other filters still apply
  // (PST-061 / LS-7127). Used for both the commit and the dirty-check so a
  // sub-minimum search does not leave Apply stuck "enabled" after a commit.
  const committedDraft = useMemo<AppliedFilters>(
    () => ({
      ...draftFilters,
      search: enforceSearchMinLength(draftFilters.search),
    }),
    [draftFilters],
  );

  const applyFilters = useCallback(() => {
    setAppliedFilters(committedDraft);
  }, [committedDraft]);

  // Enables/emphasizes the Apply button only when there are uncommitted edits.
  const hasPendingChanges = useMemo(
    () => hasPendingFilterChanges(committedDraft, appliedFilters),
    [committedDraft, appliedFilters],
  );

  // Switching view modes must re-clamp the page size: entering 'combined' with a
  // carried-over pageSize=100 would paint 200 rows across both grids (PST-030 /
  // LS-7117). Clamp both the draft and the committed snapshot so the active grids
  // shrink immediately, without waiting for the next applyFilters() commit.
  const handleViewModeChange = useCallback(
    (next: 'combined' | 'hitters' | 'pitchers') => {
      setViewMode(next);
      setPageSize((cur) => clampPageSizeForViewMode(cur, next));
      setAppliedFilters((cur) => {
        const clamped = clampPageSizeForViewMode(cur.pageSize, next);
        return clamped === cur.pageSize ? cur : { ...cur, pageSize: clamped };
      });
    },
    [],
  );

  // Stringify-based key forces grid unmount/remount on each filter commit,
  // which triggers a fresh GraphQL query with the new initialParams.
  const appliedKey = JSON.stringify(appliedFilters);
  const battingKey = `batting-${appliedKey}`;
  const pitchingKey = `pitching-${appliedKey}`;

  // ── Derived params passed to data grids ───────────────────────
  const battingParams = useMemo(
    () => ({
      first: appliedFilters.pageSize,
      // Sort comes from URL-seeded state (LS-7115), not a hard-coded HR default,
      // so deep links and reloads honor the user's chosen sort. The grid keeps
      // its own in-session sort and notifies us via onSortChange.
      orderBy: sortBy,
      orderDirection: sortDir,
      minGames: 0,
      searchTerm: appliedFilters.search || undefined,
      position:
        appliedFilters.position !== 'All Positions'
          ? appliedFilters.position
          : undefined,
      team:
        appliedFilters.team !== 'All Teams' ? appliedFilters.team : undefined,
      minHomeRuns: appliedFilters.minHR > 0 ? appliedFilters.minHR : undefined,
      maxHomeRuns:
        appliedFilters.maxHR < HR_MAX ? appliedFilters.maxHR : undefined,
      minRBI: appliedFilters.minRBI > 0 ? appliedFilters.minRBI : undefined,
      maxRBI:
        appliedFilters.maxRBI < RBI_MAX ? appliedFilters.maxRBI : undefined,
      minBattingAvg:
        appliedFilters.minAVG > 0 ? appliedFilters.minAVG : undefined,
      maxBattingAvg:
        appliedFilters.maxAVG < AVG_MAX ? appliedFilters.maxAVG : undefined,
      // The Hitters tab must exclude pure pitchers from the batting grid; the
      // tab flags alone only toggle grid visibility (LS-7145). Two-way players
      // (e.g. Ohtani) retain a non-pitching eligible position and so remain
      // visible. Combined keeps everyone (playerType left undefined).
      playerType: battingPlayerTypeForViewMode(viewMode),
    }),
    [appliedFilters, viewMode, sortBy, sortDir],
  );

  // Persist the grid's sort selection so onFiltersChange mirrors it to the URL.
  // Maps the GraphQL field straight back, so it round-trips into orderBy on
  // reload (LS-7115).
  const handleBattingSortChange = useCallback(
    (nextSortBy: string, nextSortDir: 'asc' | 'desc') => {
      setSortBy(nextSortBy);
      setSortDir(nextSortDir);
    },
    [],
  );

  const pitchingParams = useMemo(
    () => ({
      limit: appliedFilters.pageSize,
      offset: 0,
      orderBy: 'wins',
      orderDirection: 'desc' as const,
      minGames: 0,
      searchTerm: appliedFilters.search || undefined,
      position:
        appliedFilters.position !== 'All Positions'
          ? appliedFilters.position
          : undefined,
      team:
        appliedFilters.team !== 'All Teams' ? appliedFilters.team : undefined,
      minWins: appliedFilters.minWins > 0 ? appliedFilters.minWins : undefined,
      maxWins:
        appliedFilters.maxWins < WINS_MAX ? appliedFilters.maxWins : undefined,
      minStrikeouts:
        appliedFilters.minSO > 0 ? appliedFilters.minSO : undefined,
      maxStrikeouts:
        appliedFilters.maxSO < SO_MAX ? appliedFilters.maxSO : undefined,
      minERA: appliedFilters.minERA > 0 ? appliedFilters.minERA : undefined,
      maxERA:
        appliedFilters.maxERA < ERA_MAX_OFF ? appliedFilters.maxERA : undefined,
    }),
    [appliedFilters],
  );

  // ── Notify host of applied filter changes (URL round-trip) ───
  useEffect(() => {
    if (!onFiltersChange) return;
    const filters: PlayerStatsFilters = {};
    if (appliedFilters.search) filters.searchTerm = appliedFilters.search;
    if (appliedFilters.position !== 'All Positions') {
      filters.position = appliedFilters.position;
    }
    if (appliedFilters.team !== 'All Teams') {
      filters.team = appliedFilters.team;
    }
    if (appliedFilters.minHR > 0) filters.minHomeRuns = appliedFilters.minHR;
    if (appliedFilters.maxHR < HR_MAX)
      filters.maxHomeRuns = appliedFilters.maxHR;
    if (appliedFilters.minRBI > 0) filters.minRBI = appliedFilters.minRBI;
    if (appliedFilters.maxRBI < RBI_MAX) filters.maxRBI = appliedFilters.maxRBI;
    if (appliedFilters.minAVG > 0) {
      filters.minBattingAvg = appliedFilters.minAVG;
    }
    if (appliedFilters.maxAVG < AVG_MAX) {
      filters.maxBattingAvg = appliedFilters.maxAVG;
    }
    if (appliedFilters.minERA > 0) filters.minERA = appliedFilters.minERA;
    if (appliedFilters.maxERA < ERA_MAX_OFF) {
      filters.maxERA = appliedFilters.maxERA;
    }
    if (appliedFilters.minWins > 0) filters.minWins = appliedFilters.minWins;
    if (appliedFilters.maxWins < WINS_MAX)
      filters.maxWins = appliedFilters.maxWins;
    if (appliedFilters.minSO > 0) filters.minStrikeouts = appliedFilters.minSO;
    if (appliedFilters.maxSO < SO_MAX)
      filters.maxStrikeouts = appliedFilters.maxSO;
    // Persist the batting sort when it differs from the default so a shared link
    // restores the chosen sort (LS-7115). Default sort is omitted to keep URLs
    // clean.
    Object.assign(filters, battingSortFilter(sortBy, sortDir));
    onFiltersChange({
      viewMode,
      pageSize: appliedFilters.pageSize,
      filters,
    });
  }, [appliedFilters, viewMode, sortBy, sortDir, onFiltersChange]);

  // ── Player click handlers ──────────────────────────────────────
  const handleBattingPlayerClick = useCallback(
    (player: PlayerCareerStats) => {
      if (!onPlayerDetails) return;
      onPlayerDetails({
        id: player.playerId,
        name: player.displayName || `Player ${player.playerId}`,
      });
    },
    [onPlayerDetails],
  );

  const handlePitchingPlayerClick = useCallback(
    (player: CareerPitchingFragment) => {
      if (!onPlayerDetails) return;
      const firstName = player.player?.firstName;
      const lastName = player.player?.lastName;
      onPlayerDetails({
        id: player.playerId || 0,
        name:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : `Player ${player.playerId}`,
      });
    },
    [onPlayerDetails],
  );

  // ── Export / share ─────────────────────────────────────────────
  // Latest displayed rows from each grid, captured via the grids' onDataLoaded
  // callback. Held in refs (not state) because they feed the export through a
  // host callback and must not trigger re-renders of the page on every grid
  // fetch (PST-011 / LS-7109).
  const battingRowsRef = useRef<readonly PlayerCareerStats[]>([]);
  const pitchingRowsRef = useRef<readonly CareerPitchingFragment[]>([]);

  // Surface the rows for whichever tab(s) are visible to the host so it can
  // serialize the actual result set, not just the filter spec. A hidden grid is
  // unmounted, so its ref may hold stale rows — gate on the active view.
  const emitVisibleRows = useCallback(() => {
    if (!onVisibleRowsChange) return;
    const isBattingVisible = viewMode === 'combined' || viewMode === 'hitters';
    const isPitchingVisible =
      viewMode === 'combined' || viewMode === 'pitchers';
    onVisibleRowsChange({
      batting: isBattingVisible ? battingRowsRef.current : [],
      pitching: isPitchingVisible ? pitchingRowsRef.current : [],
    });
  }, [onVisibleRowsChange, viewMode]);

  const handleBattingDataLoaded = useCallback(
    (rows: readonly PlayerCareerStats[]) => {
      battingRowsRef.current = rows;
      emitVisibleRows();
    },
    [emitVisibleRows],
  );
  const handlePitchingDataLoaded = useCallback(
    (rows: readonly CareerPitchingFragment[]) => {
      pitchingRowsRef.current = rows;
      emitVisibleRows();
    },
    [emitVisibleRows],
  );

  // Re-emit when the visible tab changes so the host's cached rows reflect the
  // active tab even when no new grid data arrives (PST-011 / LS-7109).
  useEffect(() => {
    emitVisibleRows();
  }, [emitVisibleRows]);

  const handleExportFormat = useCallback(
    (format: ExportFormat) => {
      // Export is a premium capability (PST-010 / LS-7108). Bail out when the host
      // has not granted it: the page-level PremiumGate only blurs content and
      // disables pointer events, which still leaves a keyboard-activation path to
      // this handler. Guarding here ensures the export never runs for a non-entitled
      // viewer regardless of how the (now hidden) button was reached.
      if (!onExport || !canExport) return;
      const filters: PlayerStatsFilters = {
        searchTerm: search || undefined,
        position: position !== 'All Positions' ? position : undefined,
        team: team !== 'All Teams' ? team : undefined,
        minHomeRuns: minHR > 0 ? minHR : undefined,
        maxHomeRuns: maxHR < HR_MAX ? maxHR : undefined,
        minRBI: minRBI > 0 ? minRBI : undefined,
        maxRBI: maxRBI < RBI_MAX ? maxRBI : undefined,
        minBattingAvg: minAVG > 0 ? minAVG : undefined,
        maxBattingAvg: maxAVG < AVG_MAX ? maxAVG : undefined,
        minERA: minERA > 0 ? minERA : undefined,
        maxERA: maxERA < ERA_MAX_OFF ? maxERA : undefined,
        minWins: minWins > 0 ? minWins : undefined,
        maxWins: maxWins < WINS_MAX ? maxWins : undefined,
        minStrikeouts: minSO > 0 ? minSO : undefined,
        maxStrikeouts: maxSO < SO_MAX ? maxSO : undefined,
      };
      onExport(filters, viewMode, format);
    },
    [
      onExport,
      canExport,
      search,
      position,
      team,
      minHR,
      maxHR,
      minRBI,
      maxRBI,
      minAVG,
      maxAVG,
      minERA,
      maxERA,
      minWins,
      maxWins,
      minSO,
      maxSO,
      viewMode,
    ],
  );

  const handleShare = useCallback(() => {
    if (!onShare) return;
    // Serialize the *applied* snapshot (what the grid is actually showing), not
    // the uncommitted toolbar draft, so the shared link matches what the sender
    // sees on screen. Sharing draft state leaked un-committed edits — e.g. a
    // typed-but-not-entered search term — into the recipient's view (LS-7131).
    // The active batting sort is threaded through so the link restores it too
    // (LS-7115).
    onShare(buildShareUrl(viewMode, appliedFilters, sortBy, sortDir));
  }, [onShare, viewMode, appliedFilters, sortBy, sortDir]);

  // ── Visibility flags ───────────────────────────────────────────
  const showBatting = viewMode === 'combined' || viewMode === 'hitters';
  const showPitching = viewMode === 'combined' || viewMode === 'pitchers';

  // Rows-per-page options narrow to exclude 100 in 'combined' view (PST-030 /
  // LS-7117), where both grids render at once and 100 would paint 200 rows.
  // Premium users additionally see 250/500 in single-grid modes (PST-032 / LS-7119).
  const pageSizeOptions = pageSizeOptionsForViewMode(
    viewMode,
    isPremiumPageSize,
  );

  // ── Column picker derived state (LS-7105) ──────────────────────
  // Groups for the currently-visible grids drive the picker list; the seed for
  // an explicit selection spans BOTH grids so switching tabs never strands a
  // grid with an empty column set.
  const activeColumnGroups = useMemo<readonly ColumnGroup[]>(() => {
    const groups: ColumnGroup[] = [];
    if (showBatting) {
      groups.push({
        columns: CAREER_STATS_COLUMNS,
        nameKey: BATTING_NAME_COLUMN_KEY,
      });
    }
    if (showPitching) {
      groups.push({
        columns: PITCHING_STATS_COLUMNS,
        nameKey: PITCHING_NAME_COLUMN_KEY,
      });
    }
    return groups;
  }, [showBatting, showPitching]);

  const toggleableColumns = useMemo<ToggleableColumn[]>(
    () =>
      buildToggleableColumns(
        activeColumnGroups as ReadonlyArray<
          ColumnGroup<{
            key: string;
            label: string;
            priority: 'high' | 'medium' | 'low';
          }>
        >,
      ),
    [activeColumnGroups],
  );

  // Keys the statsFormat preset shows for the active view — drives the picker
  // checkbox state when there is no explicit selection yet.
  const activePresetKeys = useMemo(
    () => presetVisibleKeys(activeColumnGroups, statsFormat),
    [activeColumnGroups, statsFormat],
  );

  // Seed spanning BOTH grids — materialized into the explicit selection on the
  // first toggle so the persisted set stays complete across tab switches.
  const fullPresetKeys = useMemo(
    () => presetVisibleKeys(STATS_COLUMN_GROUPS, statsFormat),
    [statsFormat],
  );

  // The set actually reflected by the checkboxes: the explicit selection, or the
  // preset baseline when none exists.
  const effectiveVisibleKeys = useMemo(
    () => new Set(visibleColumns ?? activePresetKeys),
    [visibleColumns, activePresetKeys],
  );

  const isColumnCustomized = visibleColumns !== null;

  const handleToggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns((current) => {
        const next = toggleColumnKey(current, key, fullPresetKeys);
        onVisibleColumnsChange?.(next);
        return next;
      });
    },
    [fullPresetKeys, onVisibleColumnsChange],
  );

  const handleResetColumns = useCallback(() => {
    setVisibleColumns(null);
    onVisibleColumnsChange?.(null);
  }, [onVisibleColumnsChange]);

  // Explicit selection passed down to the grids (undefined ⇒ statsFormat preset).
  const gridVisibleColumns = visibleColumns ?? undefined;

  // ── URL preview — matches the URL params that apps/web persists ─
  const urlPreview = useMemo(() => {
    const params: string[] = [`view=${viewMode}`, `pageSize=${pageSize}`];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (position !== 'All Positions')
      params.push(`position=${encodeURIComponent(position)}`);
    if (team !== 'All Teams') params.push(`team=${encodeURIComponent(team)}`);
    if (minHR > 0) params.push(`minHomeRuns=${minHR}`);
    if (maxHR < HR_MAX) params.push(`maxHomeRuns=${maxHR}`);
    if (minRBI > 0) params.push(`minRBI=${minRBI}`);
    if (maxRBI < RBI_MAX) params.push(`maxRBI=${maxRBI}`);
    if (minAVG > 0) params.push(`minBattingAvg=${minAVG.toFixed(3)}`);
    if (maxAVG < AVG_MAX) params.push(`maxBattingAvg=${maxAVG.toFixed(3)}`);
    if (minERA > 0) params.push(`minERA=${minERA.toFixed(2)}`);
    if (maxERA < ERA_MAX_OFF) params.push(`maxERA=${maxERA.toFixed(2)}`);
    if (minWins > 0) params.push(`minWins=${minWins}`);
    if (maxWins < WINS_MAX) params.push(`maxWins=${maxWins}`);
    if (minSO > 0) params.push(`minStrikeouts=${minSO}`);
    if (maxSO < SO_MAX) params.push(`maxStrikeouts=${maxSO}`);
    const sortFilter = battingSortFilter(sortBy, sortDir);
    if (sortFilter.sortBy) {
      params.push(`sortBy=${sortFilter.sortBy}`);
      params.push(`sortDir=${sortFilter.sortDir}`);
    }
    return `/players/stats?${params.join('&')}`;
  }, [
    viewMode,
    pageSize,
    search,
    position,
    team,
    minHR,
    maxHR,
    minRBI,
    maxRBI,
    minAVG,
    maxAVG,
    minERA,
    maxERA,
    minWins,
    maxWins,
    minSO,
    maxSO,
    sortBy,
    sortDir,
  ]);

  return (
    <YStack flex={1} style={csp({ backgroundColor: BG_PAGE })}>
      {/* ── Web-only CSS: crossfade tab transitions, slider track, state shimmer ── */}
      {Platform.OS === 'web' && (
        <style>{`
          @keyframes ps-fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes ps-advSlide {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ps-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
          @media (prefers-reduced-motion: no-preference) {
            .ps-tabContent { animation: ps-fadeIn 140ms ease forwards; }
            .ps-adv-panel { animation: ps-advSlide 180ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ps-adv-panel { animation: none; }
          }
          .ps-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px;
            background: linear-gradient(to right, ${BRAND_GOLD} 0%, ${BRAND_GOLD} var(--pct,0%), rgba(255,255,255,0.08) var(--pct,0%), rgba(255,255,255,0.08) 100%);
            border-radius: 9999px; outline: 0; cursor: pointer; }
          .ps-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px;
            border-radius: 50%; background: ${BRAND_GOLD}; border: 2px solid ${BG_PAGE}; cursor: pointer; }
          .ps-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%;
            background: ${BRAND_GOLD}; border: 2px solid ${BG_PAGE}; cursor: pointer; }
          .ps-select-native { appearance: none; background: transparent; border: 0; outline: 0;
            color: ${TEXT_PRIMARY}; font-family: ${FONT_BODY}; font-size: 14px; padding: 0; cursor: pointer; width: 100%; }
          .ps-select-native option { background: ${SURFACE_PANEL}; color: ${TEXT_PRIMARY}; }
          .ps-sk-bar { display: inline-block; height: 10px; border-radius: 3px;
            background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.04) 100%);
            background-size: 400px 100%; animation: ps-shimmer 1.4s linear infinite; }
          @media (prefers-reduced-motion: reduce) {
            .ps-tabContent { animation: none; }
            .ps-sk-bar { animation: none; background: rgba(255,255,255,0.08); }
          }
          .ps-toolbar { grid-template-columns: minmax(240px, 1.5fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) auto; }
          @media (max-width: 640px) {
            .ps-toolbar { grid-template-columns: 1fr; }
            .ps-toolbar > * { width: 100%; }
          }
          .ps-adv-grid { grid-template-columns: repeat(3, 1fr); }
          @media (max-width: 640px) {
            .ps-adv-grid { grid-template-columns: 1fr; }
          }
          .ps-col-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); column-gap: 20px; }
        `}</style>
      )}

      {/* ── Page header ───────────────────────────────────────────── */}
      {showHeader && (
        <YStack
          style={csp({
            maxWidth: 1280,
            width: '100%',
            padding: '32px 24px 0',
            margin: '0 auto',
          })}
        >
          <XStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="$6"
            flexWrap="wrap"
          >
            {/* Left: editorial copy */}
            <YStack gap="$2" style={csp({ flex: 1, minWidth: 240 })}>
              <Text
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                })}
              >
                Players · League Archive
              </Text>
              <Text
                tag="h1"
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '800',
                  fontSize:
                    Platform.OS === 'web'
                      ? ('clamp(40px, 4.4vw, 60px)' as unknown as number)
                      : 48,
                  // String bypasses Tamagui's numeric→px conversion (lineHeight: 1 → "1px").
                  // Native uses absolute px; 48 = fontSize * 1 ratio.
                  // See .agents/skills/standards/references/tamagui-web-pitfalls.md
                  lineHeight:
                    Platform.OS === 'web' ? ('1' as unknown as number) : 48,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  margin: 0,
                })}
              >
                {title}
              </Text>
              <Text
                style={csp({
                  fontFamily: FONT_BODY,
                  fontSize: 17,
                  lineHeight:
                    Platform.OS === 'web' ? ('1.55' as unknown as number) : 26,
                  color: FG3,
                  maxWidth: '64ch',
                  margin: 0,
                })}
              >
                Every qualified hitter and pitcher across the archive. Draft
                legends, compare seasons, and build your dynasty on the numbers
                that actually happened.
              </Text>
              {/* URL preview — shows the shareable query string */}
              <XStack
                alignItems="center"
                gap="$2"
                style={csp({
                  marginTop: 14,
                  padding: '8px 14px',
                  background: 'rgba(13,21,38,0.6)',
                  border: `1px solid ${OUTLINE_SUBTLE}`,
                  borderRadius: 8,
                  maxWidth: '100%',
                  overflow: 'hidden',
                })}
              >
                <Text
                  style={csp({
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: FG4,
                    flexShrink: 0,
                  })}
                >
                  URL
                </Text>
                <Text
                  style={csp({
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    color: FG3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  })}
                  numberOfLines={1}
                >
                  {urlPreview}
                </Text>
              </XStack>
            </YStack>

            {/* Right: action buttons — only shown when showActions is true */}
            {showActions && (
              <XStack
                gap="$2"
                style={csp({ marginTop: Platform.OS === 'web' ? 8 : 0 })}
              >
                <Pressable
                  onPress={handleShare}
                  accessibilityRole="button"
                  accessibilityLabel="Share player statistics link"
                  style={GOLD_ACCENT_BUTTON_STYLE}
                >
                  {Platform.OS === 'web' && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={BRAND_GOLD_LIGHT}
                      strokeWidth="2"
                    >
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  )}
                  <Text style={GOLD_ACCENT_BUTTON_LABEL_STYLE}>Share</Text>
                </Pressable>
                {/* Export is premium-gated (PST-010 / LS-7108): only rendered when
                    the host grants the export capability. One button per format
                    in exportFormats (PST-014 / LS-7112). */}
                {canExport &&
                  exportFormats.map((fmt) => (
                    <Pressable
                      key={fmt}
                      onPress={() => handleExportFormat(fmt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Export player statistics as ${fmt.toUpperCase()}`}
                      style={GOLD_ACCENT_BUTTON_STYLE}
                    >
                      {Platform.OS === 'web' && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={BRAND_GOLD_LIGHT}
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      )}
                      <Text style={GOLD_ACCENT_BUTTON_LABEL_STYLE}>
                        Export {fmt.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
              </XStack>
            )}
          </XStack>
        </YStack>
      )}

      {/* ── Main content area ──────────────────────────────────────── */}
      <YStack
        flex={1}
        style={csp({
          maxWidth: 1280,
          width: '100%',
          padding: '24px 24px 96px',
          margin: '0 auto',
          gap: 24,
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        {/* ── View mode tabs: Combined / Hitters / Pitchers ─────────── */}
        {/* Pill cluster (BRAND_NAVY selected fill) per design `.sp-tabs`.    */}
        {/* MOTION: crossfade 140ms on tab switch; no layout shift.           */}
        <XStack
          role="tablist"
          accessibilityRole="tablist"
          aria-label="Player stats view mode"
          style={csp({
            alignSelf: 'flex-start',
            gap: 4,
            padding: 5,
            background: BG_PANEL,
            border: `1px solid ${STATS_BORDER}`,
            borderRadius: 9999,
          })}
        >
          {(
            [
              ['combined', 'Combined'],
              ['hitters', 'Hitters'],
              ['pitchers', 'Pitchers'],
            ] as const
          ).map(([id, label]) => {
            const selected = viewMode === id;
            return (
              <Pressable
                key={id}
                onPress={() => handleViewModeChange(id)}
                role="tab"
                accessibilityRole="tab"
                aria-selected={selected}
                accessibilityState={{ selected }}
                style={csp({
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 9999,
                  backgroundColor: selected ? BRAND_NAVY : 'transparent',
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: 'center',
                  alignItems: 'center',
                })}
              >
                <Text
                  style={csp({
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 12,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: selected ? '#FFFFFF' : FG3,
                  })}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </XStack>

        {/* ── Toolbar: search, position, page size, advanced ─────────── */}
        <XStack
          testID="filter-controls"
          className={Platform.OS === 'web' ? 'ps-toolbar' : undefined}
          style={csp({
            display: Platform.OS === 'web' ? 'grid' : 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 14,
            background: SURFACE_PANEL,
            border: `1px solid ${OUTLINE_SUBTLE}`,
            borderRadius: 16,
          })}
        >
          {/* Search */}
          <YStack
            style={csp({
              position: 'relative',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '0 12px 0 38px',
              minHeight: 44,
            })}
          >
            {Platform.OS === 'web' && (
              // pointerEvents: none — without it, mobile taps that land on the
              // icon are absorbed by the SVG instead of focusing the input,
              // which manifests as "can't type in the search field" (LS-4813).
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={FG3}
                strokeWidth="2"
                style={csp({
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                })}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={applyFilters}
              placeholder={`Search player name · min ${MIN_SEARCH_LENGTH} chars`}
              placeholderTextColor={FG4}
              style={csp({
                flex: 1,
                backgroundColor: 'transparent',
                color: TEXT_PRIMARY,
                fontFamily: FONT_BODY,
                fontSize: 14,
                paddingVertical: 8,
                borderWidth: 0,
                outlineWidth: 0,
              })}
            />
            {search ? (
              <Pressable
                onPress={() => {
                  setSearch('');
                  applyFilters();
                }}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                style={csp({
                  backgroundColor: 'transparent',
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                })}
              >
                <Text style={csp({ color: FG3, fontSize: 20, lineHeight: 20 })}>
                  ×
                </Text>
              </Pressable>
            ) : null}
          </YStack>

          {/* Position select */}
          <YStack
            style={csp({
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              })}
            >
              Position
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value);
                }}
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <NativeSelect
                label="Position"
                value={position}
                options={POSITIONS}
                onChange={setPosition}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={csp({
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                })}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Team select */}
          <YStack
            style={csp({
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              })}
            >
              Team
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                }}
              >
                {MLB_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <NativeSelect
                label="Team"
                value={team}
                options={MLB_TEAMS}
                onChange={setTeam}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={csp({
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                })}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Rows per page */}
          <YStack
            testID="page-size-select"
            style={csp({
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              })}
            >
              Rows
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                }}
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <NativeSelect
                label="Rows"
                value={String(pageSize)}
                options={pageSizeOptions.map(String)}
                onChange={(next) => {
                  setPageSize(Number(next));
                }}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={csp({
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                })}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Apply + Advanced + Columns actions — one grid cell so the toolbar's
              column template stays intact (the picker panel renders below). */}
          <XStack gap={8} alignItems="center" flexWrap="wrap">
            {/* Apply — the single explicit commit affordance for the unified
                draft model (LS-7126). Disabled until a control has uncommitted
                edits; Enter in the search box and clearing it remain shortcuts
                that commit the same full draft snapshot. */}
            <Pressable
              testID="apply-filters-button"
              onPress={applyFilters}
              disabled={!hasPendingChanges}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
              accessibilityState={{ disabled: !hasPendingChanges }}
              style={csp({
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: hasPendingChanges
                  ? withAlpha(BRAND_GOLD, 0.5)
                  : OUTLINE_DEFAULT,
                backgroundColor: hasPendingChanges
                  ? withAlpha(BRAND_GOLD, 0.12)
                  : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 44,
                opacity: hasPendingChanges ? 1 : 0.55,
              })}
            >
              <Text
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: hasPendingChanges ? BRAND_GOLD_LIGHT : FG3,
                  whiteSpace: 'nowrap',
                })}
              >
                Apply
              </Text>
            </Pressable>
            {/* Advanced toggle */}
            <Pressable
              onPress={() => setAdvancedOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              style={csp({
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: advancedOpen ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT,
                backgroundColor: advancedOpen
                  ? 'rgba(27,58,92,0.35)'
                  : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
              })}
            >
              {Platform.OS === 'web' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={advancedOpen ? TEXT_PRIMARY : FG3}
                  strokeWidth="2"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              )}
              <Text
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: advancedOpen ? TEXT_PRIMARY : FG3,
                  whiteSpace: 'nowrap',
                })}
              >
                Advanced
              </Text>
              <Text style={csp({ fontSize: 10, color: FG3 })}>
                {advancedOpen ? '▴' : '▾'}
              </Text>
            </Pressable>

            {/* Columns toggle — premium-gated (PST-003 / LS-7107); hidden for free users */}
            {canCustomizeColumns && (
              <Pressable
                onPress={() => setColumnsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Toggle column visibility"
                accessibilityState={{ expanded: columnsOpen }}
                testID="column-picker-toggle"
                style={csp({
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: columnsOpen
                    ? BRAND_NAVY_LIGHT
                    : isColumnCustomized
                      ? withAlpha(BRAND_GOLD, 0.5)
                      : OUTLINE_DEFAULT,
                  backgroundColor: columnsOpen
                    ? 'rgba(27,58,92,0.35)'
                    : isColumnCustomized
                      ? withAlpha(BRAND_GOLD, 0.08)
                      : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                })}
              >
                {Platform.OS === 'web' && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={columnsOpen ? TEXT_PRIMARY : FG3}
                    strokeWidth="2"
                  >
                    <line x1="3" y1="3" x2="3" y2="21" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                    <line x1="21" y1="3" x2="21" y2="21" />
                  </svg>
                )}
                <Text
                  style={csp({
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: columnsOpen ? TEXT_PRIMARY : FG3,
                    whiteSpace: 'nowrap',
                  })}
                >
                  Columns
                </Text>
                <Text style={csp({ fontSize: 10, color: FG3 })}>
                  {columnsOpen ? '▴' : '▾'}
                </Text>
              </Pressable>
            )}
          </XStack>
        </XStack>

        {/* ── Column visibility picker (premium-only, PST-003 / LS-7107) ─ */}
        {canCustomizeColumns && columnsOpen && (
          <ColumnPickerPanel
            columns={toggleableColumns}
            visibleKeys={effectiveVisibleKeys}
            customized={isColumnCustomized}
            onToggle={handleToggleColumn}
            onReset={handleResetColumns}
          />
        )}

        {/* ── Availability filter ────────────────────────────────────── */}
        {showAvailabilityFilter && (
          <XStack
            gap={6}
            alignItems="center"
            flexWrap="wrap"
            style={csp({ paddingTop: 4 })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: FG3,
                whiteSpace: 'nowrap',
              })}
            >
              Availability
            </Text>
            {(
              [
                ['all', 'All'],
                ['free_agents', 'Free Agents'],
                ['rostered', 'Rostered'],
              ] as const
            ).map(([value, label]) => {
              const active = availabilityFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setAvailabilityFilter(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={csp({
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: active ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT,
                    backgroundColor: active
                      ? 'rgba(27,58,92,0.45)'
                      : 'transparent',
                  })}
                >
                  <Text
                    style={csp({
                      fontFamily: FONT_BODY,
                      fontWeight: active ? '700' : '500',
                      fontSize: 13,
                      color: active ? TEXT_PRIMARY : FG3,
                    })}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </XStack>
        )}

        {/* ── Advanced filters panel ─────────────────────────────────── */}
        {/* MOTION: slide down 180ms ease-out when opened (web only) */}
        {advancedOpen && (
          <YStack
            className={Platform.OS === 'web' ? 'ps-adv-panel' : undefined}
            style={csp({
              padding: '18px 20px',
              background: SURFACE_CARD,
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 16,
              gap: 14,
            })}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                })}
              >
                Stat Ranges
              </Text>
              <Pressable
                onPress={() => {
                  setMinHR(0);
                  setMaxHR(HR_MAX);
                  setMinRBI(0);
                  setMaxRBI(RBI_MAX);
                  setMinAVG(0);
                  setMaxAVG(AVG_MAX);
                  setMinERA(0);
                  setMaxERA(ERA_MAX_OFF);
                  setMinWins(0);
                  setMaxWins(WINS_MAX);
                  setMinSO(0);
                  setMaxSO(SO_MAX);
                  applyFilters();
                }}
                accessibilityRole="button"
                style={csp({
                  backgroundColor: 'transparent',
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                })}
              >
                <Text
                  style={csp({
                    color: BRAND_GOLD_LIGHT,
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    fontWeight: '500',
                  })}
                >
                  Reset ranges
                </Text>
              </Pressable>
            </XStack>
            <XStack
              className={Platform.OS === 'web' ? 'ps-adv-grid' : undefined}
              style={csp({
                display: Platform.OS === 'web' ? 'grid' : 'flex',
                flexDirection: 'column',
                gap: 20,
              })}
            >
              <StatSlider
                label="Min Home Runs"
                value={minHR}
                min={0}
                max={HR_MAX}
                step={HR_STEP}
                format={(v) => String(v)}
                onChange={setMinHR}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max Home Runs"
                value={maxHR}
                min={0}
                max={HR_MAX}
                step={HR_STEP}
                format={(v) => (v >= HR_MAX ? '—' : String(v))}
                onChange={setMaxHR}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Min RBI"
                value={minRBI}
                min={0}
                max={RBI_MAX}
                step={RBI_STEP}
                format={(v) => String(v)}
                onChange={setMinRBI}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max RBI"
                value={maxRBI}
                min={0}
                max={RBI_MAX}
                step={RBI_STEP}
                format={(v) => (v >= RBI_MAX ? '—' : String(v))}
                onChange={setMaxRBI}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Min Batting Average"
                value={minAVG}
                min={0}
                max={AVG_MAX}
                step={AVG_STEP}
                format={(v) => v.toFixed(3).replace(/^0/, '')}
                onChange={setMinAVG}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max Batting Average"
                value={maxAVG}
                min={0}
                max={AVG_MAX}
                step={AVG_STEP}
                format={(v) =>
                  v >= AVG_MAX ? '—' : v.toFixed(3).replace(/^0/, '')
                }
                onChange={setMaxAVG}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Min ERA"
                value={minERA}
                min={0}
                max={ERA_MAX_OFF}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={setMinERA}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max ERA"
                value={maxERA}
                min={0}
                max={ERA_MAX_OFF}
                step={0.05}
                format={(v) => (v >= ERA_MAX_OFF ? '—' : v.toFixed(2))}
                onChange={setMaxERA}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Min Wins"
                value={minWins}
                min={0}
                max={WINS_MAX}
                step={WINS_STEP}
                format={(v) => String(v)}
                onChange={setMinWins}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max Wins"
                value={maxWins}
                min={0}
                max={WINS_MAX}
                step={WINS_STEP}
                format={(v) => (v >= WINS_MAX ? '—' : String(v))}
                onChange={setMaxWins}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Min Strikeouts"
                value={minSO}
                min={0}
                max={SO_MAX}
                step={SO_STEP}
                format={(v) => String(v)}
                onChange={setMinSO}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max Strikeouts"
                value={maxSO}
                min={0}
                max={SO_MAX}
                step={SO_STEP}
                format={(v) => (v >= SO_MAX ? '—' : String(v))}
                onChange={setMaxSO}
                onCommit={applyFilters}
              />
            </XStack>
          </YStack>
        )}

        {/* ── ARIA live region: announces shell-level state changes ─── */}
        {Platform.OS === 'web' && (
          <div
            role="status"
            aria-live="polite"
            style={csp({
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
            })}
          >
            {state ? STATE_ANNOUNCEMENTS[state] : ''}
          </div>
        )}

        {/* ── Content: state card OR populated data grid ────────────── */}
        {state === 'loading' ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : state === 'error' ? (
          <ErrorCard onRetry={onRetry} />
        ) : state === 'empty' ? (
          <EmptyCard
            onClear={createClearFiltersHandler(
              {
                setSearch,
                setPosition,
                setTeam,
                setMinHR,
                setMaxHR,
                setMinRBI,
                setMaxRBI,
                setMinAVG,
                setMaxAVG,
                setMinERA,
                setMaxERA,
                setMinWins,
                setMaxWins,
                setMinSO,
                setMaxSO,
              },
              applyFilters,
              onClearFilters,
            )}
          />
        ) : (
          <>
            {/* ── Batting table ─────────────────────────────────────── */}
            {showBatting && (
              <TabContentFade key={battingKey}>
                <PlayerStatsDataGrid
                  title="MLB Career Batting Leaders"
                  initialParams={battingParams}
                  onPlayerSelect={handleBattingPlayerClick}
                  onSortChange={handleBattingSortChange}
                  showSearch={false}
                  showFilters={false}
                  showSorting={true}
                  showPagination={true}
                  statsFormat={statsFormat}
                  visibleColumns={gridVisibleColumns}
                  availabilityFilter={
                    showAvailabilityFilter ? availabilityFilter : undefined
                  }
                  rosteredPlayerIds={
                    showAvailabilityFilter ? rosteredPlayerIds : undefined
                  }
                  onDataLoaded={handleBattingDataLoaded}
                />
              </TabContentFade>
            )}

            {/* ── Pitching table ────────────────────────────────────── */}
            {showPitching && (
              <TabContentFade key={pitchingKey}>
                <PitchingStatsDataGrid
                  title="MLB Career Pitching Leaders"
                  initialParams={pitchingParams}
                  onPlayerSelect={handlePitchingPlayerClick}
                  showSearch={false}
                  showFilters={false}
                  showSorting={true}
                  showPagination={true}
                  statsFormat={statsFormat}
                  visibleColumns={gridVisibleColumns}
                  availabilityFilter={
                    showAvailabilityFilter ? availabilityFilter : undefined
                  }
                  rosteredPlayerIds={
                    showAvailabilityFilter ? rosteredPlayerIds : undefined
                  }
                  onDataLoaded={handlePitchingDataLoaded}
                />
              </TabContentFade>
            )}
          </>
        )}
      </YStack>
    </YStack>
  );
}

// ── Tab content transition ──────────────────────────────────────────────────────

// Matches the web `ps-fadeIn` keyframe duration so both platforms crossfade alike.
const TAB_FADE_DURATION_MS = 140;

/**
 * Crossfades tab content (batting ⇄ pitching) when the active tab changes.
 * Web relies on the `ps-tabContent` CSS keyframe (which honors
 * prefers-reduced-motion); native has no CSS classes, so it fades opacity in
 * via the Animated API — and honors the OS "Reduce Motion" setting just as the
 * web `@media (prefers-reduced-motion: reduce)` rule does. Callers remount this
 * via a `key` to retrigger the fade.
 */
function TabContentFade({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const opacity = useRef(
    new Animated.Value(Platform.OS === 'web' ? 1 : 0),
  ).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    // Native-driver fade runs on the UI thread and never sets JS state, so no
    // teardown is required (matches the Animated usage across this library).
    const runFade = () => {
      if (cancelled) return;
      Animated.timing(opacity, {
        toValue: 1,
        duration: TAB_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    };
    // Mirror web's prefers-reduced-motion bypass: when the OS "Reduce Motion"
    // setting is on, show content immediately instead of fading. Fall back to
    // the fade if the setting can't be read.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) {
          opacity.setValue(1);
        } else {
          runFade();
        }
      })
      .catch(runFade);
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  if (Platform.OS === 'web') {
    return <YStack className="ps-tabContent">{children}</YStack>;
  }

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

// ── Conditional state primitives ───────────────────────────────────────────────

const STATE_ANNOUNCEMENTS: Record<PlayerStatsShellState, string> = {
  loading: 'Loading player statistics.',
  error: 'Unable to load player statistics.',
  empty: 'No players match the current filters.',
};

const SKELETON_ROWS = 8;
const SKELETON_COLS_BY_MODE: Record<
  'combined' | 'hitters' | 'pitchers',
  number
> = {
  combined: 12,
  hitters: 10,
  pitchers: 9,
};

interface LoadingSkeletonProps {
  viewMode: 'combined' | 'hitters' | 'pitchers';
}

function LoadingSkeleton({ viewMode }: LoadingSkeletonProps) {
  const colCount = SKELETON_COLS_BY_MODE[viewMode];
  return (
    <YStack
      testID="player-stats-loading-skeleton"
      role="presentation"
      aria-hidden={true}
      style={csp({
        background: BG_ELEVATED,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 12,
        padding: 18,
        gap: 14,
      })}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack gap={6}>
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
            })}
          >
            Loading
          </Text>
          <Text
            style={csp({ fontFamily: FONT_BODY, fontSize: 13, color: FG4 })}
          >
            Fetching archived seasons…
          </Text>
        </YStack>
      </XStack>
      <YStack gap={10}>
        {Array.from({ length: SKELETON_ROWS }).map((_, r) => (
          <XStack
            key={r}
            alignItems="center"
            style={csp({
              gap: 12,
              padding: '10px 8px',
              borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.06)}`,
            })}
          >
            <SkeletonBar width={140} />
            <SkeletonBar width={40} />
            <SkeletonBar width={40} />
            {Array.from({ length: colCount }).map((_, c) => (
              <SkeletonBar key={c} width={48} />
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

function SkeletonBar({ width }: { width: number }) {
  if (Platform.OS === 'web') {
    return <span className="ps-sk-bar" style={{ width, flex: '0 0 auto' }} />;
  }
  return (
    <YStack
      style={csp({
        width,
        height: 10,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.08)',
      })}
    />
  );
}

interface ErrorCardProps {
  onRetry?: () => void;
}

function ErrorCard({ onRetry }: ErrorCardProps) {
  return (
    <YStack
      testID="player-stats-error-card"
      role="alert"
      aria-live="assertive"
      style={csp({
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${BRAND_SEAM_RED}`,
        borderRadius: 12,
        alignItems: 'center',
        gap: 12,
      })}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND_SEAM_RED}
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      <Text
        tag="h3"
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        })}
      >
        Unable to load player stats
      </Text>
      <Text
        style={csp({
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        })}
      >
        We couldn't reach the archive service. Your filters are safe — we'll
        restore them when the connection returns.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading player statistics"
          style={csp({
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
            })}
          >
            Retry
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

interface EmptyCardProps {
  onClear?: () => void;
}

function EmptyCard({ onClear }: EmptyCardProps) {
  return (
    <YStack
      testID="player-stats-empty-card"
      role="status"
      style={csp({
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 12,
        alignItems: 'center',
        gap: 12,
      })}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={FG4}
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      )}
      <Text
        tag="h3"
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        })}
      >
        No players found
      </Text>
      <Text
        style={csp({
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        })}
      >
        No players match the current filters. Try widening your search, relaxing
        a range, or clearing filters entirely.
      </Text>
      {onClear && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          style={csp({
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
            })}
          >
            Clear all filters
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

// ── Column visibility picker ────────────────────────────────────────────────────

interface ColumnPickerPanelProps {
  columns: ToggleableColumn[];
  /** Keys currently shown (explicit selection, or the preset baseline). */
  visibleKeys: ReadonlySet<string>;
  /** True when an explicit selection exists — gates the "Reset columns" link. */
  customized: boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
}

/**
 * Per-column show/hide picker (LS-7105 / PST-001). Rendered inline beneath the
 * toolbar — mirrors the Advanced panel's treatment — so it works identically on
 * web and native without a popover/portal dependency. Each row is a checkbox
 * toggling a single stat column; "Reset columns" clears the selection back to
 * the statsFormat preset.
 */
function ColumnPickerPanel({
  columns,
  visibleKeys,
  customized,
  onToggle,
  onReset,
}: ColumnPickerPanelProps) {
  return (
    <YStack
      testID="column-picker-panel"
      className={Platform.OS === 'web' ? 'ps-adv-panel' : undefined}
      style={csp({
        padding: '18px 20px',
        background: SURFACE_CARD,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 16,
        gap: 14,
      })}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text
          style={csp({
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          })}
        >
          Visible Columns
        </Text>
        {customized && (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reset columns to default"
            testID="column-picker-reset"
            style={csp({
              backgroundColor: 'transparent',
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 6,
            })}
          >
            <Text
              style={csp({
                color: BRAND_GOLD_LIGHT,
                fontFamily: FONT_BODY,
                fontSize: 13,
                fontWeight: '500',
              })}
            >
              Reset columns
            </Text>
          </Pressable>
        )}
      </XStack>
      <XStack
        className={Platform.OS === 'web' ? 'ps-col-grid' : undefined}
        style={csp({
          display: Platform.OS === 'web' ? 'grid' : 'flex',
          flexDirection: 'column',
          gap: 8,
        })}
      >
        {columns.map((col) => {
          const checked = visibleKeys.has(col.key);
          return (
            <Pressable
              key={col.key}
              onPress={() => onToggle(col.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${col.label} column`}
              testID={`column-toggle-${col.key}`}
              style={csp({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 6,
                minHeight: 36,
              })}
            >
              <YStack
                style={csp({
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: checked ? BRAND_GOLD : OUTLINE_DEFAULT,
                  backgroundColor: checked
                    ? withAlpha(BRAND_GOLD, 0.2)
                    : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                {checked && (
                  <Text
                    style={csp({
                      color: BRAND_GOLD_LIGHT,
                      fontSize: 13,
                      lineHeight: 14,
                    })}
                  >
                    ✓
                  </Text>
                )}
              </YStack>
              <Text
                numberOfLines={1}
                style={csp({
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: checked ? TEXT_PRIMARY : FG3,
                })}
              >
                {col.label}
              </Text>
            </Pressable>
          );
        })}
      </XStack>
    </YStack>
  );
}

// ── Stat range slider ──────────────────────────────────────────────────────────

interface StatSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}

/**
 * Stable {@link DebouncedCommit} bound to the latest `commit` callback. The
 * debounce instance is created once (per `delayMs`) so its pending timer
 * survives re-renders, while a ref keeps it calling the current `commit`
 * without rebuilding the timer. Any pending commit is cancelled on unmount.
 */
function useDebouncedCommit(
  commit: () => void,
  delayMs: number = SLIDER_COMMIT_DEBOUNCE_MS,
): DebouncedCommit {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const debounced = useMemo(
    () => createDebouncedCommit(() => commitRef.current(), delayMs),
    [delayMs],
  );
  useEffect(() => debounced.cancel, [debounced]);
  return debounced;
}

function StatSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: StatSliderProps) {
  const pct = sliderFillPct(value, min, max);

  // Debounce the keyboard commit path: onKeyUp fires once per arrow-key press,
  // so holding an arrow would otherwise commit (remount grid + refetch) per
  // keystroke. Mouse/touch release are terminal single events and commit
  // immediately (cancelling any pending debounce); blur flushes a pending
  // keyboard commit so leaving the control doesn't wait out the delay (LS-7128).
  const debouncedCommit = useDebouncedCommit(onCommit);
  const commitImmediately = useCallback(() => {
    debouncedCommit.cancel();
    onCommit();
  }, [debouncedCommit, onCommit]);

  return (
    <YStack style={csp({ gap: 8 })}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text
          style={csp({
            fontFamily: FONT_BODY,
            fontWeight: '500',
            fontSize: 13,
            color: TEXT_MUTED,
          })}
        >
          {label}
        </Text>
        <Text
          style={csp({
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 18,
            color: BRAND_GOLD_LIGHT,
            fontVariantNumeric: 'tabular-nums',
          })}
        >
          {format(value)}
        </Text>
      </XStack>
      {Platform.OS === 'web' ? (
        <input
          type="range"
          aria-label={label}
          className="ps-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
          onChange={(e) => {
            const next = parseSliderValue(e.target.value);
            // Reject NaN/±Infinity at the setter boundary so corrupted input
            // never reaches filter state (LS-7137).
            if (next !== null) {
              onChange(next);
            }
          }}
          onMouseUp={commitImmediately}
          onTouchEnd={commitImmediately}
          onKeyUp={debouncedCommit.trigger}
          onBlur={debouncedCommit.flush}
        />
      ) : (
        <NativeRangeStepper
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          onCommit={onCommit}
        />
      )}
      <XStack justifyContent="space-between">
        <Text
          style={csp({
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          })}
        >
          {format(min)}
        </Text>
        <Text
          style={csp({
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          })}
        >
          {format(max)}
        </Text>
      </XStack>
    </YStack>
  );
}

// ── Native filter controls ─────────────────────────────────────────────────────
// Web renders inline `<select>` / range `<input>`; these are the cross-platform
// equivalents rendered under `Platform.OS !== 'web'` so native reaches filter
// parity without forking the page or pulling in a slider/picker dependency.

interface NativeSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

/**
 * Native (iOS/Android) replacement for the web `<select>`. Shows the current
 * value with a chevron and opens a bottom-sheet option list on tap. The parent
 * field already renders the `{label}` caption, so this only owns the value and
 * the picker (LS-7806).
 */
function NativeSelect({ label, value, options, onChange }: NativeSelectProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={csp({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 24,
        })}
      >
        <Text
          numberOfLines={1}
          style={csp({
            flex: 1,
            fontFamily: FONT_BODY,
            fontSize: 14,
            color: TEXT_PRIMARY,
          })}
        >
          {value}
        </Text>
        <Text style={csp({ color: FG3, fontSize: 12 })}>▾</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label} picker`}
          style={csp({
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'flex-end',
          })}
        >
          {/* Inner Pressable absorbs taps so a tap on the sheet doesn't dismiss it. */}
          <Pressable
            onPress={() => {
              /* absorb tap — keep the sheet open */
            }}
            style={csp({
              backgroundColor: SURFACE_PANEL,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderColor: STATS_BORDER,
              paddingTop: 16,
              paddingBottom: 28,
              maxHeight: '60%',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
                paddingHorizontal: 20,
                paddingBottom: 8,
              })}
            >
              {label}
            </Text>
            <ScrollView>
              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      if (opt !== value) onChange(opt);
                      close();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={csp({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      minHeight: 48,
                      backgroundColor: selected
                        ? withAlpha(BRAND_NAVY, 0.35)
                        : 'transparent',
                    })}
                  >
                    <Text
                      style={csp({
                        fontFamily: FONT_BODY,
                        fontSize: 16,
                        fontWeight: selected ? '700' : '400',
                        color: selected ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                      })}
                    >
                      {opt}
                    </Text>
                    {selected ? (
                      <Text
                        style={csp({ color: BRAND_GOLD_LIGHT, fontSize: 16 })}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface NativeRangeStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}

/**
 * Native replacement for the web range `<input>`. React Native ships no slider
 * primitive and this library deliberately avoids a slider dependency, so the
 * value (rendered by the parent {@link StatSlider}) is adjusted via −/+ stepper
 * buttons. Each press snaps to the step grid, clamps to range, and commits the
 * applied-filter snapshot (LS-7806).
 */
function NativeRangeStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
}: NativeRangeStepperProps) {
  const apply = useCallback(
    (delta: number) => {
      const next = stepValue(value, delta, min, max, step);
      if (next !== value) {
        onChange(next);
        onCommit();
      }
    },
    [value, min, max, step, onChange, onCommit],
  );

  const pct = sliderFillPct(value, min, max);

  return (
    <XStack style={csp({ gap: 12, alignItems: 'center' })}>
      <StepperButton
        label="−"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => apply(-step)}
      />
      <YStack
        style={csp({
          flex: 1,
          height: 4,
          borderRadius: 9999,
          backgroundColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        })}
      >
        <YStack
          style={csp({
            width: `${pct}%`,
            height: 4,
            backgroundColor: BRAND_GOLD,
          })}
        />
      </YStack>
      <StepperButton
        label="+"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => apply(step)}
      />
    </XStack>
  );
}

interface StepperButtonProps {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}

function StepperButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: StepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={csp({
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: OUTLINE_DEFAULT,
        backgroundColor: SURFACE_CARD,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 22,
          lineHeight: 24,
          color: TEXT_PRIMARY,
        })}
      >
        {label}
      </Text>
    </Pressable>
  );
}

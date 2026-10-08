// Pure helpers, constants, and types for the baseball player-stats controller.
// Relocated verbatim from the former PlayerStatsPage.tsx monolith so the shared
// shell can stay sport-agnostic. Re-exported from PlayerStatsPage.tsx to
// preserve the public API that unit specs + the web route depend on.

import {
  BATTING_NAME_COLUMN_KEY,
  CAREER_STATS_COLUMNS,
} from '../PlayerStatsDataGrid';
import {
  PITCHING_NAME_COLUMN_KEY,
  PITCHING_STATS_COLUMNS,
} from '../PitchingStatsDataGrid';
import { buildToggleableColumns, type ColumnGroup } from '../columnVisibility';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
} from '../PlayerStatsTypes';

// ── Advanced-filter range bounds/steps ──────────────────────────────────────

// ERA "off" sentinel — sits at the high end of the slider so "Max ERA = 5.00"
// means no upper bound is applied. Matches the design reference (project/stats.jsx).
export const ERA_MAX_OFF = 5;

// Minimum search length enforced before a search term is committed to a query.
export const MIN_SEARCH_LENGTH = 2;

// Upper bound for the "Min Home Runs" slider — CAREER home-run totals (all-time
// leader Barry Bonds sits at 762); 800 gives headroom. Stepped by 5.
export const HR_MAX = 800;
export const HR_STEP = 5;

// Batting average upper bound and step (career-avg domain).
export const AVG_MAX = 0.43;
export const AVG_STEP = 0.005;

// RBI career upper bound (Hank Aaron's 2297 record); step 5.
export const RBI_MAX = 2500;
export const RBI_STEP = 5;

// Wins career upper bound (Cy Young's 511 record); step 5.
export const WINS_MAX = 550;
export const WINS_STEP = 5;

// Strikeouts career upper bound (Nolan Ryan's 5714 record); step 10.
export const SO_MAX = 6000;
export const SO_STEP = 10;

// Rows-per-page choices for the toolbar selector.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
// Additional rows-per-page options unlocked for premium subscribers (PST-032).
export const PREMIUM_PAGE_SIZE_OPTIONS = [250, 500] as const;
// In 'combined' view both grids render at once, so cap the largest page size
// out of combined view to keep peak un-virtualized row count bounded (PST-030).
export const COMBINED_MAX_PAGE_SIZE = 50;

// Default batting sort — mirrors DEFAULT_CAREER_STATS_PARAMS in CareerStatsService.
export const DEFAULT_BATTING_SORT_BY = 'homeRuns';
export const DEFAULT_BATTING_SORT_DIR: 'asc' | 'desc' = 'desc';
export const DEFAULT_PITCHING_SORT_BY = 'wins';
export const DEFAULT_PITCHING_SORT_DIR: 'asc' | 'desc' = 'desc';

export const POSITIONS = [
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

export const MLB_TEAMS = [
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
 * Setters consumed by {@link createClearFiltersHandler}. Extracted so the
 * EmptyCard's clear-all-filters affordance can be unit-tested without mounting
 * the full page shell (LS-4613).
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
 * Builds the EmptyCard `onClear` handler. Resets every filter draft to its page
 * default, commits the snapshot via `applyFilters`, then forwards to the
 * integrator's optional `onClearFilters` callback so URL/query state can mirror.
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
 * Resolve the `playerType` query filter for the batting grid from the active
 * view mode (LS-7145). The Hitters tab excludes pure pitchers; Combined and
 * Pitchers leave it undefined. Pure so the mapping is unit-testable.
 */
export function battingPlayerTypeForViewMode(
  viewMode: 'combined' | 'hitters' | 'pitchers',
): 'hitter' | undefined {
  return viewMode === 'hitters' ? 'hitter' : undefined;
}

/**
 * True when the draft toolbar snapshot differs from the committed (applied)
 * snapshot — i.e. the user has pending filter edits. Drives the toolbar's Apply
 * button. Pure so the dirty-check is unit-testable (LS-7126).
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
 * aliases `batting`→`hitters` and `pitching`→`pitchers` are honored; any other
 * value falls back to `combined` (LS-7146 / PST-111).
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
 * filter snapshot. Returns the trimmed term when it meets
 * {@link MIN_SEARCH_LENGTH}, so the URL `searchTerm` is written clean (LS-10657),
 * or an empty string otherwise so a sub-minimum entry is treated as "no search"
 * (PST-061 / LS-7127).
 */
export function enforceSearchMinLength(search: string): string {
  const trimmed = search.trim();
  return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '';
}

/**
 * Returns the sort portion of a filter snapshot to persist to the URL: the
 * `sortBy`/`sortDir` pair when it differs from the batting default, or an empty
 * object when it matches (clean default URLs). Pure (LS-7115).
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
 * Pitching counterpart of {@link battingSortFilter}: the
 * `pitchingSortBy`/`pitchingSortDir` pair when it differs from the wins-desc
 * default, or an empty object when it matches. Pure (LS-10690).
 */
export function pitchingSortFilter(
  sortBy: string,
  sortDir: 'asc' | 'desc',
): Pick<PlayerStatsFilters, 'pitchingSortBy' | 'pitchingSortDir'> {
  if (
    sortBy === DEFAULT_PITCHING_SORT_BY &&
    sortDir === DEFAULT_PITCHING_SORT_DIR
  ) {
    return {};
  }
  return { pitchingSortBy: sortBy, pitchingSortDir: sortDir };
}

/**
 * Write the batting and pitching sort keys onto `params`, omitting either pair
 * when it matches its default so default views keep clean URLs.
 */
export function appendSortParams(
  params: URLSearchParams,
  sortBy: string,
  sortDir: 'asc' | 'desc',
  pitchingSortBy: string,
  pitchingSortDir: 'asc' | 'desc',
): void {
  const sortFilter = battingSortFilter(sortBy, sortDir);
  if (sortFilter.sortBy) {
    params.set('sortBy', sortFilter.sortBy);
    params.set('sortDir', sortFilter.sortDir ?? DEFAULT_BATTING_SORT_DIR);
  }
  const pitchingFilter = pitchingSortFilter(pitchingSortBy, pitchingSortDir);
  if (pitchingFilter.pitchingSortBy) {
    params.set('pitchingSortBy', pitchingFilter.pitchingSortBy);
    params.set(
      'pitchingSortDir',
      pitchingFilter.pitchingSortDir ?? DEFAULT_PITCHING_SORT_DIR,
    );
  }
}

/**
 * Coerce an untrusted page number (e.g. parsed from a URL) to a valid 1-based
 * page: anything that is not a positive safe integer becomes page 1 (LS-10658).
 */
export function normalizeGridPage(page: number | undefined): number {
  return page !== undefined && Number.isSafeInteger(page) && page >= 1
    ? page
    : 1;
}

/**
 * The `page`/`pitchingPage` pair for the batting and pitching grid pagers,
 * omitting either one while it is on page 1 so default views keep clean URLs.
 * Pure (LS-10658).
 */
export function gridPageFilter(
  battingPage: number,
  pitchingPage: number,
): Pick<PlayerStatsFilters, 'page' | 'pitchingPage'> {
  const filter: Pick<PlayerStatsFilters, 'page' | 'pitchingPage'> = {};
  if (battingPage > 1) filter.page = battingPage;
  if (pitchingPage > 1) filter.pitchingPage = pitchingPage;
  return filter;
}

/**
 * Serialize a committed filter snapshot into the shareable relative URL. Reads
 * the *applied* snapshot (never the uncommitted toolbar draft) so a shared link
 * always reflects what the sender sees on screen (LS-7131 / PST-071). Free of
 * `window.location` so it stays safe on native — the caller prepends the origin.
 */
export function buildShareUrl(
  viewMode: 'combined' | 'hitters' | 'pitchers',
  filters: AppliedFilters,
  sortBy: string = DEFAULT_BATTING_SORT_BY,
  sortDir: 'asc' | 'desc' = DEFAULT_BATTING_SORT_DIR,
  pitchingSortBy: string = DEFAULT_PITCHING_SORT_BY,
  pitchingSortDir: 'asc' | 'desc' = DEFAULT_PITCHING_SORT_DIR,
  battingPage = 1,
  pitchingPage = 1,
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
  appendSortParams(params, sortBy, sortDir, pitchingSortBy, pitchingSortDir);
  const pages = gridPageFilter(battingPage, pitchingPage);
  if (pages.page) params.set('page', String(pages.page));
  if (pages.pitchingPage) {
    params.set('pitchingPage', String(pages.pitchingPage));
  }
  // LS-9076: /players is the canonical stats route (formerly /players/stats).
  return `/players?${params.toString()}`;
}

/**
 * Rows-per-page options available for the given view mode (PST-030 / LS-7117).
 * 'combined' withholds 100; single-grid modes keep the full set and premium
 * subscribers additionally see 250/500. Pure.
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
 * Clamp a requested page size to what the given view mode allows (PST-030). In
 * 'combined' view anything above COMBINED_MAX_PAGE_SIZE is reduced to the cap.
 * Pure for unit-testing.
 */
export function clampPageSizeForViewMode(
  pageSize: number,
  viewMode: 'combined' | 'hitters' | 'pitchers',
): number {
  return viewMode === 'combined' && pageSize > COMBINED_MAX_PAGE_SIZE
    ? COMBINED_MAX_PAGE_SIZE
    : pageSize;
}

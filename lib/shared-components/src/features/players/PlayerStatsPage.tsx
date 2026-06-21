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
import { PlayerStatsDataGrid } from './PlayerStatsDataGrid';
import { PitchingStatsDataGrid } from './PitchingStatsDataGrid';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';
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

const GOLD_ACCENT_BUTTON_LABEL_STYLE = {
  color: BRAND_GOLD_LIGHT,
  fontSize: 12,
  fontFamily: FONT_DISPLAY,
  fontWeight: '700' as const,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

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
  setMinAVG: (v: number) => void;
  setMaxERA: (v: number) => void;
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
    setters.setMinAVG(0);
    setters.setMaxERA(ERA_MAX_OFF);
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

export interface PlayerStatsPageProps {
  title?: string;
  initialViewMode?: PlayerStatsViewMode;
  initialFilters?: Partial<PlayerStatsFilters>;
  initialPageSize?: number;
  showHeader?: boolean;
  showActions?: boolean;
  /** Stats display format: 'standard' shows high-priority columns only, 'expanded' shows all */
  statsFormat?: 'standard' | 'expanded';
  /** Force a shell-level state card (loading / error / empty) instead of the data grid. */
  state?: PlayerStatsShellState;
  /** Retry handler used by the error state. */
  onRetry?: () => void;
  /** Clear-filters handler used by the empty state. Defaults to resetting local filter draft. */
  onClearFilters?: () => void;
  onPlayerDetails?: (player: PlayerWithStats) => void;
  onExport?: (
    filters: PlayerStatsFilters,
    viewMode: PlayerStatsViewMode,
  ) => void;
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

interface AppliedFilters {
  search: string;
  position: string;
  team: string;
  pageSize: number;
  minHR: number;
  minAVG: number;
  maxERA: number;
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
  statsFormat = 'expanded',
  state,
  onRetry,
  onClearFilters,
  onPlayerDetails,
  onExport,
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

  // ── Toolbar draft state (not applied until applyFilters()) ─────
  const [search, setSearch] = useState(initialFilters.searchTerm ?? '');
  const [position, setPosition] = useState(
    initialFilters.position ?? 'All Positions',
  );
  const [team, setTeam] = useState(initialFilters.team ?? 'All Teams');
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Advanced filter draft state ────────────────────────────────
  const [minHR, setMinHR] = useState(initialFilters.minHomeRuns ?? 0);
  const [minAVG, setMinAVG] = useState(initialFilters.minBattingAvg ?? 0);
  const [maxERA, setMaxERA] = useState(initialFilters.maxERA ?? ERA_MAX_OFF);

  // ── Applied filters — committed snapshot that drives grid queries ─
  // Separate draft vs. applied state avoids mid-input query flicker and
  // removes the need for eslint-disable on useMemo dependency arrays.
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(() => ({
    search: initialFilters.searchTerm ?? '',
    position: initialFilters.position ?? 'All Positions',
    team: initialFilters.team ?? 'All Teams',
    pageSize: initialPageSize,
    minHR: initialFilters.minHomeRuns ?? 0,
    minAVG: initialFilters.minBattingAvg ?? 0,
    maxERA: initialFilters.maxERA ?? ERA_MAX_OFF,
  }));

  const applyFilters = useCallback(() => {
    setAppliedFilters({
      search,
      position,
      team,
      pageSize,
      minHR,
      minAVG,
      maxERA,
    });
  }, [search, position, team, pageSize, minHR, minAVG, maxERA]);

  // Stringify-based key forces grid unmount/remount on each filter commit,
  // which triggers a fresh GraphQL query with the new initialParams.
  const appliedKey = JSON.stringify(appliedFilters);
  const battingKey = `batting-${appliedKey}`;
  const pitchingKey = `pitching-${appliedKey}`;

  // ── Derived params passed to data grids ───────────────────────
  const battingParams = useMemo(
    () => ({
      first: appliedFilters.pageSize,
      orderBy: 'homeRuns',
      orderDirection: 'desc' as const,
      minGames: 0,
      searchTerm: appliedFilters.search || undefined,
      position:
        appliedFilters.position !== 'All Positions'
          ? appliedFilters.position
          : undefined,
      team:
        appliedFilters.team !== 'All Teams' ? appliedFilters.team : undefined,
      minHomeRuns: appliedFilters.minHR > 0 ? appliedFilters.minHR : undefined,
      minBattingAvg:
        appliedFilters.minAVG > 0 ? appliedFilters.minAVG : undefined,
      // The Hitters tab must exclude pure pitchers from the batting grid; the
      // tab flags alone only toggle grid visibility (LS-7145). Two-way players
      // (e.g. Ohtani) retain a non-pitching eligible position and so remain
      // visible. Combined keeps everyone (playerType left undefined).
      playerType: battingPlayerTypeForViewMode(viewMode),
    }),
    [appliedFilters, viewMode],
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
    if (appliedFilters.minAVG > 0) {
      filters.minBattingAvg = appliedFilters.minAVG;
    }
    if (appliedFilters.maxERA < ERA_MAX_OFF) {
      filters.maxERA = appliedFilters.maxERA;
    }
    onFiltersChange({
      viewMode,
      pageSize: appliedFilters.pageSize,
      filters,
    });
  }, [appliedFilters, viewMode, onFiltersChange]);

  // ── Player click handlers ──────────────────────────────────────
  const handleBattingPlayerClick = useCallback(
    (player: PlayerCareerStats) => {
      if (!onPlayerDetails) return;
      onPlayerDetails({
        id: player.playerId,
        name: player.displayName || `Player ${player.playerId}`,
      } as PlayerWithStats);
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
      } as PlayerWithStats);
    },
    [onPlayerDetails],
  );

  // ── Export / share ─────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!onExport) return;
    const filters: PlayerStatsFilters = {
      searchTerm: search || undefined,
      position: position !== 'All Positions' ? position : undefined,
      team: team !== 'All Teams' ? team : undefined,
      minHomeRuns: minHR > 0 ? minHR : undefined,
      minBattingAvg: minAVG > 0 ? minAVG : undefined,
      maxERA: maxERA < ERA_MAX_OFF ? maxERA : undefined,
    };
    onExport(filters, viewMode);
  }, [onExport, search, position, team, minHR, minAVG, maxERA, viewMode]);

  const handleShare = useCallback(() => {
    if (!onShare) return;
    const params = new URLSearchParams({
      view: viewMode,
      pageSize: String(pageSize),
    });
    if (search) params.set('search', search);
    if (position !== 'All Positions') params.set('position', position);
    if (team !== 'All Teams') params.set('team', team);
    if (minHR > 0) params.set('minHomeRuns', String(minHR));
    if (minAVG > 0) params.set('minBattingAvg', minAVG.toFixed(3));
    if (maxERA < ERA_MAX_OFF) params.set('maxERA', maxERA.toFixed(2));
    // Build relative URL — the caller is responsible for prepending the origin.
    // This keeps the shared component free of window.location (safe for native).
    onShare(`/players/stats?${params.toString()}`);
  }, [
    onShare,
    viewMode,
    pageSize,
    search,
    position,
    team,
    minHR,
    minAVG,
    maxERA,
  ]);

  // ── Visibility flags ───────────────────────────────────────────
  const showBatting = viewMode === 'combined' || viewMode === 'hitters';
  const showPitching = viewMode === 'combined' || viewMode === 'pitchers';

  // ── URL preview — matches the URL params that apps/web persists ─
  const urlPreview = useMemo(() => {
    const params: string[] = [`view=${viewMode}`, `pageSize=${pageSize}`];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (position !== 'All Positions')
      params.push(`position=${encodeURIComponent(position)}`);
    if (team !== 'All Teams') params.push(`team=${encodeURIComponent(team)}`);
    if (minHR > 0) params.push(`minHomeRuns=${minHR}`);
    if (minAVG > 0) params.push(`minBattingAvg=${minAVG.toFixed(3)}`);
    if (maxERA < ERA_MAX_OFF) params.push(`maxERA=${maxERA.toFixed(2)}`);
    return `/players/stats?${params.join('&')}`;
  }, [viewMode, pageSize, search, position, team, minHR, minAVG, maxERA]);

  return (
    <YStack flex={1} style={{ backgroundColor: BG_PAGE }}>
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
        `}</style>
      )}

      {/* ── Page header ───────────────────────────────────────────── */}
      {showHeader && (
        <YStack
          style={{
            maxWidth: 1280,
            width: '100%',
            padding: '32px 24px 0',
            margin: '0 auto',
          }}
        >
          <XStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="$6"
            flexWrap="wrap"
          >
            {/* Left: editorial copy */}
            <YStack gap="$2" style={{ flex: 1, minWidth: 240 }}>
              <Text
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                Players · League Archive
              </Text>
              <Text
                tag="h1"
                style={{
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
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 17,
                  lineHeight:
                    Platform.OS === 'web' ? ('1.55' as unknown as number) : 26,
                  color: FG3,
                  maxWidth: '64ch',
                  margin: 0,
                }}
              >
                Every qualified hitter and pitcher across the archive. Draft
                legends, compare seasons, and build your dynasty on the numbers
                that actually happened.
              </Text>
              {/* URL preview — shows the shareable query string */}
              <XStack
                alignItems="center"
                gap="$2"
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  background: 'rgba(13,21,38,0.6)',
                  border: `1px solid ${OUTLINE_SUBTLE}`,
                  borderRadius: 8,
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: FG4,
                    flexShrink: 0,
                  }}
                >
                  URL
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    color: FG3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
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
                style={{ marginTop: Platform.OS === 'web' ? 8 : 0 }}
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
                <Pressable
                  onPress={handleExport}
                  accessibilityRole="button"
                  accessibilityLabel="Export player statistics as JSON"
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
                    Export JSON
                  </Text>
                </Pressable>
              </XStack>
            )}
          </XStack>
        </YStack>
      )}

      {/* ── Main content area ──────────────────────────────────────── */}
      <YStack
        flex={1}
        style={{
          maxWidth: 1280,
          width: '100%',
          padding: '24px 24px 96px',
          margin: '0 auto',
          gap: 24,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── View mode tabs: Combined / Hitters / Pitchers ─────────── */}
        {/* Pill cluster (BRAND_NAVY selected fill) per design `.sp-tabs`.    */}
        {/* MOTION: crossfade 140ms on tab switch; no layout shift.           */}
        <XStack
          role="tablist"
          accessibilityRole="tablist"
          aria-label="Player stats view mode"
          style={{
            alignSelf: 'flex-start',
            gap: 4,
            padding: 5,
            background: BG_PANEL,
            border: `1px solid ${STATS_BORDER}`,
            borderRadius: 9999,
          }}
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
                onPress={() => setViewMode(id)}
                role="tab"
                accessibilityRole="tab"
                aria-selected={selected}
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 9999,
                  backgroundColor: selected ? BRAND_NAVY : 'transparent',
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 12,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: selected ? '#FFFFFF' : FG3,
                  }}
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
          style={{
            display: Platform.OS === 'web' ? 'grid' : 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 14,
            background: SURFACE_PANEL,
            border: `1px solid ${OUTLINE_SUBTLE}`,
            borderRadius: 16,
          }}
        >
          {/* Search */}
          <YStack
            style={{
              position: 'relative',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '0 12px 0 38px',
              minHeight: 44,
            }}
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
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={applyFilters}
              placeholder="Search player name · min 2 chars"
              placeholderTextColor={FG4}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                color: TEXT_PRIMARY,
                fontFamily: FONT_BODY,
                fontSize: 14,
                paddingVertical: 8,
                borderWidth: 0,
                outlineWidth: 0,
              }}
            />
            {search ? (
              <Pressable
                onPress={() => {
                  setSearch('');
                  applyFilters();
                }}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                style={{
                  backgroundColor: 'transparent',
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text style={{ color: FG3, fontSize: 20, lineHeight: 20 }}>
                  ×
                </Text>
              </Pressable>
            ) : null}
          </YStack>

          {/* Position select */}
          <YStack
            style={{
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              }}
            >
              Position
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={position}
                onChange={(e) => {
                  const next = (e.target as HTMLSelectElement).value;
                  setPosition(next);
                  setAppliedFilters((cur) => ({ ...cur, position: next }));
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
                onChange={(next) => {
                  setPosition(next);
                  setAppliedFilters((cur) => ({ ...cur, position: next }));
                }}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Team select */}
          <YStack
            style={{
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              }}
            >
              Team
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={team}
                onChange={(e) => {
                  const next = (e.target as HTMLSelectElement).value;
                  setTeam(next);
                  setAppliedFilters((cur) => ({ ...cur, team: next }));
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
                onChange={(next) => {
                  setTeam(next);
                  setAppliedFilters((cur) => ({ ...cur, team: next }));
                }}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Rows per page */}
          <YStack
            style={{
              position: 'relative',
              justifyContent: 'center',
              background: 'rgba(10,15,26,0.55)',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 6,
              padding: '6px 30px 6px 12px',
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: FG3,
              }}
            >
              Rows
            </Text>
            {Platform.OS === 'web' ? (
              <select
                className="ps-select-native"
                value={pageSize}
                onChange={(e) => {
                  const next = Number((e.target as HTMLSelectElement).value);
                  setPageSize(next);
                  setAppliedFilters((cur) => ({ ...cur, pageSize: next }));
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <NativeSelect
                label="Rows"
                value={String(pageSize)}
                options={['10', '25', '50', '100']}
                onChange={(next) => {
                  const n = Number(next);
                  setPageSize(n);
                  setAppliedFilters((cur) => ({ ...cur, pageSize: n }));
                }}
              />
            )}
            {Platform.OS === 'web' && (
              <Text
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FG3,
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                ▾
              </Text>
            )}
          </YStack>

          {/* Advanced toggle */}
          <Pressable
            onPress={() => setAdvancedOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedOpen }}
            style={{
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
            }}
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
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: advancedOpen ? TEXT_PRIMARY : FG3,
                whiteSpace: 'nowrap',
              }}
            >
              Advanced
            </Text>
            <Text style={{ fontSize: 10, color: FG3 }}>
              {advancedOpen ? '▴' : '▾'}
            </Text>
          </Pressable>
        </XStack>

        {/* ── Availability filter ────────────────────────────────────── */}
        {showAvailabilityFilter && (
          <XStack
            gap={6}
            alignItems="center"
            flexWrap="wrap"
            style={{ paddingTop: 4 }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: FG3,
                whiteSpace: 'nowrap',
              }}
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
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: active ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT,
                    backgroundColor: active
                      ? 'rgba(27,58,92,0.45)'
                      : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT_BODY,
                      fontWeight: active ? '700' : '500',
                      fontSize: 13,
                      color: active ? TEXT_PRIMARY : FG3,
                    }}
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
            style={{
              padding: '18px 20px',
              background: SURFACE_CARD,
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 16,
              gap: 14,
            }}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                Stat Ranges
              </Text>
              <Pressable
                onPress={() => {
                  setMinHR(0);
                  setMinAVG(0);
                  setMaxERA(ERA_MAX_OFF);
                  applyFilters();
                }}
                accessibilityRole="button"
                style={{
                  backgroundColor: 'transparent',
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    color: BRAND_GOLD_LIGHT,
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    fontWeight: '500',
                  }}
                >
                  Reset ranges
                </Text>
              </Pressable>
            </XStack>
            <XStack
              className={Platform.OS === 'web' ? 'ps-adv-grid' : undefined}
              style={{
                display: Platform.OS === 'web' ? 'grid' : 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
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
                label="Min Batting Average"
                value={minAVG}
                min={0}
                max={0.43}
                step={0.005}
                format={(v) => v.toFixed(3).replace(/^0/, '')}
                onChange={setMinAVG}
                onCommit={applyFilters}
              />
              <StatSlider
                label="Max ERA"
                value={maxERA}
                min={0}
                max={ERA_MAX_OFF}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={setMaxERA}
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
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
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
                setMinAVG,
                setMaxERA,
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
                  showSearch={false}
                  showFilters={false}
                  showSorting={true}
                  showPagination={true}
                  statsFormat={statsFormat}
                  availabilityFilter={
                    showAvailabilityFilter ? availabilityFilter : undefined
                  }
                  rosteredPlayerIds={
                    showAvailabilityFilter ? rosteredPlayerIds : undefined
                  }
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
                  availabilityFilter={
                    showAvailabilityFilter ? availabilityFilter : undefined
                  }
                  rosteredPlayerIds={
                    showAvailabilityFilter ? rosteredPlayerIds : undefined
                  }
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
      style={{
        background: BG_ELEVATED,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 12,
        padding: 18,
        gap: 14,
      }}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack gap={6}>
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
            }}
          >
            Loading
          </Text>
          <Text style={{ fontFamily: FONT_BODY, fontSize: 13, color: FG4 }}>
            Fetching archived seasons…
          </Text>
        </YStack>
      </XStack>
      <YStack gap={10}>
        {Array.from({ length: SKELETON_ROWS }).map((_, r) => (
          <XStack
            key={r}
            alignItems="center"
            style={{
              gap: 12,
              padding: '10px 8px',
              borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.06)}`,
            }}
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
    return (
      <span
        className="ps-sk-bar"
        style={{ width, flex: '0 0 auto' } as React.CSSProperties}
      />
    );
  }
  return (
    <YStack
      style={{
        width,
        height: 10,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.08)',
      }}
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
      style={{
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
      }}
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
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Unable to load player stats
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        }}
      >
        We couldn't reach the archive service. Your filters are safe — we'll
        restore them when the connection returns.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading player statistics"
          style={{
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
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
      style={{
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
      }}
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
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        }}
      >
        No players found
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        }}
      >
        No players match the current filters. Try widening your search, relaxing
        a range, or clearing filters entirely.
      </Text>
      {onClear && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          style={{
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
          >
            Clear all filters
          </Text>
        </Pressable>
      )}
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
  const pct = Math.round(((value - min) / (max - min)) * 100);

  return (
    <YStack style={{ gap: 8 }}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text
          style={{
            fontFamily: FONT_BODY,
            fontWeight: '500',
            fontSize: 13,
            color: TEXT_MUTED,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 18,
            color: BRAND_GOLD_LIGHT,
            fontVariantNumeric: 'tabular-nums',
          }}
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
            const next = parseSliderValue((e.target as HTMLInputElement).value);
            // Reject NaN/±Infinity at the setter boundary so corrupted input
            // never reaches filter state (LS-7137).
            if (next !== null) {
              onChange(next);
            }
          }}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          onKeyUp={onCommit}
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
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          }}
        >
          {format(min)}
        </Text>
        <Text
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          }}
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
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 24,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: FONT_BODY,
            fontSize: 14,
            color: TEXT_PRIMARY,
          }}
        >
          {value}
        </Text>
        <Text style={{ color: FG3, fontSize: 12 }}>▾</Text>
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
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'flex-end',
          }}
        >
          {/* Inner Pressable absorbs taps so a tap on the sheet doesn't dismiss it. */}
          <Pressable
            onPress={() => {
              /* absorb tap — keep the sheet open */
            }}
            style={{
              backgroundColor: SURFACE_PANEL,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderColor: STATS_BORDER,
              paddingTop: 16,
              paddingBottom: 28,
              maxHeight: '60%',
            }}
          >
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
                paddingHorizontal: 20,
                paddingBottom: 8,
              }}
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
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      minHeight: 48,
                      backgroundColor: selected
                        ? withAlpha(BRAND_NAVY, 0.35)
                        : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 16,
                        fontWeight: selected ? '700' : '400',
                        color: selected ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                      }}
                    >
                      {opt}
                    </Text>
                    {selected ? (
                      <Text style={{ color: BRAND_GOLD_LIGHT, fontSize: 16 }}>
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

  const pct = Math.round(((value - min) / (max - min)) * 100);

  return (
    <XStack style={{ gap: 12, alignItems: 'center' }}>
      <StepperButton
        label="−"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => apply(-step)}
      />
      <YStack
        style={{
          flex: 1,
          height: 4,
          borderRadius: 9999,
          backgroundColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <YStack
          style={{ width: `${pct}%`, height: 4, backgroundColor: BRAND_GOLD }}
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
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: OUTLINE_DEFAULT,
        backgroundColor: SURFACE_CARD,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 22,
          lineHeight: 24,
          color: TEXT_PRIMARY,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

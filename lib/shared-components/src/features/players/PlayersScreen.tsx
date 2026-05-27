import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { PlayersGrid, type PlayersGridResultStats } from './PlayersGrid';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';
import { fullName, initialsOf } from './playerNameUtils';
import { Platform } from '../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  OUTLINE_SUBTLE,
  OVERLAY_WHITE_05,
  POS_CATCHER,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  POS_UTILITY,
  STATS_PAGE_TOKENS,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_NEUTRAL_FG3,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

// LS-4613 token — same BG_ELEVATED used by the Stats Page state cards.
const BG_ELEVATED = STATS_PAGE_TOKENS.BG_ELEVATED;

// `as unknown as number` is the project's documented workaround for passing
// raw CSS strings (clamp(), unitless line-height) through Tamagui's numeric
// fontSize / lineHeight typings on web. See
// .agents/skills/standards/references/tamagui-web-pitfalls.md and the same
// pattern in PlayerStatsPage.tsx (LS-4613). Native branches always supply
// real numbers, so the cast only takes effect under Platform.OS === 'web'.

// Re-export the editorial-shell pure helpers from their leaf module so
// existing callers and tests can keep their `from './PlayersScreen'` imports
// (LS-4650 — helpers moved to playerNameUtils.ts to break a PlayerListRow
// import cycle).
export { fullName, initialsOf };

// ── Filter rail option sets (LS-4649) ────────────────────────────────
// Mirrors docs/design/F89Q4j6WFCFqqsZpQ4VhlQ/legacy-sports-players-page/
// project/players-data.jsx. Era and Position filters are scaffold-only in
// this slice — the PlayerFragment doesn't yet select `primaryEra` /
// `eligiblePositions`, so the rail captures user intent (active summary,
// clear-all) without short-circuiting the server query. A follow-up slice
// can extend the fragment and the GraphQL `players` resolver to filter on
// these fields without changing the rail UI.
const ERAS = [
  { id: 'all', label: 'All Eras' },
  { id: 'dead', label: 'Dead Ball', range: '1901–19' },
  { id: 'live', label: 'Live Ball', range: '1920–45' },
  { id: 'integration', label: 'Integration', range: '1946–68' },
  { id: 'expansion', label: 'Expansion', range: '1969–93' },
  { id: 'steroid', label: 'Steroid', range: '1994–04' },
  { id: 'modern', label: 'Modern', range: '2005–' },
] as const;

const POSITIONS = [
  { id: 'all', label: 'All', dot: 'transparent' },
  { id: 'pitcher', label: 'P', dot: POS_PITCHER },
  { id: 'catcher', label: 'C', dot: POS_CATCHER },
  { id: 'infield', label: 'IF', dot: POS_INFIELD },
  { id: 'outfield', label: 'OF', dot: POS_OUTFIELD },
  { id: 'utility', label: 'DH', dot: POS_UTILITY },
] as const;

const AVAILABILITY = [
  { id: 'all', label: 'Any' },
  { id: 'free', label: 'Free Agents' },
  { id: 'rost', label: 'Rostered' },
  { id: 'wait', label: 'Waivers' },
] as const;

type EraId = (typeof ERAS)[number]['id'];
type PositionId = (typeof POSITIONS)[number]['id'];
type AvailabilityId = (typeof AVAILABILITY)[number]['id'];

const SORT_OPTIONS = [
  { value: 'NAME_ASC', label: 'Sort: Name (A → Z)' },
  { value: 'NAME_DESC', label: 'Sort: Name (Z → A)' },
] as const;

/**
 * Shell-level conditional state for the Players Page. When omitted, the page
 * derives state from the peek Apollo query (loading / error / empty) — see
 * {@link deriveShellState}. Setting this prop forces the corresponding state
 * card and replaces the populated content (Featured + grid).
 */
export type PlayersShellState = 'loading' | 'error' | 'empty';

/** Players Page view modes (LS-4650). Drives both the populated render
 *  (PlayersGrid cards vs list) and the loading-skeleton geometry. */
export type PlayersViewMode = 'cards' | 'list' | 'stats';

const VIEW_MODES: ReadonlyArray<PlayersViewMode> = ['cards', 'list', 'stats'];

export interface PlayersScreenProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  title?: string;
  /** Render the Featured player spotlight above the grid. Default: true. */
  showFeatured?: boolean;
  /**
   * Force a shell-level state card (loading / error / empty) instead of the
   * Featured + grid layout. When omitted, the page derives state from the
   * peek Apollo query result.
   */
  state?: PlayersShellState;
  /** Initial view mode when the URL does not carry a `?view=` parameter and
   *  on non-web platforms (which don't read the URL). Default: 'cards'. */
  viewMode?: PlayersViewMode;
  /** Retry handler invoked from the ErrorState card. Defaults to Apollo refetch. */
  onRetry?: () => void;
}

/**
 * Derive the shell state from peek-query flags + filter activity.
 *
 * - `loading` while the peek query is in flight and no data has arrived yet
 * - `error` when the peek query failed with no usable partial data
 * - `empty` when the query returned successfully but the player set is empty
 *   AND filters are active (so the host can clear them); without filters, an
 *   empty archive is a populated-but-empty state, not an action-needed empty
 *   card — defer to the grid's own messaging.
 * - otherwise `undefined`, meaning render the populated Featured + grid.
 *
 * Exported for direct unit testing — see PlayersScreen.spec.tsx.
 */
export function deriveShellState({
  loading,
  error,
  playerCount,
  hasActiveFilters,
}: {
  loading: boolean;
  error: boolean;
  playerCount: number;
  hasActiveFilters: boolean;
}): PlayersShellState | undefined {
  if (loading && playerCount === 0) return 'loading';
  if (error && playerCount === 0) return 'error';
  if (!loading && !error && playerCount === 0 && hasActiveFilters) {
    return 'empty';
  }
  return undefined;
}

const STATE_ANNOUNCEMENTS: Record<PlayersShellState, string> = {
  loading: 'Loading players.',
  error: 'Unable to load players.',
  empty: 'No players match the current filters.',
};

/**
 * Active-summary chip descriptor — exported for direct unit testing.
 * The shape mirrors the design's `ActiveSummary` in players-app.jsx so
 * future slices can add new filter dimensions without rewriting the chip
 * list rendering. (LS-4649)
 */
export interface ActiveFilterChip {
  key: 'q' | 'era' | 'pos' | 'avail';
  label: string;
}

/**
 * Compute the active-filter chip list. Exported so PlayersScreen.spec.tsx
 * can verify the mapping (search query → quoted chip, era → era label,
 * etc.) without mounting the whole shell. (LS-4649)
 */
export function activeFilterChips(args: {
  searchTerm: string;
  era: EraId;
  pos: PositionId;
  avail: AvailabilityId;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (args.searchTerm.trim()) {
    chips.push({ key: 'q', label: `"${args.searchTerm.trim()}"` });
  }
  if (args.era !== 'all') {
    const era = ERAS.find((e) => e.id === args.era);
    if (era) chips.push({ key: 'era', label: era.label });
  }
  if (args.pos !== 'all') {
    const pos = POSITIONS.find((p) => p.id === args.pos);
    if (pos) chips.push({ key: 'pos', label: pos.label });
  }
  if (args.avail !== 'all') {
    const avail = AVAILABILITY.find((a) => a.id === args.avail);
    if (avail) chips.push({ key: 'avail', label: avail.label });
  }
  return chips;
}

/**
 * Pure parser for the Players Page `?view=` URL search parameter (LS-4650).
 * Falls back to the supplied default for missing or unrecognised values so
 * refresh / back-navigation always lands on a renderable view. Exported for
 * unit tests.
 */
export function parseViewParam(
  search: string | null | undefined,
  fallback: PlayersViewMode = 'cards',
): PlayersViewMode {
  if (!search) return fallback;
  try {
    const params = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search,
    );
    const raw = params.get('view');
    if (raw && (VIEW_MODES as readonly string[]).includes(raw)) {
      return raw as PlayersViewMode;
    }
  } catch {
    /* malformed query strings fall through to the fallback below */
  }
  return fallback;
}

/**
 * Pure builder for the URL search string after a view change (LS-4650).
 * Returns the new `?...` string (including leading `?`, or empty string if no
 * other params remain) so callers can pump it through `history.replaceState`
 * without depending on `window` at module scope. The default `'cards'` is
 * elided from the URL so a clean `/players` link stays clean.
 */
export function buildViewSearch(
  currentSearch: string | null | undefined,
  view: PlayersViewMode,
): string {
  const params = new URLSearchParams(
    currentSearch
      ? currentSearch.startsWith('?')
        ? currentSearch.slice(1)
        : currentSearch
      : '',
  );
  if (view === 'cards') {
    params.delete('view');
  } else {
    params.set('view', view);
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}

function PlayersScreen({
  onPlayerSelect,
  pageSize = 50,
  title = 'All Players',
  showFeatured = true,
  state,
  viewMode: viewModeProp = 'cards',
  onRetry,
}: PlayersScreenProps) {
  const handlePlayerSelect = useCallback(
    (player: PlayerFragment) => {
      LOGGER.debug('Selected player:', player);
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  // View mode (Cards / List). Stats Table is reserved for the upcoming slice;
  // the toggle exposes it as disabled with a "Coming soon" hint per AC1.
  // Persistence: hydrate from `?view=` on mount, push view changes back via
  // history.replaceState so refresh + back-navigation keep the choice (AC3).
  // The `viewMode` prop seeds the initial value when no URL parameter is set
  // (or on native, which doesn't read the URL).
  const [view, setView] = useState<PlayersViewMode>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return viewModeProp;
    }
    return parseViewParam(window.location.search, viewModeProp);
  });

  const handleViewChange = useCallback((next: PlayersViewMode) => {
    setView(next);
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      url.search = buildViewSearch(url.search, next);
      window.history.replaceState(
        null,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch (err) {
      // history.replaceState can throw under sandbox/iframe policies; the
      // in-memory state is the source of truth for the current session, so
      // log and continue rather than blocking the toggle.
      LOGGER.warn(
        'PlayersScreen view URL sync failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }, []);

  // Filter / sort state owned by the screen so the grid, the count chip,
  // the active-summary row, and the derived empty state all read from one
  // source of truth (LS-4649).
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('NAME_ASC');
  const [era, setEra] = useState<EraId>('all');
  const [pos, setPos] = useState<PositionId>('all');
  const [avail, setAvail] = useState<AvailabilityId>('all');
  const [resultStats, setResultStats] = useState<PlayersGridResultStats>({
    matched: 0,
    total: 0,
    hasMore: false,
  });
  const handleResultStats = useCallback((stats: PlayersGridResultStats) => {
    setResultStats(stats);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setEra('all');
    setPos('all');
    setAvail('all');
  }, []);

  const clearChip = useCallback(
    (key: 'all' | ActiveFilterChip['key']) => {
      if (key === 'all') {
        clearAllFilters();
        return;
      }
      if (key === 'q') setSearchTerm('');
      if (key === 'era') setEra('all');
      if (key === 'pos') setPos('all');
      if (key === 'avail') setAvail('all');
    },
    [clearAllFilters],
  );

  // Lightweight peek query for the Featured spotlight + derived shell state.
  // The main grid runs its own paginated query inside PlayersGrid; this one
  // stays at limit:1 so the shell doesn't double-fetch a full page.
  const { data, error, loading, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: 1,
      offset: 0,
      orderBy: 'name',
      orderDirection: 'asc',
    },
    errorPolicy: 'all',
  });

  // Surface partial/full GraphQL errors so the empty spotlight isn't silent.
  useEffect(() => {
    if (error) {
      LOGGER.error('PlayersScreen featured spotlight query failed', error);
    }
  }, [error]);

  const featuredPlayer = useMemo<PlayerFragment | null>(() => {
    const players = data?.players ?? [];
    return players.find((p): p is PlayerFragment => p !== null) ?? null;
  }, [data?.players]);

  const chips = useMemo(
    () => activeFilterChips({ searchTerm, era, pos, avail }),
    [searchTerm, era, pos, avail],
  );
  const hasActiveFilters = chips.length > 0;

  // Derive state from peek query when host did not force one explicitly.
  const peekPlayerCount = data?.players?.length ?? 0;
  const derivedState = useMemo(
    () =>
      deriveShellState({
        loading,
        error: !!error,
        playerCount: peekPlayerCount,
        hasActiveFilters,
      }),
    [loading, error, peekPlayerCount, hasActiveFilters],
  );
  const activeState: PlayersShellState | undefined = state ?? derivedState;

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
      return;
    }
    refetch().catch((err: unknown) => {
      LOGGER.error(
        'PlayersScreen refetch failed',
        err instanceof Error ? err : String(err),
      );
    });
  }, [onRetry, refetch]);

  return (
    <YStack flex={1} className="pp-screen" style={{ backgroundColor: BG_DARK }}>
      {/* Mobile readability tweaks (LS-4809): tighten outer padding, stack the
          featured spotlight, scale typography. Mirrors the inline-<style>
          responsive pattern used by PlayerStatsPage.tsx. */}
      {Platform.OS === 'web' && (
        <style>{`
          .pp-screen-inner { padding: 32px 24px 80px; gap: 28px; }
          @keyframes pp-shimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
          .pp-sk-bar {
            display: inline-block;
            background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.04) 100%);
            background-size: 480px 100%;
            animation: pp-shimmer 1.4s linear infinite;
            border-radius: 4px;
          }
          @media (prefers-reduced-motion: reduce) {
            .pp-sk-bar { animation: none; background: rgba(255,255,255,0.08); }
          }
          .pp-sk-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 16px;
          }
          .pp-filters { display: flex; flex-direction: column; gap: 14px; }
          .pp-search-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
          .pp-search-box { flex: 1 1 320px; min-width: 220px; position: relative; }
          .pp-search-box input {
            width: 100%;
            padding: 14px 16px 14px 44px;
            background: ${SURFACE_PANEL};
            border: 1px solid ${OUTLINE_SUBTLE};
            border-radius: 10px;
            color: ${TEXT_PRIMARY};
            font-family: ${FONT_BODY};
            font-size: 15px;
            transition: border-color 150ms ease, box-shadow 150ms ease;
            box-sizing: border-box;
          }
          .pp-search-box input:focus {
            outline: 0;
            border-color: ${BRAND_GOLD_LIGHT};
            box-shadow: 0 0 0 3px rgba(197, 165, 90, 0.18);
          }
          .pp-search-box input::placeholder { color: ${TEXT_MUTED}; font-style: italic; }
          .pp-search-icon {
            position: absolute; left: 14px; top: 50%;
            transform: translateY(-50%);
            color: ${TEXT_MUTED}; pointer-events: none;
            display: inline-flex;
          }
          .pp-sort {
            background: ${SURFACE_PANEL};
            border: 1px solid ${OUTLINE_SUBTLE};
            border-radius: 10px;
            color: ${TEXT_PRIMARY};
            font-family: ${FONT_DISPLAY};
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 12px 36px 12px 14px;
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CAAC5' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>");
            background-repeat: no-repeat;
            background-position: right 12px center;
          }
          .pp-sort:focus {
            outline: 0;
            border-color: ${BRAND_GOLD_LIGHT};
            box-shadow: 0 0 0 3px rgba(197, 165, 90, 0.18);
          }
          .pp-rail { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
          .pp-rail-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
          .pp-rail-divider { width: 1px; align-self: stretch; background: ${OUTLINE_SUBTLE}; }
          .pp-pill {
            font-family: ${FONT_DISPLAY};
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 7px 13px;
            border-radius: 9999px;
            background: transparent;
            border: 1px solid ${OUTLINE_SUBTLE};
            color: ${TEXT_NEUTRAL_FG3};
            cursor: pointer;
            transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
            display: inline-flex;
            align-items: center;
          }
          .pp-pill:hover { color: ${TEXT_PRIMARY}; border-color: ${withAlpha(BRAND_NAVY, 0.7)}; }
          .pp-pill.on {
            background: ${withAlpha(BRAND_NAVY, 0.55)};
            border-color: ${withAlpha(BRAND_GOLD_LIGHT, 0.45)};
            color: ${TEXT_PRIMARY};
          }
          .pp-pill-dot {
            display: inline-block;
            width: 7px; height: 7px;
            border-radius: 50%;
            margin-right: 6px;
            vertical-align: middle;
          }
          .pp-active { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 10px 0 0; }
          .pp-tag {
            font-family: ${FONT_DISPLAY};
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 4px 8px 4px 10px;
            background: ${withAlpha(BRAND_GOLD_LIGHT, 0.1)};
            border: 1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.25)};
            border-radius: 9999px;
            color: ${BRAND_GOLD_LIGHT};
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .pp-tag-close {
            background: transparent; border: 0; color: inherit;
            cursor: pointer; padding: 0; line-height: 1; font-size: 14px; opacity: 0.7;
          }
          .pp-tag-close:hover { opacity: 1; }
          .pp-clear-all {
            font-family: ${FONT_BODY};
            font-style: italic;
            font-size: 13px;
            color: ${TEXT_NEUTRAL_FG3};
            background: transparent;
            border: 0;
            cursor: pointer;
          }
          .pp-clear-all:hover { color: ${BRAND_GOLD_LIGHT}; }
          @media (max-width: 640px) {
            .pp-screen-inner { padding: 20px 16px 56px; gap: 20px; }
            .pp-head { gap: 12px; }
            .pp-head-eyebrow { font-size: 10px; letter-spacing: 0.14em; }
            .pp-head-title { font-size: 34px !important; line-height: 1 !important; }
            .pp-head-lede { font-size: 15px; }
            .pp-head-sub { font-size: 13px; }
            .pp-head-count { align-self: flex-start; }
            .pp-featured { padding: 18px 18px !important; gap: 16px !important; }
            .pp-featured-mug { width: 64px !important; height: 64px !important; border-radius: 32px !important; }
            .pp-featured-mug-text { font-size: 22px !important; }
            .pp-featured-name { font-size: 26px !important; }
            .pp-featured-stats {
              padding-left: 0 !important;
              border-left-width: 0 !important;
              border-top-width: 1px;
              border-top-style: solid;
              border-top-color: rgba(255,255,255,0.08);
              padding-top: 14px;
              gap: 20px !important;
              width: 100%;
            }
            .pp-featured-stat-value { font-size: 24px !important; }
            .pp-search-row { flex-direction: column; align-items: stretch; gap: 10px; }
            .pp-search-box { flex: 1 1 auto; min-width: 0; }
            .pp-sort { width: 100%; }
            .pp-rail { flex-direction: column; align-items: stretch; gap: 10px; }
            .pp-rail-divider { display: none; }
            .pp-rail-group {
              flex-wrap: nowrap;
              overflow-x: auto;
              margin: 0 -12px;
              padding: 0 12px 4px;
              scrollbar-width: none;
            }
            .pp-rail-group::-webkit-scrollbar { display: none; }
            .pp-rail-label { flex-shrink: 0; align-self: center; font-size: 9px; }
            .pp-pill { flex-shrink: 0; padding: 6px 11px; font-size: 10px; }
          }
        `}</style>
      )}
      <YStack
        className="pp-screen-inner"
        style={{
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Editorial header — mirrors .pp-head from design players.css */}
        <XStack
          className="pp-head"
          justifyContent="space-between"
          alignItems="flex-end"
          gap="$6"
          flexWrap="wrap"
        >
          <YStack gap="$2" style={{ flex: 1, minWidth: 240 }}>
            <Text
              className="pp-head-eyebrow"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
              }}
            >
              Players · The Roster Room
            </Text>
            <Text
              tag="h1"
              className="pp-head-title"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '800',
                fontSize:
                  Platform.OS === 'web'
                    ? ('clamp(38px, 4.4vw, 56px)' as unknown as number)
                    : 48,
                lineHeight:
                  Platform.OS === 'web' ? ('0.95' as unknown as number) : 48,
                letterSpacing: '-0.02em',
                color: TEXT_PRIMARY,
                margin: 0,
              }}
            >
              {title}
            </Text>
            <Text
              className="pp-head-lede"
              style={{
                fontFamily: FONT_BODY,
                fontStyle: 'italic',
                fontSize: 17,
                lineHeight:
                  Platform.OS === 'web' ? ('1.5' as unknown as number) : 26,
                color: TEXT_NEUTRAL_FG3,
                maxWidth: '56ch',
                margin: 0,
              }}
            >
              Scout every name on the wire — from cornerstone keepers to the
              waiver-wire dart throws that decide a season.
            </Text>
            <Text
              className="pp-head-sub"
              style={{
                fontFamily: FONT_BODY,
                fontSize: 14,
                lineHeight:
                  Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
                color: TEXT_NEUTRAL_FG3,
                maxWidth: '56ch',
                marginTop: 4,
              }}
            >
              Filter by position, sort by the numbers that matter, and pull up
              the card on anyone worth a deeper look.
            </Text>
          </YStack>

          {/* Count chip — right-aligned "N of M matched" indicator. Now
              filter-aware (LS-4649): reads from PlayersGrid's onResultStats. */}
          <XStack className="pp-head-count" alignItems="center" gap="$2">
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 13,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: TEXT_NEUTRAL_FG3,
              }}
            >
              <Text
                tag="strong"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '800',
                  color: BRAND_GOLD_LIGHT,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 16,
                }}
              >
                {resultStats.matched}
              </Text>{' '}
              of{' '}
              <Text
                tag="strong"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '800',
                  color: BRAND_GOLD_LIGHT,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 16,
                }}
              >
                {resultStats.total}
              </Text>{' '}
              matched
            </Text>
          </XStack>
        </XStack>

        {/* ARIA live region — announces shell state transitions to screen
            readers. Mirrors PlayerStatsPage.tsx (LS-4613). Off-screen via
            standard sr-only clip pattern. */}
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
            {activeState ? STATE_ANNOUNCEMENTS[activeState] : ''}
          </div>
        )}

        {/* Filter block — mirrors `.pp-filters` from players-app.jsx.
            Search + sort row on top, filter rail in the middle, active
            summary chips below (LS-4649). Always rendered so users can
            adjust filters even when an empty/error state card is showing.
            Era/Position/Status pills are scaffold-only for this slice;
            a follow-up will wire them to the query once the Player
            fragment exposes `primaryEra` + `eligiblePositions`. */}
        {Platform.OS === 'web' && (
          <YStack className="pp-filters">
            <FilterControls
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
            <FilterRail
              era={era}
              setEra={setEra}
              pos={pos}
              setPos={setPos}
              avail={avail}
              setAvail={setAvail}
            />
            <ActiveSummary chips={chips} onClear={clearChip} />
          </YStack>
        )}

        {/* Body — state card (LS-4656) or populated Featured + grid (LS-4649). */}
        {activeState === 'loading' ? (
          <LoadingSkeleton viewMode={view} />
        ) : activeState === 'error' ? (
          <ErrorState onRetry={handleRetry} />
        ) : activeState === 'empty' ? (
          <EmptyState onClear={clearAllFilters} />
        ) : (
          <>
            {/* Featured spotlight — mirrors .pp-featured */}
            {showFeatured && featuredPlayer && (
              <FeaturedSpotlight player={featuredPlayer} />
            )}

            {/* View toggle — Cards / List / Stats. Stats is locked until the
                Stats Table slice lands (LS-4650 AC1). */}
            <ViewToggle view={view} onChange={handleViewChange} />

            {/* Grid (stats table delivered in Slice 4).
                The editorial header above is the single h1 — pass an inner
                title distinct from `title` so PlayersGrid's H2 doesn't shadow
                the page heading and trip Playwright strict-mode lookups
                (LS-3497 / auth-flows.spec.ts:575). On web, the screen's own
                editorial controls drive the grid via the controlled
                `searchTerm`/`sortBy` props (LS-4649); native still uses the
                grid's built-in controls until a native-styled rail lands. */}
            <PlayersGrid
              onPlayerSelect={handlePlayerSelect}
              pageSize={pageSize}
              showSearch={Platform.OS !== 'web'}
              showSorting={Platform.OS !== 'web'}
              title="Roster"
              searchTerm={Platform.OS === 'web' ? searchTerm : undefined}
              sortBy={Platform.OS === 'web' ? sortBy : undefined}
              onResultStats={handleResultStats}
              viewMode={view}
            />
          </>
        )}
      </YStack>
    </YStack>
  );
}

interface FilterControlsProps {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
}

function FilterControls({
  searchTerm,
  setSearchTerm,
  sortBy,
  setSortBy,
}: FilterControlsProps) {
  return (
    <XStack className="pp-search-row">
      <YStack className="pp-search-box">
        <span className="pp-search-icon" aria-hidden={true}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search by name…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search players"
        />
      </YStack>
      <select
        className="pp-sort"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
        aria-label="Sort players"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </XStack>
  );
}

interface FilterRailProps {
  era: EraId;
  setEra: (v: EraId) => void;
  pos: PositionId;
  setPos: (v: PositionId) => void;
  avail: AvailabilityId;
  setAvail: (v: AvailabilityId) => void;
}

function FilterRail({
  era,
  setEra,
  pos,
  setPos,
  avail,
  setAvail,
}: FilterRailProps) {
  return (
    <XStack
      className="pp-rail"
      role="group"
      aria-label="Filter players by era, position, or status"
    >
      <RailGroup label="Era">
        {ERAS.map((e) => (
          <RailPill
            key={e.id}
            label={e.label}
            range={'range' in e ? e.range : undefined}
            active={era === e.id}
            onPress={() => setEra(e.id)}
          />
        ))}
      </RailGroup>
      <YStack className="pp-rail-divider" aria-hidden={true} />
      <RailGroup label="Position">
        {POSITIONS.map((o) => (
          <RailPill
            key={o.id}
            label={o.label}
            dot={o.id === 'all' ? undefined : o.dot}
            active={pos === o.id}
            onPress={() => setPos(o.id)}
          />
        ))}
      </RailGroup>
      <YStack className="pp-rail-divider" aria-hidden={true} />
      <RailGroup label="Status">
        {AVAILABILITY.map((a) => (
          <RailPill
            key={a.id}
            label={a.label}
            active={avail === a.id}
            onPress={() => setAvail(a.id)}
          />
        ))}
      </RailGroup>
    </XStack>
  );
}

interface RailGroupProps {
  label: string;
  children: React.ReactNode;
}

function RailGroup({ label, children }: RailGroupProps) {
  return (
    <XStack className="pp-rail-group">
      <Text
        className="pp-rail-label"
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: TEXT_MUTED,
          marginRight: 4,
        }}
      >
        {label}
      </Text>
      {children}
    </XStack>
  );
}

interface RailPillProps {
  label: string;
  range?: string;
  dot?: string;
  active: boolean;
  onPress: () => void;
}

function RailPill({ label, range, dot, active, onPress }: RailPillProps) {
  return (
    <button
      type="button"
      className={'pp-pill' + (active ? ' on' : '')}
      onClick={onPress}
      aria-pressed={active}
    >
      {dot && (
        <span
          className="pp-pill-dot"
          style={{ backgroundColor: dot }}
          aria-hidden={true}
        />
      )}
      {label}
      {range && (
        <span
          style={{ opacity: 0.55, marginLeft: 6, fontWeight: 400 }}
          aria-hidden={true}
        >
          {range}
        </span>
      )}
    </button>
  );
}

interface ActiveSummaryProps {
  chips: ActiveFilterChip[];
  onClear: (key: 'all' | ActiveFilterChip['key']) => void;
}

function ActiveSummary({ chips, onClear }: ActiveSummaryProps) {
  if (chips.length === 0) return null;
  return (
    <XStack
      className="pp-active"
      role="status"
      aria-label="Active filters"
      aria-live="polite"
    >
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontStyle: 'italic',
          fontSize: 13,
          color: TEXT_NEUTRAL_FG3,
        }}
      >
        Showing
      </Text>
      {chips.map((chip) => (
        <span key={`${chip.key}:${chip.label}`} className="pp-tag">
          {chip.label}
          <button
            type="button"
            className="pp-tag-close"
            aria-label={`Clear ${chip.label} filter`}
            onClick={() => onClear(chip.key)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="pp-clear-all"
        onClick={() => onClear('all')}
      >
        Clear all
      </button>
    </XStack>
  );
}

// ── View toggle (LS-4650) ──────────────────────────────────────────────────

interface ViewToggleProps {
  view: PlayersViewMode;
  onChange: (next: PlayersViewMode) => void;
}

interface ViewToggleOption {
  id: PlayersViewMode;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
}

const VIEW_TOGGLE_OPTIONS: ReadonlyArray<ViewToggleOption> = [
  { id: 'cards', label: 'Cards' },
  { id: 'list', label: 'List' },
  { id: 'stats', label: 'Stats', disabled: true, disabledHint: 'Coming soon' },
];

/**
 * Pill cluster matching `.pp-viewtoggle` / `.pp-view` rules from
 * docs/design/F89Q4j6WFCFqqsZpQ4VhlQ/legacy-sports-players-page/project/players.css
 * (LS-4650 AC1). Selected option fills BRAND_NAVY with WHITE text; Stats is
 * gated as disabled until the Stats Table slice lands and exposes its tooltip
 * via `title` so users know the option is coming rather than broken.
 */
function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <XStack
      role="tablist"
      aria-label="Players view"
      className="pp-viewtoggle"
      style={{
        alignSelf: 'flex-start',
        backgroundColor: SURFACE_PANEL,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: OUTLINE_SUBTLE,
        borderRadius: 8,
        padding: 4,
        gap: 2,
      }}
    >
      {VIEW_TOGGLE_OPTIONS.map((option) => {
        const selected = option.id === view;
        return (
          <ViewToggleButton
            key={option.id}
            option={option}
            selected={selected}
            onPress={() => {
              if (!option.disabled && !selected) onChange(option.id);
            }}
          />
        );
      })}
    </XStack>
  );
}

interface ViewToggleButtonProps {
  option: ViewToggleOption;
  selected: boolean;
  onPress: () => void;
}

function ViewToggleButton({
  option,
  selected,
  onPress,
}: ViewToggleButtonProps) {
  const { id, label, disabled, disabledHint } = option;

  const labelColor = disabled
    ? TEXT_MUTED
    : selected
      ? WHITE
      : TEXT_NEUTRAL_FG3;

  return (
    <XStack
      role="tab"
      aria-selected={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      // `title` becomes the native browser tooltip on hover — surfaces the
      // "Coming soon" hint for the gated Stats option per AC1.
      {...(disabled && disabledHint ? { title: disabledHint } : {})}
      onPress={disabled ? undefined : onPress}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.55 : 1}
      style={{
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 4,
        backgroundColor: selected ? BRAND_NAVY : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        data-testid={`players-view-${id}`}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: labelColor,
        }}
      >
        {label}
      </Text>
    </XStack>
  );
}

interface FeaturedSpotlightProps {
  player: PlayerFragment;
}

function FeaturedSpotlight({ player }: FeaturedSpotlightProps) {
  // No position data on the base Player fragment — fall back to the
  // utility/heritage gold accent so the 1px stripe still reads as branded.
  const stripeColor = POS_UTILITY;

  return (
    <XStack
      role="region"
      aria-label="Player spotlight"
      className="pp-featured"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '28px 32px',
        gap: 32,
        alignItems: 'center',
        flexWrap: 'wrap',
        backgroundColor: SURFACE_CARD,
        backgroundImage:
          Platform.OS === 'web'
            ? `linear-gradient(110deg, ${withAlpha(
                BRAND_SEAM_RED,
                0.18,
              )} 0%, ${withAlpha(BRAND_NAVY, 0.45)} 38%, ${withAlpha(
                BG_DARK,
                0.95,
              )} 78%)`
            : undefined,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: withAlpha(stripeColor, 0.28),
        borderRadius: 14,
      }}
    >
      {/* Position color stripe — exactly 1px per design + AGENTS.md rules */}
      <YStack
        aria-hidden={true}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: stripeColor,
        }}
      />

      {/* Initials mug */}
      <YStack
        className="pp-featured-mug"
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: withAlpha(stripeColor, 0.18),
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: withAlpha(stripeColor, 0.5),
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text
          className="pp-featured-mug-text"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 32,
            color: TEXT_PRIMARY,
            letterSpacing: '0.02em',
          }}
        >
          {initialsOf(player)}
        </Text>
      </YStack>

      {/* Body */}
      <YStack style={{ flex: 1, minWidth: 220, gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          Player Spotlight · This Week
        </Text>
        <Text
          tag="h2"
          className="pp-featured-name"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 38,
            lineHeight: Platform.OS === 'web' ? ('1' as unknown as number) : 40,
            letterSpacing: '-0.01em',
            color: TEXT_PRIMARY,
            margin: 0,
          }}
        >
          {fullName(player) || 'Unknown Player'}
        </Text>
        {player.brefId && (
          <Text
            style={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 14,
              color: TEXT_NEUTRAL_FG3,
            }}
          >
            Baseball Reference · {player.brefId}
          </Text>
        )}
      </YStack>

      {/* Stats triplet — tabular nums. Until per-player batting/pitching
          stats flow through the Featured fragment, render the design's
          slot scaffold with em-dashes so spacing + typography still match. */}
      <XStack
        className="pp-featured-stats"
        style={{
          paddingLeft: 24,
          gap: 28,
          borderLeftWidth: 1,
          borderLeftStyle: 'solid',
          borderLeftColor: 'rgba(255,255,255,0.08)',
          flexWrap: 'wrap',
        }}
      >
        {(['AVG', 'HR', 'RBI'] as const).map((label, i) => (
          <YStack key={label} style={{ gap: 4 }}>
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: TEXT_MUTED,
              }}
            >
              {label}
            </Text>
            <Text
              className="pp-featured-stat-value"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '800',
                fontSize: 30,
                lineHeight:
                  Platform.OS === 'web' ? ('1' as unknown as number) : 32,
                color: i === 0 ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              —
            </Text>
          </YStack>
        ))}
      </XStack>
    </XStack>
  );
}

// ── Conditional state primitives (LS-4656) ─────────────────────────────────────

interface SkeletonBarProps {
  width: number | string;
  height?: number;
  radius?: number | string;
}

/** Shimmer bar (web) or static dim fill (native). Honors prefers-reduced-motion via CSS. */
function SkeletonBar({ width, height = 12, radius = 4 }: SkeletonBarProps) {
  if (Platform.OS === 'web') {
    return (
      <span
        className="pp-sk-bar"
        style={
          {
            width,
            height,
            borderRadius: radius,
            flex: '0 0 auto',
          } as React.CSSProperties
        }
      />
    );
  }
  return (
    <YStack
      style={{
        width: typeof width === 'string' ? undefined : width,
        height,
        borderRadius: typeof radius === 'string' ? 4 : radius,
        backgroundColor: 'rgba(255,255,255,0.08)',
      }}
    />
  );
}

/** Card-shaped skeleton matching the populated PlayerCard footprint. */
function CardSkeleton() {
  return (
    <YStack
      style={{
        padding: 18,
        background: SURFACE_CARD,
        border: `1px solid ${OVERLAY_WHITE_05}`,
        borderRadius: 14,
        gap: 12,
        minHeight: 198,
      }}
    >
      <XStack alignItems="center" style={{ gap: 12 }}>
        <SkeletonBar width={48} height={48} radius="50%" />
        <YStack style={{ flex: 1, gap: 6 }}>
          <SkeletonBar width="70%" height={18} />
          <SkeletonBar width="45%" height={12} />
        </YStack>
        <SkeletonBar width={30} height={18} />
      </XStack>
      <SkeletonBar width="100%" height={54} radius={6} />
      <XStack justifyContent="space-between" alignItems="center">
        <SkeletonBar width="40%" height={12} />
        <SkeletonBar width={80} height={18} radius={9999} />
      </XStack>
    </YStack>
  );
}

interface LoadingSkeletonProps {
  viewMode: PlayersViewMode;
}

/** Geometry-matching skeleton for the active view mode. */
function LoadingSkeleton({ viewMode }: LoadingSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <YStack
        testID="players-loading-skeleton"
        role="presentation"
        aria-hidden={true}
        style={{ gap: 8 }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <XStack
            key={i}
            alignItems="center"
            style={{
              gap: 12,
              padding: 12,
              background: SURFACE_CARD,
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 8,
            }}
          >
            <SkeletonBar width={36} height={36} radius="50%" />
            <YStack style={{ flex: 1, gap: 6 }}>
              <SkeletonBar width={160} height={16} />
              <SkeletonBar width={220} height={12} />
            </YStack>
            <SkeletonBar width={50} height={24} />
            <SkeletonBar width={50} height={24} />
            <SkeletonBar width={50} height={24} />
          </XStack>
        ))}
      </YStack>
    );
  }

  if (viewMode === 'stats') {
    return (
      <YStack
        testID="players-loading-skeleton"
        role="presentation"
        aria-hidden={true}
        style={{
          background: BG_ELEVATED,
          border: `1px solid ${OUTLINE_SUBTLE}`,
          borderRadius: 12,
          padding: 18,
          gap: 10,
        }}
      >
        {Array.from({ length: 8 }).map((_, r) => (
          <XStack
            key={r}
            alignItems="center"
            style={{
              gap: 12,
              padding: '10px 8px',
              borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.06)}`,
            }}
          >
            <SkeletonBar width={180} height={14} />
            {Array.from({ length: 8 }).map((__, c) => (
              <SkeletonBar key={c} width={42} height={12} />
            ))}
          </XStack>
        ))}
      </YStack>
    );
  }

  // cards (default)
  return (
    <YStack
      testID="players-loading-skeleton"
      role="presentation"
      aria-hidden={true}
      className={Platform.OS === 'web' ? 'pp-sk-grid' : undefined}
      style={
        Platform.OS === 'web' ? undefined : { gap: 16, flexDirection: 'column' }
      }
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </YStack>
  );
}

interface ErrorStateProps {
  onRetry?: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <YStack
      testID="players-error-state"
      role="alert"
      aria-live="assertive"
      style={{
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        // BRAND_SEAM_RED border per AC1 — same treatment as the Stats Page
        // ErrorCard so the two pages read as a single design system.
        border: `1px solid ${BRAND_SEAM_RED}`,
        borderRadius: 14,
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
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
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
        Connection lost
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
        The archive didn't respond. Check your connection or try again — most
        roster queries take only a moment.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading players"
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
              color: WHITE,
            }}
          >
            Retry
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

interface EmptyStateProps {
  onClear?: () => void;
}

function EmptyState({ onClear }: EmptyStateProps) {
  return (
    <YStack
      testID="players-empty-state"
      role="status"
      style={{
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 14,
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
          stroke={TEXT_MUTED}
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
        Nothing to show with those filters
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
              color: WHITE,
            }}
          >
            Clear all filters
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

export { PlayersScreen };

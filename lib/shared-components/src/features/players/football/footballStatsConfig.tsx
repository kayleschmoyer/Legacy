import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { FootballStatsDataGrid } from './FootballStatsDataGrid';
import {
  buildFootballQueryVars,
  buildFootballStatsQuery,
  DEFAULT_FOOTBALL_PAGE_SIZE,
  FOOTBALL_PAGE_SIZE_OPTIONS,
  FOOTBALL_POSITIONS,
  FOOTBALL_SEARCH_DEBOUNCE_MS,
  FOOTBALL_SEARCH_MIN_LENGTH,
  FOOTBALL_TEAM_OPTIONS,
  FOOTBALL_VIEW_TABS,
  type FootballAvailability,
  type FootballPosition,
  type FootballSortField,
  type FootballStatsFilters,
  type FootballStatsView,
  isFootballSortField,
  normalizeFootballView,
  resolveSortForView,
  TEAM_ALL,
} from './footballStatsHelpers';
import {
  FOOTBALL_STAT_COLUMNS_BY_VIEW,
  FOOTBALL_VIEW_TITLES,
} from './footballStatsColumns';
import { TabContentFade } from '../shell/TabContentFade';
import { Platform } from '../../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  getPositionColor,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import {
  FG3,
  FG4,
  FONT_BODY,
  FONT_DISPLAY,
  OUTLINE_SUBTLE,
} from '../shell/tokens';
import { NativeSelect } from '../shell/NativeSelect';
import { AdvancedFilterPanel } from '../shell/AdvancedFilterPanel';
import type {
  LeagueOption,
  SportStatsConfig,
  SportStatsController,
} from '../shell/sportStatsConfig';
import type { PlayerStatsShellState } from '../shell/StateCards';
import { csp } from '../crossPlatformStyle';

export interface FootballStatsPageProps {
  title?: string;
  showHeader?: boolean;
  showActions?: boolean;
  /**
   * Whether the viewer holds the advanced-search-filters entitlement. Gates the
   * premium advanced-filters panel (projected points / ADP). When false the
   * panel renders an upsell and the premium args are never sent.
   */
  isPremium?: boolean;
  initialFilters?: Partial<FootballStatsFilters>;
  initialPageSize?: number;
  /** Called with the `/players?…` share URL when the user taps Share. */
  onShare?: (url: string) => void;
  /** Mirror committed filter state to the host (URL round-trip). */
  onFiltersChange?: (state: {
    view: FootballStatsView;
    pageSize: number;
    filters: FootballStatsFilters;
  }) => void;
  /** Row click → host opens the player detail surface for this id. */
  onPlayerDetails?: (playerId: number) => void;
  /** Show the All / Free Agents / Rostered availability filter. */
  showAvailabilityFilter?: boolean;
  /** Player IDs rostered in the viewer's football leagues. */
  rosteredPlayerIds?: ReadonlySet<number>;
  /** Leagues for the availability-filter league picker (LS-9158). */
  leagues?: ReadonlyArray<LeagueOption>;
  leagueId?: number | null;
  onLeagueChange?: (id: number | null) => void;
  /** Optional shell-level state override (loading/error/empty). */
  state?: PlayerStatsShellState;
  onRetry?: () => void;
  onClearFilters?: () => void;
}

const NFL_HEADER = {
  eyebrow: 'Players · League Archive',
  description:
    'Every active and recent NFL player. Filter by position, compare seasons, ' +
    'and find the next addition to your dynasty roster.',
};

const selectFieldStyle = csp({
  position: 'relative' as const,
  justifyContent: 'center' as const,
  background: withAlpha(BG_DARK, 0.55),
  border: `1px solid ${OUTLINE_SUBTLE}`,
  borderRadius: 6,
  padding: '6px 30px 6px 12px',
  minHeight: 44,
});

const selectLabelStyle = csp({
  fontFamily: FONT_DISPLAY,
  fontWeight: '700' as const,
  fontSize: 10,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
  color: FG3,
});

const chevronStyle = csp({
  position: 'absolute' as const,
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: FG3,
  fontSize: 12,
  pointerEvents: 'none' as const,
});

const numericInputStyle = {
  backgroundColor: withAlpha(BG_DARK, 0.55),
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  borderRadius: 8,
  paddingHorizontal: 12,
  height: 40,
  color: TEXT_PRIMARY,
  fontSize: 13,
  fontFamily: FONT_BODY,
  width: 140,
} as const;

/**
 * Position multi-select pill row with WAI-ARIA toolbar-style roving tabindex:
 * exactly one pill sits in the tab order at a time, Arrow keys move focus
 * (wrapping), Home/End jump to the ends, and Space/Enter toggle the focused
 * pill (Pressable's built-in keyboard activation). Restores the keyboard
 * parity the standalone football players page had (LS-6466) after the LS-9077
 * route consolidation dropped it (LS-9371). `onKeyDown`/`tabIndex` are
 * web-only; native platforms ignore them.
 */
function FootballPositionPillGroup({
  positions,
  onToggle,
  onClear,
}: {
  positions: FootballPosition[];
  onToggle: (pos: FootballPosition) => void;
  onClear: () => void;
}) {
  // Index 0 is the "All" pill; positions follow at 1..N. Defaults to "All".
  const pillCount = FOOTBALL_POSITIONS.length + 1;
  const [focusIdx, setFocusIdx] = useState(0);

  return (
    <XStack
      gap={6}
      flexWrap="wrap"
      alignItems="center"
      role="group"
      aria-label="Filter by position"
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        let next: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          next = (focusIdx + 1) % pillCount;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          next = (focusIdx - 1 + pillCount) % pillCount;
        } else if (e.key === 'Home') {
          next = 0;
        } else if (e.key === 'End') {
          next = pillCount - 1;
        }
        if (next !== null) {
          e.preventDefault();
          setFocusIdx(next);
          // Every pill (and nothing else in the group) carries aria-pressed.
          e.currentTarget
            .querySelectorAll<HTMLElement>('[aria-pressed]')
            [next]?.focus();
        }
      }}
    >
      <Pressable
        onPress={() => {
          setFocusIdx(0);
          onClear();
        }}
        accessibilityRole="button"
        accessibilityLabel="All positions"
        accessibilityState={{ selected: positions.length === 0 }}
        aria-pressed={positions.length === 0}
        tabIndex={focusIdx === 0 ? 0 : -1}
        style={csp({
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: positions.length === 0 ? BRAND_NAVY : OUTLINE_SUBTLE,
          backgroundColor:
            positions.length === 0 ? withAlpha(BRAND_NAVY, 0.3) : 'transparent',
        })}
      >
        <Text
          style={csp({
            fontFamily: FONT_BODY,
            fontSize: 13,
            fontWeight: '600',
            color: positions.length === 0 ? TEXT_PRIMARY : FG3,
          })}
        >
          All
        </Text>
      </Pressable>
      {FOOTBALL_POSITIONS.map((pos, i) => {
        const active = positions.includes(pos);
        const accent = getPositionColor('football', pos);
        return (
          <Pressable
            key={pos}
            onPress={() => {
              setFocusIdx(i + 1);
              onToggle(pos);
            }}
            accessibilityRole="button"
            accessibilityLabel={pos}
            accessibilityState={{ selected: active }}
            aria-pressed={active}
            tabIndex={focusIdx === i + 1 ? 0 : -1}
            style={csp({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: active ? accent : OUTLINE_SUBTLE,
              backgroundColor: active ? withAlpha(accent, 0.3) : 'transparent',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_BODY,
                fontSize: 13,
                fontWeight: '600',
                color: active ? accent : FG3,
              })}
            >
              {pos}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Debounce a changing value by `delay` ms. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setDebounced(value);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, delay]);
  return debounced;
}

/**
 * Football player-stats controller. Owns the live-filter model (multi-select
 * positions, team/conference/FA, debounced search, premium projected-points /
 * ADP, availability), the stats-grid view tabs (Overview +
 * six category leader boards, LS-8566), the server-side sort, and the paged
 * {@link FootballStatsDataGrid}, exposed as the sport-neutral
 * {@link SportStatsController} the shared shell renders (LS-8442). Unlike
 * baseball there is no draft→Apply state machine — every control commits live.
 */
export function useFootballController(
  props: FootballStatsPageProps,
): SportStatsController {
  const {
    title = 'NFL Player Statistics',
    isPremium = false,
    initialFilters = {},
    initialPageSize = DEFAULT_FOOTBALL_PAGE_SIZE,
    onShare,
    onFiltersChange,
    onPlayerDetails,
    showAvailabilityFilter = false,
    rosteredPlayerIds,
    leagues,
    leagueId,
    onLeagueChange,
    state,
    onRetry,
    onClearFilters,
  } = props;

  // Active stats-grid view/tab (LS-8566). Seeded once from the URL (matching
  // the initialFilters pattern); subsequent changes flow through the tab strip.
  const [view, setView] = useState<FootballStatsView>(() =>
    normalizeFootballView(initialFilters.view),
  );

  const [positions, setPositions] = useState<FootballPosition[]>(
    () => initialFilters.positions ?? [],
  );
  const [team, setTeam] = useState<string>(initialFilters.team ?? TEAM_ALL);
  const [searchInput, setSearchInput] = useState<string>(
    initialFilters.searchTerm ?? '',
  );
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  // The initial value can come from an untrusted URL param, so allow-list it
  // against the grid's sortable fields before it can reach the GraphQL vars.
  const [sortField, setSortField] = useState<FootballSortField | undefined>(
    () =>
      initialFilters.sortField && isFootballSortField(initialFilters.sortField)
        ? initialFilters.sortField
        : undefined,
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    initialFilters.sortDir ?? 'asc',
  );
  const [availabilityFilter, setAvailabilityFilter] =
    useState<FootballAvailability>(initialFilters.availabilityFilter ?? 'all');

  // Premium advanced filters.
  const [minProjectedInput, setMinProjectedInput] = useState<string>(
    initialFilters.minProjectedPoints != null
      ? String(initialFilters.minProjectedPoints)
      : '',
  );
  const [maxAdpInput, setMaxAdpInput] = useState<string>(
    initialFilters.maxAdpRank != null ? String(initialFilters.maxAdpRank) : '',
  );

  const debouncedSearch = useDebounce(searchInput, FOOTBALL_SEARCH_DEBOUNCE_MS);
  const debouncedMinProjected = useDebounce(
    minProjectedInput,
    FOOTBALL_SEARCH_DEBOUNCE_MS,
  );
  const debouncedMaxAdp = useDebounce(maxAdpInput, FOOTBALL_SEARCH_DEBOUNCE_MS);

  // Premium args only apply for premium users; empty/invalid input → undefined.
  const parsedMinProjected =
    isPremium && debouncedMinProjected.trim() !== ''
      ? Number(debouncedMinProjected)
      : NaN;
  const minProjectedArg = Number.isFinite(parsedMinProjected)
    ? parsedMinProjected
    : undefined;
  const parsedMaxAdp =
    isPremium && debouncedMaxAdp.trim() !== ''
      ? Number.parseInt(debouncedMaxAdp, 10)
      : NaN;
  const maxAdpArg = Number.isFinite(parsedMaxAdp) ? parsedMaxAdp : undefined;

  // The effective sort the grid displays and the server receives — an unset or
  // foreign-view sort resolves to the view's default leaders ordering.
  const effectiveSort = resolveSortForView(view, sortField, sortDir);

  const queryVars = useMemo(
    () =>
      buildFootballQueryVars({
        view,
        positions,
        team,
        search: debouncedSearch,
        sortField,
        sortDir,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    [
      view,
      positions,
      team,
      debouncedSearch,
      sortField,
      sortDir,
      minProjectedArg,
      maxAdpArg,
    ],
  );

  const resetKey = useMemo(
    () => JSON.stringify({ queryVars, pageSize }),
    [queryVars, pageSize],
  );

  // ── Mirror committed filters to the host (URL round-trip) ──────────
  useEffect(() => {
    if (!onFiltersChange) return;
    const filters: FootballStatsFilters = {};
    if (positions.length > 0) filters.positions = positions;
    if (team !== TEAM_ALL) filters.team = team;
    if (debouncedSearch.trim().length >= FOOTBALL_SEARCH_MIN_LENGTH) {
      filters.searchTerm = debouncedSearch.trim();
    }
    if (sortField) {
      filters.sortField = sortField;
      filters.sortDir = sortDir;
    }
    if (minProjectedArg != null) filters.minProjectedPoints = minProjectedArg;
    if (maxAdpArg != null) filters.maxAdpRank = maxAdpArg;
    onFiltersChange({ view, pageSize, filters });
  }, [
    onFiltersChange,
    view,
    positions,
    team,
    debouncedSearch,
    sortField,
    sortDir,
    minProjectedArg,
    maxAdpArg,
    pageSize,
  ]);

  // Tab change resets the sort to the new view's default leaders ordering — a
  // stat sort from the previous tab is invalid on the next one. Clearing (not
  // copying) the sort keeps the view-default sort out of the URL.
  const handleViewChange = useCallback((next: string) => {
    setView(normalizeFootballView(next));
    setSortField(undefined);
    setSortDir('asc');
  }, []);

  // Header click on the grid — commits an explicit sort.
  const handleSortChange = useCallback(
    (field: FootballSortField, dir: 'asc' | 'desc') => {
      setSortField(field);
      setSortDir(dir);
    },
    [],
  );

  const togglePosition = useCallback((pos: FootballPosition) => {
    setPositions((cur) =>
      cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos],
    );
  }, []);

  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(
      buildFootballStatsQuery({
        view,
        positions,
        team,
        search: debouncedSearch,
        pageSize,
        sortField,
        sortDir,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    );
  }, [
    onShare,
    view,
    positions,
    team,
    debouncedSearch,
    pageSize,
    sortField,
    sortDir,
    minProjectedArg,
    maxAdpArg,
  ]);

  const urlPreview = useMemo(
    () =>
      buildFootballStatsQuery({
        view,
        positions,
        team,
        search: debouncedSearch,
        pageSize,
        sortField,
        sortDir,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    [
      view,
      positions,
      team,
      debouncedSearch,
      pageSize,
      sortField,
      sortDir,
      minProjectedArg,
      maxAdpArg,
    ],
  );

  const handlePlayerSelect = useCallback(
    (playerId: number) => {
      onPlayerDetails?.(playerId);
    },
    [onPlayerDetails],
  );

  const handleClearFilters = useCallback(() => {
    setPositions([]);
    setTeam(TEAM_ALL);
    setSearchInput('');
    setSortField(undefined);
    setSortDir('asc');
    setMinProjectedInput('');
    setMaxAdpInput('');
    onClearFilters?.();
  }, [onClearFilters]);

  // ── Render: toolbar controls (search + positions + team + rows) ────
  const renderToolbarControls = useCallback((): React.ReactNode => {
    return (
      <>
        {/* Search */}
        <YStack
          style={csp({
            position: 'relative',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            background: withAlpha(BG_DARK, 0.55),
            border: `1px solid ${OUTLINE_SUBTLE}`,
            borderRadius: 6,
            padding: '0 12px 0 38px',
            minHeight: 44,
          })}
        >
          {Platform.OS === 'web' && (
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
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search players…"
            placeholderTextColor={FG4}
            accessibilityLabel="Search players"
            aria-label="Search players"
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
          {searchInput ? (
            <Pressable
              onPress={() => setSearchInput('')}
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

        {/* Position multi-select pills (roving tabindex — LS-9371) */}
        <FootballPositionPillGroup
          positions={positions}
          onToggle={togglePosition}
          onClear={() => setPositions([])}
        />

        {/* Team select */}
        <YStack style={selectFieldStyle}>
          <Text style={selectLabelStyle}>Team</Text>
          {Platform.OS === 'web' ? (
            <select
              className="ps-select-native"
              name="team-filter"
              aria-label="Team"
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
              }}
            >
              {FOOTBALL_TEAM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <NativeSelect
              label="Team"
              value={
                FOOTBALL_TEAM_OPTIONS.find((t) => t.value === team)?.label ??
                team
              }
              options={FOOTBALL_TEAM_OPTIONS.map((t) => t.label)}
              onChange={(label) => {
                const match = FOOTBALL_TEAM_OPTIONS.find(
                  (t) => t.label === label,
                );
                if (match) setTeam(match.value);
              }}
            />
          )}
          {Platform.OS === 'web' && <Text style={chevronStyle}>▾</Text>}
        </YStack>

        {/* Rows per page */}
        <YStack testID="page-size-select" style={selectFieldStyle}>
          <Text style={selectLabelStyle}>Rows</Text>
          {Platform.OS === 'web' ? (
            <select
              className="ps-select-native"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
              }}
            >
              {FOOTBALL_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <NativeSelect
              label="Rows"
              value={String(pageSize)}
              options={FOOTBALL_PAGE_SIZE_OPTIONS.map(String)}
              onChange={(next) => setPageSize(Number(next))}
            />
          )}
          {Platform.OS === 'web' && <Text style={chevronStyle}>▾</Text>}
        </YStack>
      </>
    );
  }, [searchInput, positions, team, pageSize, togglePosition]);

  // ── Render: advanced (premium) filters ─────────────────────────────
  const renderAdvancedPanel = useCallback((): React.ReactNode => {
    if (!isPremium) {
      return (
        <AdvancedFilterPanel title="Advanced Filters · Premium" grid={false}>
          <Text
            style={csp({
              fontFamily: FONT_BODY,
              fontSize: 14,
              color: FG3,
              lineHeight: Platform.OS === 'web' ? (1.5 as never) : 21,
            })}
          >
            Filter players by projected fantasy points and ADP rank with
            Premium.
          </Text>
        </AdvancedFilterPanel>
      );
    }
    return (
      <AdvancedFilterPanel
        title="Advanced Filters"
        resetLabel="Reset"
        grid={false}
        onReset={() => {
          setMinProjectedInput('');
          setMaxAdpInput('');
        }}
      >
        <YStack gap={14}>
          {/* Numeric thresholds */}
          <XStack gap={16} flexWrap="wrap">
            <YStack gap={6}>
              <Text style={selectLabelStyle}>Min Projected Pts</Text>
              <TextInput
                value={minProjectedInput}
                onChangeText={setMinProjectedInput}
                keyboardType="numeric"
                inputMode="decimal"
                placeholder="e.g. 150"
                placeholderTextColor={FG4}
                accessibilityLabel="Minimum projected points"
                aria-label="Minimum projected points"
                style={numericInputStyle}
              />
            </YStack>
            <YStack gap={6}>
              <Text style={selectLabelStyle}>Max ADP Rank</Text>
              <TextInput
                value={maxAdpInput}
                onChangeText={setMaxAdpInput}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder="e.g. 50"
                placeholderTextColor={FG4}
                accessibilityLabel="Maximum ADP rank"
                aria-label="Maximum ADP rank"
                style={numericInputStyle}
              />
            </YStack>
          </XStack>
        </YStack>
      </AdvancedFilterPanel>
    );
  }, [isPremium, minProjectedInput, maxAdpInput]);

  // ── Render: projections upsell + data grid ─────────────────────────
  const renderContent = useCallback((): React.ReactNode => {
    return (
      <YStack gap={16}>
        {!isPremium && (
          <XStack
            style={csp({
              backgroundColor: withAlpha(BRAND_GOLD, 0.08),
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: withAlpha(BRAND_GOLD, 0.35),
              borderRadius: 10,
              padding: 14,
              gap: 8,
              alignItems: 'center',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 14,
                color: BRAND_GOLD_LIGHT,
              })}
            >
              Unlock Projected Fantasy Points
            </Text>
            <Text
              style={csp({ fontFamily: FONT_BODY, fontSize: 12, color: FG3 })}
            >
              Upgrade to Premium to see weekly projected points for every
              player.
            </Text>
          </XStack>
        )}
        <TabContentFade key={view}>
          <FootballStatsDataGrid
            queryVars={queryVars}
            columns={FOOTBALL_STAT_COLUMNS_BY_VIEW[view]}
            title={FOOTBALL_VIEW_TITLES[view]}
            pageSize={pageSize}
            resetKey={resetKey}
            sortField={effectiveSort.sortField}
            sortDir={effectiveSort.sortDir}
            onSortChange={handleSortChange}
            onPageSizeChange={setPageSize}
            onPlayerSelect={handlePlayerSelect}
            rosteredPlayerIds={
              showAvailabilityFilter ? rosteredPlayerIds : undefined
            }
            availabilityFilter={
              showAvailabilityFilter ? availabilityFilter : undefined
            }
            loadingColumnCount={3 + FOOTBALL_STAT_COLUMNS_BY_VIEW[view].length}
          />
        </TabContentFade>
      </YStack>
    );
  }, [
    isPremium,
    view,
    queryVars,
    pageSize,
    resetKey,
    effectiveSort.sortField,
    effectiveSort.sortDir,
    handleSortChange,
    handlePlayerSelect,
    showAvailabilityFilter,
    rosteredPlayerIds,
    availabilityFilter,
  ]);

  return {
    header: {
      eyebrow: NFL_HEADER.eyebrow,
      title,
      description: NFL_HEADER.description,
    },
    urlPreview,
    onShare: handleShare,
    canExport: false,
    exportFormats: [],
    onExport: () => undefined,
    tabs: FOOTBALL_VIEW_TABS.map((t) => ({ id: t.key, label: t.label })),
    activeTab: view,
    onTabChange: handleViewChange,
    tablistAriaLabel: 'Stat category',
    renderToolbarControls,
    hasPendingChanges: false,
    onApply: undefined,
    canCustomizeColumns: false,
    isColumnCustomized: false,
    toggleableColumns: [],
    effectiveVisibleKeys: new Set<string>(),
    onToggleColumn: () => undefined,
    onResetColumns: () => undefined,
    showAvailability: showAvailabilityFilter,
    availabilityValue: availabilityFilter,
    onAvailabilityChange: setAvailabilityFilter,
    leagues,
    leagueId,
    onLeagueChange,
    renderAdvancedPanel,
    shellState: state,
    onRetry,
    onClearFilters: handleClearFilters,
    loadingColumnCount: 3 + FOOTBALL_STAT_COLUMNS_BY_VIEW[view].length,
    renderContent,
  };
}

/** Football binding of the sport-agnostic stats config. */
export const footballStatsConfig: SportStatsConfig<FootballStatsPageProps> = {
  sport: 'nfl',
  useController: useFootballController,
};

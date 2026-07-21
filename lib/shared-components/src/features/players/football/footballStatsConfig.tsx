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
  type FootballAvailability,
  type FootballPosition,
  type FootballSortField,
  type FootballStatsFilters,
  INJURY_STATUS_OPTIONS,
  isFootballSortField,
  TEAM_ALL,
} from './footballStatsHelpers';
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
   * premium advanced-filters panel (injury / projected points / ADP). When
   * false the panel renders an upsell and the premium args are never sent.
   */
  isPremium?: boolean;
  initialFilters?: Partial<FootballStatsFilters>;
  initialPageSize?: number;
  /** Called with the `/players/stats?…` share URL when the user taps Share. */
  onShare?: (url: string) => void;
  /** Mirror committed filter state to the host (URL round-trip). */
  onFiltersChange?: (state: {
    pageSize: number;
    filters: FootballStatsFilters;
  }) => void;
  /** Row click → host opens the player detail surface for this id. */
  onPlayerDetails?: (playerId: number) => void;
  /** Show the All / Free Agents / Rostered availability filter. */
  showAvailabilityFilter?: boolean;
  /** Player IDs rostered in the viewer's football leagues. */
  rosteredPlayerIds?: ReadonlySet<number>;
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
  letterSpacing: '0.14em',
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
 * positions, team/conference/FA, debounced search, sort, premium injury /
 * projected-points / ADP, availability) and the cursor-paginated
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
    state,
    onRetry,
    onClearFilters,
  } = props;

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
  const [injuryStatus, setInjuryStatus] = useState<string | null>(
    initialFilters.injuryStatus ?? null,
  );
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
  const injuryStatusArg = isPremium && injuryStatus ? injuryStatus : undefined;
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

  const queryVars = useMemo(
    () =>
      buildFootballQueryVars({
        positions,
        team,
        search: debouncedSearch,
        sortField,
        sortDir,
        injuryStatus: injuryStatusArg ?? null,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    [
      positions,
      team,
      debouncedSearch,
      sortField,
      sortDir,
      injuryStatusArg,
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
    if (injuryStatusArg) filters.injuryStatus = injuryStatusArg;
    if (minProjectedArg != null) filters.minProjectedPoints = minProjectedArg;
    if (maxAdpArg != null) filters.maxAdpRank = maxAdpArg;
    onFiltersChange({ pageSize, filters });
  }, [
    onFiltersChange,
    positions,
    team,
    debouncedSearch,
    sortField,
    sortDir,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
    pageSize,
  ]);

  const togglePosition = useCallback((pos: FootballPosition) => {
    setPositions((cur) =>
      cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos],
    );
  }, []);

  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(
      buildFootballStatsQuery({
        positions,
        team,
        search: debouncedSearch,
        pageSize,
        sortField,
        sortDir,
        injuryStatus: injuryStatusArg ?? null,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    );
  }, [
    onShare,
    positions,
    team,
    debouncedSearch,
    pageSize,
    sortField,
    sortDir,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
  ]);

  const urlPreview = useMemo(
    () =>
      buildFootballStatsQuery({
        positions,
        team,
        search: debouncedSearch,
        pageSize,
        sortField,
        sortDir,
        injuryStatus: injuryStatusArg ?? null,
        minProjectedPoints: minProjectedArg,
        maxAdpRank: maxAdpArg,
      }),
    [
      positions,
      team,
      debouncedSearch,
      pageSize,
      sortField,
      sortDir,
      injuryStatusArg,
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
    setInjuryStatus(null);
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

        {/* Position multi-select pills */}
        <XStack
          gap={6}
          flexWrap="wrap"
          alignItems="center"
          role="group"
          aria-label="Filter by position"
        >
          <Pressable
            onPress={() => setPositions([])}
            accessibilityRole="button"
            accessibilityLabel="All positions"
            accessibilityState={{ selected: positions.length === 0 }}
            aria-pressed={positions.length === 0}
            style={csp({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: positions.length === 0 ? BRAND_NAVY : OUTLINE_SUBTLE,
              backgroundColor:
                positions.length === 0
                  ? withAlpha(BRAND_NAVY, 0.3)
                  : 'transparent',
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
          {FOOTBALL_POSITIONS.map((pos) => {
            const active = positions.includes(pos);
            const accent = getPositionColor('football', pos);
            return (
              <Pressable
                key={pos}
                onPress={() => togglePosition(pos)}
                accessibilityRole="button"
                accessibilityLabel={pos}
                accessibilityState={{ selected: active }}
                aria-pressed={active}
                style={csp({
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: active ? accent : OUTLINE_SUBTLE,
                  backgroundColor: active
                    ? withAlpha(accent, 0.3)
                    : 'transparent',
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
            Filter players by projected fantasy points, ADP rank, and injury
            status with Premium.
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
          setInjuryStatus(null);
          setMinProjectedInput('');
          setMaxAdpInput('');
        }}
      >
        <YStack gap={14}>
          {/* Injury status */}
          <YStack gap={6}>
            <Text style={selectLabelStyle}>Injury Status</Text>
            {Platform.OS === 'web' ? (
              <YStack style={csp({ ...selectFieldStyle, maxWidth: 220 })}>
                <select
                  className="ps-select-native"
                  aria-label="Injury status"
                  value={injuryStatus ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInjuryStatus(v === '' ? null : v);
                  }}
                >
                  {INJURY_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Text style={chevronStyle}>▾</Text>
              </YStack>
            ) : (
              <NativeSelect
                label="Injury Status"
                value={
                  INJURY_STATUS_OPTIONS.find((o) => o.value === injuryStatus)
                    ?.label ?? 'Any'
                }
                options={INJURY_STATUS_OPTIONS.map((o) => o.label)}
                onChange={(label) => {
                  const match = INJURY_STATUS_OPTIONS.find(
                    (o) => o.label === label,
                  );
                  setInjuryStatus(match?.value ?? null);
                }}
              />
            )}
          </YStack>

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
  }, [isPremium, injuryStatus, minProjectedInput, maxAdpInput]);

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
        <FootballStatsDataGrid
          queryVars={queryVars}
          pageSize={pageSize}
          resetKey={resetKey}
          onPlayerSelect={handlePlayerSelect}
          rosteredPlayerIds={
            showAvailabilityFilter ? rosteredPlayerIds : undefined
          }
          availabilityFilter={
            showAvailabilityFilter ? availabilityFilter : undefined
          }
        />
      </YStack>
    );
  }, [
    isPremium,
    queryVars,
    pageSize,
    resetKey,
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
    tabs: [],
    activeTab: '',
    onTabChange: () => undefined,
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
    renderAdvancedPanel,
    shellState: state,
    onRetry,
    onClearFilters: handleClearFilters,
    loadingColumnCount: 3,
    renderContent,
  };
}

/** Football binding of the sport-agnostic stats config. */
export const footballStatsConfig: SportStatsConfig<FootballStatsPageProps> = {
  sport: 'nfl',
  useController: useFootballController,
};

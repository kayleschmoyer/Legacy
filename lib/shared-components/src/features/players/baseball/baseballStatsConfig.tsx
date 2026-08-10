import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, TextInput } from 'react-native';
import { Text, YStack } from 'tamagui';
import type { CareerPitchingFragment } from '@legacy-sports/graphql';
import {
  type AppliedFilters,
  AVG_MAX,
  AVG_STEP,
  battingPlayerTypeForViewMode,
  battingSortFilter,
  buildShareUrl,
  clampPageSizeForViewMode,
  createClearFiltersHandler,
  DEFAULT_BATTING_SORT_BY,
  DEFAULT_BATTING_SORT_DIR,
  enforceSearchMinLength,
  ERA_MAX_OFF,
  hasPendingFilterChanges,
  HR_MAX,
  HR_STEP,
  MIN_SEARCH_LENGTH,
  MLB_TEAMS,
  normalizeViewMode,
  pageSizeOptionsForViewMode,
  POSITIONS,
  RBI_MAX,
  RBI_STEP,
  SO_MAX,
  SO_STEP,
  STATS_COLUMN_GROUPS,
  WINS_MAX,
  WINS_STEP,
} from './baseballStatsHelpers';
import { Platform } from '../../../platform-components';
import { BG_DARK, TEXT_PRIMARY, withAlpha } from '../../../utils/colors';
import {
  FG3,
  FG4,
  FONT_BODY,
  FONT_DISPLAY,
  OUTLINE_SUBTLE,
} from '../shell/tokens';
import { StatSlider } from '../shell/StatSlider';
import { NativeSelect } from '../shell/NativeSelect';
import { TabContentFade } from '../shell/TabContentFade';
import { AdvancedFilterPanel } from '../shell/AdvancedFilterPanel';
import type {
  AvailabilityValue,
  LeagueOption,
  SportStatsConfig,
  SportStatsController,
} from '../shell/sportStatsConfig';
import type { PlayerStatsShellState } from '../shell/StateCards';
import {
  BATTING_NAME_COLUMN_KEY,
  CAREER_STATS_COLUMNS,
  isValidBattingSortField,
  PlayerStatsDataGrid,
} from '../PlayerStatsDataGrid';
import {
  PITCHING_NAME_COLUMN_KEY,
  PITCHING_STATS_COLUMNS,
  PitchingStatsDataGrid,
} from '../PitchingStatsDataGrid';
import {
  buildToggleableColumns,
  type ColumnGroup,
  presetVisibleKeys,
  type ToggleableColumn,
  toggleColumnKey,
} from '../columnVisibility';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from '../PlayerStatsTypes';
import type { PlayerCareerStats } from '../services/CareerStatsService';
import { csp } from '../crossPlatformStyle';

/** Export file format options for the player-stats download (PST-014 / LS-7112). */
export type ExportFormat = 'json' | 'csv' | 'xlsx';

/**
 * The currently displayed result set, surfaced to a host so it can serialize the
 * actual player rows the user is looking at — not just the filter spec (PST-011).
 */
export interface PlayerStatsExportData {
  batting: readonly PlayerCareerStats[];
  pitching: readonly CareerPitchingFragment[];
}

export interface PlayerStatsPageProps {
  title?: string;
  initialViewMode?: PlayerStatsViewMode;
  initialFilters?: Partial<PlayerStatsFilters>;
  initialPageSize?: number;
  showHeader?: boolean;
  showActions?: boolean;
  canExport?: boolean;
  canCustomizeColumns?: boolean;
  isPremiumPageSize?: boolean;
  statsFormat?: 'standard' | 'expanded';
  initialVisibleColumns?: readonly string[] | null;
  onVisibleColumnsChange?: (visibleColumns: string[] | null) => void;
  state?: PlayerStatsShellState;
  onRetry?: () => void;
  onClearFilters?: () => void;
  onPlayerDetails?: (player: PlayerWithStats) => void;
  exportFormats?: readonly ExportFormat[];
  onExport?: (
    filters: PlayerStatsFilters,
    viewMode: PlayerStatsViewMode,
    format?: ExportFormat,
  ) => void;
  onVisibleRowsChange?: (data: PlayerStatsExportData) => void;
  onShare?: (url: string) => void;
  onFiltersChange?: (state: {
    viewMode: 'combined' | 'hitters' | 'pitchers';
    pageSize: number;
    filters: PlayerStatsFilters;
  }) => void;
  showAvailabilityFilter?: boolean;
  rosteredPlayerIds?: ReadonlySet<number>;
  /** Leagues for the availability-filter league picker (LS-9158). */
  leagues?: ReadonlyArray<LeagueOption>;
  leagueId?: number | null;
  onLeagueChange?: (id: number | null) => void;
}

const SKELETON_COLS_BY_MODE: Record<
  'combined' | 'hitters' | 'pitchers',
  number
> = {
  combined: 12,
  hitters: 10,
  pitchers: 9,
};

const BASEBALL_HEADER = {
  eyebrow: 'Players · League Archive',
  description:
    'Every qualified hitter and pitcher across the archive. Draft legends, ' +
    'compare seasons, and build your dynasty on the numbers that actually happened.',
};

const BASEBALL_TABS = [
  { id: 'combined', label: 'Combined' },
  { id: 'hitters', label: 'Hitters' },
  { id: 'pitchers', label: 'Pitchers' },
] as const;

// Reusable field-wrapper styling for the toolbar selects.
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

/**
 * Baseball player-stats controller. Owns the full draft→Apply filter state
 * machine, batting/pitching grids, sort, column visibility, availability, and
 * export/share — and exposes it as a sport-neutral {@link SportStatsController}
 * the shared shell renders. This is a faithful relocation of the former
 * PlayerStatsPage monolith's stateful body.
 */
export function useBaseballController(
  props: PlayerStatsPageProps,
): SportStatsController {
  const {
    title = 'Player Statistics',
    initialViewMode = 'combined',
    initialFilters = {},
    initialPageSize = 25,
    canExport = true,
    canCustomizeColumns = true,
    exportFormats = ['json'] as readonly ExportFormat[],
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
    leagues,
    leagueId,
    onLeagueChange,
  } = props;

  // ── View mode ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'combined' | 'hitters' | 'pitchers'>(
    () => normalizeViewMode(initialViewMode),
  );

  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityValue>(initialFilters.availabilityFilter ?? 'all');

  // ── Batting sort state (persisted to URL) ──────────────────────
  // The initial value can come from an untrusted URL param, so allow-list it
  // against the grid's sortable fields (LS-7115) before it can ever reach the
  // GraphQL `orderBy` variable via battingParams.
  const [sortBy, setSortBy] = useState(() => {
    const initial = initialFilters.sortBy ?? DEFAULT_BATTING_SORT_BY;
    return isValidBattingSortField(initial) ? initial : DEFAULT_BATTING_SORT_BY;
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => initialFilters.sortDir ?? DEFAULT_BATTING_SORT_DIR,
  );

  // ── Toolbar draft state (not applied until applyFilters()) ─────
  const [search, setSearch] = useState(initialFilters.searchTerm ?? '');
  const [position, setPosition] = useState(
    initialFilters.position ?? 'All Positions',
  );
  const [team, setTeam] = useState(initialFilters.team ?? 'All Teams');
  const [pageSize, setPageSize] = useState(() =>
    clampPageSizeForViewMode(
      initialPageSize,
      normalizeViewMode(initialViewMode),
    ),
  );

  // ── Column visibility (LS-7105) ────────────────────────────────
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

  const hasPendingChanges = useMemo(
    () => hasPendingFilterChanges(committedDraft, appliedFilters),
    [committedDraft, appliedFilters],
  );

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

  // Stringify-based key forces grid unmount/remount on each filter commit.
  const appliedKey = JSON.stringify(appliedFilters);
  const battingKey = `batting-${appliedKey}`;
  const pitchingKey = `pitching-${appliedKey}`;

  const battingParams = useMemo(
    () => ({
      first: appliedFilters.pageSize,
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
      playerType: battingPlayerTypeForViewMode(viewMode),
    }),
    [appliedFilters, viewMode, sortBy, sortDir],
  );

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
  const battingRowsRef = useRef<readonly PlayerCareerStats[]>([]);
  const pitchingRowsRef = useRef<readonly CareerPitchingFragment[]>([]);

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

  useEffect(() => {
    emitVisibleRows();
  }, [emitVisibleRows]);

  const handleExportFormat = useCallback(
    (format: ExportFormat) => {
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
    onShare(buildShareUrl(viewMode, appliedFilters, sortBy, sortDir));
  }, [onShare, viewMode, appliedFilters, sortBy, sortDir]);

  // ── Visibility flags ───────────────────────────────────────────
  const showBatting = viewMode === 'combined' || viewMode === 'hitters';
  const showPitching = viewMode === 'combined' || viewMode === 'pitchers';

  const pageSizeOptions = pageSizeOptionsForViewMode(
    viewMode,
    isPremiumPageSize,
  );

  // ── Column picker derived state (LS-7105) ──────────────────────
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

  const activePresetKeys = useMemo(
    () => presetVisibleKeys(activeColumnGroups, statsFormat),
    [activeColumnGroups, statsFormat],
  );

  const fullPresetKeys = useMemo(
    () => presetVisibleKeys(STATS_COLUMN_GROUPS, statsFormat),
    [statsFormat],
  );

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

  // ── Render: toolbar controls (search + Position/Team/Rows) ─────
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
        <YStack style={selectFieldStyle}>
          <Text style={selectLabelStyle}>Position</Text>
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
          {Platform.OS === 'web' && <Text style={chevronStyle}>▾</Text>}
        </YStack>

        {/* Team select */}
        <YStack style={selectFieldStyle}>
          <Text style={selectLabelStyle}>Team</Text>
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
          {Platform.OS === 'web' && <Text style={chevronStyle}>▾</Text>}
        </YStack>

        {/* Rows per page */}
        <YStack testID="page-size-select" style={selectFieldStyle}>
          <Text style={selectLabelStyle}>Rows</Text>
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
          {Platform.OS === 'web' && <Text style={chevronStyle}>▾</Text>}
        </YStack>
      </>
    );
  }, [search, applyFilters, position, team, pageSize, pageSizeOptions]);

  // ── Render: advanced stat-range sliders ────────────────────────
  const renderAdvancedPanel = useCallback((): React.ReactNode => {
    return (
      <AdvancedFilterPanel
        title="Stat Ranges"
        resetLabel="Reset ranges"
        onReset={() => {
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
          format={(v) => (v >= AVG_MAX ? '—' : v.toFixed(3).replace(/^0/, ''))}
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
      </AdvancedFilterPanel>
    );
  }, [
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
    applyFilters,
  ]);

  // ── Render: batting/pitching data grids ────────────────────────
  const renderContent = useCallback((): React.ReactNode => {
    return (
      <>
        {showBatting && (
          <TabContentFade key={battingKey}>
            <PlayerStatsDataGrid
              title="MLB Career Batting Leaders"
              initialParams={battingParams}
              onPlayerSelect={handleBattingPlayerClick}
              onSortChange={handleBattingSortChange}
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

        {showPitching && (
          <TabContentFade key={pitchingKey}>
            <PitchingStatsDataGrid
              title="MLB Career Pitching Leaders"
              initialParams={pitchingParams}
              onPlayerSelect={handlePitchingPlayerClick}
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
    );
  }, [
    showBatting,
    showPitching,
    battingKey,
    pitchingKey,
    battingParams,
    pitchingParams,
    handleBattingPlayerClick,
    handlePitchingPlayerClick,
    handleBattingSortChange,
    statsFormat,
    gridVisibleColumns,
    showAvailabilityFilter,
    availabilityFilter,
    rosteredPlayerIds,
    handleBattingDataLoaded,
    handlePitchingDataLoaded,
  ]);

  const onClearFiltersHandler = useMemo(
    () =>
      createClearFiltersHandler(
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
      ),
    [applyFilters, onClearFilters],
  );

  return {
    header: {
      eyebrow: BASEBALL_HEADER.eyebrow,
      title,
      description: BASEBALL_HEADER.description,
    },
    urlPreview,
    onShare: handleShare,
    canExport,
    exportFormats,
    onExport: (format: string) => handleExportFormat(format as ExportFormat),
    tabs: BASEBALL_TABS,
    activeTab: viewMode,
    onTabChange: (id) =>
      handleViewModeChange(id as 'combined' | 'hitters' | 'pitchers'),
    tablistAriaLabel: 'Player stats view mode',
    renderToolbarControls,
    hasPendingChanges,
    onApply: applyFilters,
    canCustomizeColumns,
    isColumnCustomized,
    toggleableColumns,
    effectiveVisibleKeys,
    onToggleColumn: handleToggleColumn,
    onResetColumns: handleResetColumns,
    showAvailability: showAvailabilityFilter,
    availabilityValue: availabilityFilter,
    onAvailabilityChange: setAvailabilityFilter,
    leagues,
    leagueId,
    onLeagueChange,
    renderAdvancedPanel,
    shellState: state,
    onRetry,
    onClearFilters: onClearFiltersHandler,
    loadingColumnCount: SKELETON_COLS_BY_MODE[viewMode],
    renderContent,
  };
}

/** Baseball binding of the sport-agnostic stats config. */
export const baseballStatsConfig: SportStatsConfig<PlayerStatsPageProps> = {
  sport: 'mlb',
  useController: useBaseballController,
};

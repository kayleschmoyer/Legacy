import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Spinner, Text, useMedia, XStack, YStack } from 'tamagui';
import {
  LayoutGrid,
  LayoutList,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from '@tamagui/lucide-icons';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
import type { FootballPlayerCardStats } from '@legacy-sports/shared-components/football';
import {
  type FootballPlayersQuery,
  Sport,
  useFootballPlayerLeagueAvailabilityQuery,
  useFootballPlayersQuery,
  useGetNflTeamSeasonMetadataQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { useLeagueRosteredPlayerIds } from '../../hooks/useLeagueRosteredPlayerIds';
import type { FootballPlayerSortValue } from '../../components/football/FootballPlayerSort';
import { FootballPlayerSort } from '../../components/football/FootballPlayerSort';
import type { FootballPosition } from '../../components/football/FootballPositionFilter';
import {
  POSITIONS as FOOTBALL_POSITIONS,
  FootballPositionFilter,
} from '../../components/football/FootballPositionFilter';
import type { TeamFilter } from '../../components/football/FootballTeamFilter';
import { FootballTeamFilter } from '../../components/football/FootballTeamFilter';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useHasEntitlement, useIsPremium } from '../../hooks/useIsPremium';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  getFootballPositionColor,
  GREEN,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_HOVER,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

type PlayerListItem = NonNullable<
  FootballPlayersQuery['footballPlayers']
>['nodes'][number];

type ViewMode = 'cards' | 'table';

const VIEW_MODE_KEY = 'football_players_view_mode';

// Premium advanced-search filter options (LS-6489 / FPL-008). `null` = "Any"
// (no injury filter). The non-null values match the `injury_status` strings the
// injury pipeline writes to the players table.
const INJURY_STATUS_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'Any', value: null },
  { label: 'Questionable', value: 'Questionable' },
  { label: 'Doubtful', value: 'Doubtful' },
  { label: 'Out', value: 'Out' },
  { label: 'IR', value: 'IR' },
];

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

// ─── Key stat extraction for table row ────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

interface KeyStat {
  label: string;
  value: string;
}

function getKeyStat(
  position: string | null | undefined,
  isDst: boolean,
  stats: FootballPlayerCardStats | null | undefined,
): KeyStat {
  if (!stats) return { label: '—', value: '' };
  const pos = position ?? '';

  if (isDst || pos === 'DST') {
    const d = stats.defense;
    if (!d) return { label: '—', value: '' };
    return {
      label: 'SK / INT',
      value: `${fmtFloat(d.sacks)} / ${fmt(d.int)}`,
    };
  }
  if (pos === 'DL' || pos === 'LB' || pos === 'DB') {
    const idp = stats.idp;
    if (!idp) return { label: '—', value: '' };
    return {
      label: 'TKL / SK',
      value: `${fmt(idp.soloTkl)} / ${fmtFloat(idp.sacks)}`,
    };
  }
  if (pos === 'K') {
    const k = stats.kicking;
    if (!k) return { label: '—', value: '' };
    return {
      label: 'FG',
      value: `${fmt(k.fgm)}/${fmt(k.fga)}`,
    };
  }
  if (pos === 'QB') {
    const p = stats.passing;
    if (!p) return { label: '—', value: '' };
    return {
      label: 'YDS / TD',
      value: `${fmt(p.yds)} / ${fmt(p.td)}`,
    };
  }
  if (pos === 'RB') {
    const r = stats.rushing;
    if (!r) return { label: '—', value: '' };
    return {
      label: 'YDS / TD',
      value: `${fmt(r.yds)} / ${fmt(r.td)}`,
    };
  }
  // WR / TE / flex
  const rec = stats.receiving;
  if (!rec) return { label: '—', value: '' };
  return {
    label: 'REC / YDS',
    value: `${fmt(rec.rec)} / ${fmt(rec.yds)}`,
  };
}

// ─── Cross-league availability mini-badge (LS-7045) ───────────────────────

interface LeagueAvailabilityEntry {
  leagueId: number;
  leagueName: string;
  isAvailable: boolean;
}

function LeagueAvailabilityBadge({
  league,
}: {
  league: LeagueAvailabilityEntry;
}) {
  const bg = league.isAvailable
    ? withAlpha(GREEN, 0.15)
    : withAlpha(TEXT_MUTED, 0.1);
  const border = league.isAvailable ? withAlpha(GREEN, 0.45) : OUTLINE_SUBTLE;
  const color = league.isAvailable ? GREEN : TEXT_MUTED;
  return (
    <YStack
      key={league.leagueId}
      paddingHorizontal={5}
      paddingVertical={2}
      borderRadius={4}
      backgroundColor={bg}
      borderWidth={1}
      borderColor={border}
    >
      <Text fontSize={10} fontWeight="600" color={color} fontFamily={FONT_BODY}>
        {league.leagueName.slice(0, 8)}
      </Text>
    </YStack>
  );
}

function LeagueAvailabilityCell({
  entries,
}: {
  entries: LeagueAvailabilityEntry[];
}) {
  const availableCount = entries.filter((e) => e.isAvailable).length;
  const total = entries.length;
  if (total === 0) return null;

  const summaryColor = availableCount > 0 ? GREEN : TEXT_MUTED;

  return (
    <YStack gap={4} alignItems="flex-end">
      <Text
        fontSize={11}
        fontWeight="700"
        color={summaryColor}
        fontFamily={FONT_BODY}
      >
        {availableCount}/{total}
      </Text>
      <XStack gap={3} flexWrap="wrap" justifyContent="flex-end">
        {entries.map((e) => (
          <LeagueAvailabilityBadge key={e.leagueId} league={e} />
        ))}
      </XStack>
    </YStack>
  );
}

// ─── Table row ─────────────────────────────────────────────────────────────

function TableHeader({ showAvailability }: { showAvailability: boolean }) {
  const colStyles = {
    paddingHorizontal: 12,
    paddingVertical: 8,
  } as const;

  return (
    <XStack
      backgroundColor={SURFACE_PANEL}
      borderBottomWidth={1}
      borderColor={OUTLINE_SUBTLE}
    >
      <XStack flex={1} minWidth={160} {...colStyles}>
        <Text
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          letterSpacing={0.8}
        >
          NAME
        </Text>
      </XStack>
      <XStack width={72} {...colStyles}>
        <Text
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          letterSpacing={0.8}
        >
          POS
        </Text>
      </XStack>
      <XStack width={80} {...colStyles}>
        <Text
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          letterSpacing={0.8}
        >
          TEAM
        </Text>
      </XStack>
      <XStack flex={1} minWidth={120} {...colStyles} justifyContent="flex-end">
        <Text
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          letterSpacing={0.8}
          textAlign="right"
        >
          CAREER STATS
        </Text>
      </XStack>
      {showAvailability && (
        <XStack width={160} {...colStyles} justifyContent="flex-end">
          <XStack gap={4} alignItems="center">
            <Text
              fontSize={11}
              fontWeight="700"
              color={BRAND_GOLD}
              fontFamily={FONT_BODY}
              letterSpacing={0.8}
              textAlign="right"
            >
              MY LEAGUES
            </Text>
            <YStack
              paddingHorizontal={5}
              paddingVertical={1}
              borderRadius={3}
              backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
            >
              <Text
                fontSize={9}
                fontWeight="700"
                color={BRAND_GOLD}
                fontFamily={FONT_BODY}
                letterSpacing={0.5}
              >
                PRO
              </Text>
            </YStack>
          </XStack>
        </XStack>
      )}
    </XStack>
  );
}

function TableRow({
  player,
  onNavigate,
  leagueEntries,
}: {
  player: PlayerListItem;
  onNavigate: (id: string) => void;
  leagueEntries?: LeagueAvailabilityEntry[];
}) {
  const pos = player?.position;
  const isDst = player?.isDst ?? false;
  const posLabel = isDst ? 'DST' : pos;
  const posColor = getFootballPositionColor(posLabel);
  const keyStat = getKeyStat(pos, isDst, player?.careerStats ?? null);

  const fullName =
    [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
    'Unknown Player';

  const colStyles = {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center' as const,
  };

  return (
    <XStack
      cursor="pointer"
      borderBottomWidth={1}
      borderColor={OUTLINE_SUBTLE}
      hoverStyle={{ backgroundColor: SURFACE_HOVER }}
      pressStyle={{ opacity: 0.85 }}
      animation="quick"
      onPress={() => player?.id != null && onNavigate(String(player.id))}
    >
      <XStack flex={1} minWidth={160} {...colStyles}>
        <Text
          fontSize={14}
          fontWeight="600"
          color={TEXT_PRIMARY}
          fontFamily={FONT_DISPLAY}
          numberOfLines={1}
        >
          {fullName}
        </Text>
      </XStack>
      <XStack width={72} {...colStyles}>
        <YStack
          paddingHorizontal={6}
          paddingVertical={2}
          borderRadius={4}
          backgroundColor={withAlpha(posColor, 0.15)}
          borderWidth={1}
          borderColor={withAlpha(posColor, 0.5)}
        >
          <Text
            fontSize={11}
            fontWeight="700"
            color={posColor}
            fontFamily={FONT_BODY}
            letterSpacing={0.5}
          >
            {posLabel ?? '?'}
          </Text>
        </YStack>
      </XStack>
      <XStack width={80} {...colStyles}>
        <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          {player?.nflTeam ?? '—'}
        </Text>
      </XStack>
      <XStack flex={1} minWidth={120} {...colStyles} justifyContent="flex-end">
        {keyStat.value ? (
          <XStack gap={6} alignItems="baseline">
            <Text
              fontSize={13}
              fontWeight="700"
              color={TEXT_PRIMARY}
              fontVariant={['tabular-nums']}
            >
              {keyStat.value}
            </Text>
            <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
              {keyStat.label}
            </Text>
          </XStack>
        ) : (
          <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            —
          </Text>
        )}
      </XStack>
      {leagueEntries != null && leagueEntries.length > 0 && (
        <XStack
          width={160}
          paddingHorizontal={12}
          paddingVertical={10}
          justifyContent="flex-end"
          alignItems="center"
        >
          <LeagueAvailabilityCell entries={leagueEntries} />
        </XStack>
      )}
    </XStack>
  );
}

// ─── View toggle button ────────────────────────────────────────────────────

function ViewToggleButton({
  active,
  onPress,
  children,
  accessibilityLabel,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <YStack
      width={32}
      height={32}
      borderRadius={6}
      alignItems="center"
      justifyContent="center"
      backgroundColor={active ? withAlpha(BRAND_NAVY, 0.5) : 'transparent'}
      borderWidth={1}
      borderColor={active ? BRAND_NAVY : OUTLINE_SUBTLE}
      cursor="pointer"
      onPress={onPress}
      hoverStyle={{ borderColor: BRAND_NAVY }}
      pressStyle={{ opacity: 0.8 }}
      animation="quick"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </YStack>
  );
}

// ─── Advanced (premium) filters ──────────────────────────────────────────────

interface AdvancedFiltersPanelProps {
  injuryStatus: string | null;
  onInjuryStatusChange: (value: string | null) => void;
  minProjected: string;
  onMinProjectedChange: (value: string) => void;
  maxAdp: string;
  onMaxAdpChange: (value: string) => void;
}

const numericInputStyles = {
  backgroundColor: SURFACE_CARD,
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  borderRadius: 8,
  paddingHorizontal: 12,
  height: 36,
  color: TEXT_PRIMARY,
  fontSize: 13,
  fontFamily: FONT_BODY,
  width: 120,
} as const;

function AdvancedFiltersPanel({
  injuryStatus,
  onInjuryStatusChange,
  minProjected,
  onMinProjectedChange,
  maxAdp,
  onMaxAdpChange,
}: AdvancedFiltersPanelProps) {
  return (
    <YStack
      gap={12}
      padding={12}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={OUTLINE_SUBTLE}
      borderRadius={10}
    >
      {/* Injury status */}
      <YStack gap={6}>
        <Text
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          letterSpacing={0.8}
        >
          INJURY STATUS
        </Text>
        <XStack gap={6} flexWrap="wrap">
          {INJURY_STATUS_OPTIONS.map((opt) => {
            const active = injuryStatus === opt.value;
            return (
              <YStack
                key={opt.label}
                paddingHorizontal={12}
                paddingVertical={6}
                borderRadius={6}
                backgroundColor={
                  active ? withAlpha(BRAND_GOLD, 0.18) : 'transparent'
                }
                borderWidth={1}
                borderColor={active ? BRAND_GOLD : OUTLINE_SUBTLE}
                cursor="pointer"
                onPress={() => onInjuryStatusChange(opt.value)}
                hoverStyle={{ borderColor: BRAND_GOLD }}
                pressStyle={{ opacity: 0.8 }}
                animation="quick"
              >
                <Text
                  fontSize={12}
                  fontWeight="600"
                  color={active ? BRAND_GOLD : TEXT_MUTED}
                  fontFamily={FONT_BODY}
                >
                  {opt.label}
                </Text>
              </YStack>
            );
          })}
        </XStack>
      </YStack>

      {/* Numeric thresholds */}
      <XStack gap={16} flexWrap="wrap">
        <YStack gap={6}>
          <Text
            fontSize={11}
            fontWeight="700"
            color={TEXT_MUTED}
            fontFamily={FONT_BODY}
            letterSpacing={0.8}
          >
            MIN PROJECTED PTS
          </Text>
          <Input
            {...numericInputStyles}
            keyboardType="numeric"
            inputMode="decimal"
            placeholder="e.g. 150"
            placeholderTextColor={TEXT_MUTED}
            value={minProjected}
            onChangeText={onMinProjectedChange}
            focusStyle={{ borderColor: BRAND_GOLD, outlineWidth: 0 }}
          />
        </YStack>
        <YStack gap={6}>
          <Text
            fontSize={11}
            fontWeight="700"
            color={TEXT_MUTED}
            fontFamily={FONT_BODY}
            letterSpacing={0.8}
          >
            MAX ADP RANK
          </Text>
          <Input
            {...numericInputStyles}
            keyboardType="numeric"
            inputMode="numeric"
            placeholder="e.g. 50"
            placeholderTextColor={TEXT_MUTED}
            value={maxAdp}
            onChangeText={onMaxAdpChange}
            focusStyle={{ borderColor: BRAND_GOLD, outlineWidth: 0 }}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

const VALID_POSITIONS = new Set<string>(FOOTBALL_POSITIONS);

// Parse the comma-encoded `position` search param into a validated list.
function parsePositions(raw: string | null): FootballPosition[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is FootballPosition => s !== '' && VALID_POSITIONS.has(s));
}

const ADVANCED_FILTERS_FEATURE_NAME = 'Advanced search filters';
const ADVANCED_FILTERS_FEATURE_DESCRIPTION =
  'Filter players by projected fantasy points, ADP rank, and injury status with Premium.';

function ProjectionsUpsellBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <XStack
      backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.35)}
      borderRadius={10}
      padding={14}
      gap={12}
      alignItems="center"
    >
      <Star size={20} color={BRAND_GOLD} />
      <YStack flex={1} gap={2}>
        <Text
          fontSize={14}
          fontWeight="700"
          color={BRAND_GOLD}
          fontFamily={FONT_DISPLAY}
        >
          Unlock Projected Fantasy Points
        </Text>
        <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          Upgrade to Premium to see weekly projected points for every player.
        </Text>
      </YStack>
      <YStack
        paddingHorizontal={12}
        paddingVertical={6}
        borderRadius={6}
        backgroundColor={BRAND_GOLD}
        cursor="pointer"
        onPress={onUpgrade}
        role="button"
        tabIndex={0}
        onKeyDown={(e: { key: string; preventDefault: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onUpgrade();
          }
        }}
        pressStyle={{ opacity: 0.85 }}
        hoverStyle={{ opacity: 0.9 }}
        animation="quick"
        flexShrink={0}
      >
        <Text
          fontSize={12}
          fontWeight="700"
          color={BRAND_NAVY}
          fontFamily={FONT_BODY}
        >
          Upgrade
        </Text>
      </YStack>
    </XStack>
  );
}

export interface FootballPlayersPageProps {
  /**
   * Render the page's built-in "Football Players" hero. Defaults to true for
   * the standalone /football/players route; set to false when embedded under
   * another page that supplies its own editorial header (LS-8132).
   */
  showHeader?: boolean;
}

export function FootballPlayersPage({
  showHeader = true,
}: FootballPlayersPageProps = {}) {
  const navigate = useNavigate();
  const media = useMedia();
  // Multi-select positions are URL-synced via the `position` search param,
  // comma-encoded (e.g. ?position=QB,RB). Single-value deep links from LS-6489
  // continue to work unchanged; multi-select is additive (LS-6464).
  const [searchParams, setSearchParams] = useSearchParams();
  // Position filter uses local state for immediate UI response — same pattern as
  // teamFilter. URL-derived positions via v7_startTransition are aborted by
  // concurrent Apollo loading updates, leaving aria-pressed stale (LS-6465).
  // positionsRef tracks the latest value synchronously for rapid-toggle
  // correctness without adding positions to togglePosition's dep array (LS-6464).
  const positionsRef = useRef<FootballPosition[]>(
    parsePositions(searchParams.get('position')),
  );
  const [positions, setPositionsState] = useState<FootballPosition[]>(() =>
    parsePositions(searchParams.get('position')),
  );

  // Restore positions when the URL changes externally (e.g. browser back).
  useEffect(() => {
    const fromUrl = parsePositions(searchParams.get('position'));
    positionsRef.current = fromUrl;
    setPositionsState(fromUrl);
  }, [searchParams]);

  const togglePosition = useCallback(
    (pos: FootballPosition) => {
      const current = positionsRef.current;
      const next = current.includes(pos)
        ? current.filter((p) => p !== pos)
        : [...current, pos];
      positionsRef.current = next;
      setPositionsState(next);
      const params = new URLSearchParams(window.location.search);
      if (next.length === 0) {
        params.delete('position');
      } else {
        params.set('position', next.join(','));
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );
  const clearPositions = useCallback(() => {
    positionsRef.current = [];
    setPositionsState([]);
    const params = new URLSearchParams(window.location.search);
    params.delete('position');
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);
  const isPremium = useIsPremium();
  // Bye-week + SoS badges in the team filter (LS-8045) ride on
  // `advanced_search_filters` — the entitlement that gates the other premium
  // search surfaces on this page. (Originally keyed on
  // `advanced_football_stats`, which was removed as undeliverable — LS-6475;
  // see docs/product/subscription-tiers.md changelog 2026-07-02.)
  const hasAdvancedSearchFilters = useHasEntitlement('advanced_search_filters');
  const [showProjectionsModal, setShowProjectionsModal] = useState(false);

  const { data: nflTeamMetadataData } = useGetNflTeamSeasonMetadataQuery({
    skip: !hasAdvancedSearchFilters,
    fetchPolicy: 'cache-first',
  });

  // Fetch user's football leagues — used by both:
  // • LS-7042: All / Free Agents / Rostered availability filter (all users)
  // • LS-7045: Cross-league availability matrix (premium users)
  const { data: userLeaguesData } = useGetUserLeaguesQuery({
    fetchPolicy: 'cache-first',
  });
  const footballLeagues = (userLeaguesData?.userLeagues ?? []).filter(
    (l) => l.sport === Sport.Football && !l.isMockDraft,
  );
  const footballLeagueIds = footballLeagues
    .map((l) => l.id)
    .filter((id): id is number => id != null);
  const showAvailabilityMatrix = isPremium && footballLeagueIds.length >= 2;

  // Availability filter (LS-7042) — shown when user has at least one football league.
  const hasFootballLeagues = footballLeagues.length > 0;
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'free_agents' | 'rostered'
  >('all');
  const { playerIds: rosteredIds } = useLeagueRosteredPlayerIds(
    Sport.Football,
    !hasFootballLeagues || availabilityFilter === 'all',
  );

  // Team filter uses local state for immediate UI response. URL-derived state
  // (via v7_startTransition) defers the React update, which aborts concurrent
  // Apollo state updates and prevents Tamagui Select.Value from re-rendering the
  // trigger label. Local state is kept in sync with the URL so that:
  //   • selections persist when navigating to a player detail page and back (LS-6465)
  //   • deep links and browser-back restore the correct filter (useEffect below)
  const [teamFilter, setTeamFilterState] = useState<TeamFilter>(
    () => searchParams.get('team') ?? 'All',
  );

  // Restore team filter when the URL changes externally (e.g. browser back).
  useEffect(() => {
    setTeamFilterState(searchParams.get('team') ?? 'All');
  }, [searchParams]);

  const setTeamFilter = useCallback(
    (team: TeamFilter) => {
      setTeamFilterState(team);
      const params = new URLSearchParams(window.location.search);
      if (!team || team === 'All') {
        params.delete('team');
      } else {
        params.set('team', team);
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );
  const [searchInput, setSearchInput] = useState<string>(
    () => searchParams.get('search') ?? '',
  );
  const [sort, setSort] = useState<FootballPlayerSortValue>({ dir: 'asc' });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<PlayerListItem[]>([]);
  const appendNextRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Premium advanced-search filters (LS-6489 / FPL-008).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [injuryStatusFilter, setInjuryStatusFilter] = useState<string | null>(
    null,
  );
  const [minProjectedInput, setMinProjectedInput] = useState('');
  const [maxAdpInput, setMaxAdpInput] = useState('');

  function handleSelectPlayer(playerId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else if (next.size < 2) {
        next.add(playerId);
      }
      return next;
    });
  }

  const selectedArray = Array.from(selectedIds);
  const isCompareReady = selectedArray.length === 2;

  function goToCompare() {
    if (selectedArray.length === 2) {
      navigate(
        `/football/players/compare?a=${selectedArray[0]}&b=${selectedArray[1]}`,
      );
    }
  }

  // Default: table on desktop, cards on mobile. Persisted to localStorage.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === 'cards' || stored === 'table') return stored;
    } catch {
      // ignore storage errors
    }
    // media.sm = maxWidth 800 (mobile/tablet) → cards; else → table
    return media.sm ? 'cards' : 'table';
  });

  function handleSetViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }

  const debouncedSearch = useDebounce(searchInput, 300);

  // Track the last value we synced to the URL so we can skip no-op calls.
  // Using a ref (not searchParams) keeps this effect's deps free of URL state,
  // so it never re-runs from team/position filter changes — only from actual
  // changes to the debounced search term (LS-6465).
  const lastSyncedSearchRef = useRef(searchParams.get('search') ?? '');

  // Keep the `search` URL param in sync with the debounced input so that
  // returning from a player detail page restores the search term (LS-6465).
  useEffect(() => {
    if (debouncedSearch === lastSyncedSearchRef.current) return;
    lastSyncedSearchRef.current = debouncedSearch;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev.toString());
        if (debouncedSearch) {
          next.set('search', debouncedSearch);
        } else {
          next.delete('search');
        }
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  const debouncedMinProjected = useDebounce(minProjectedInput, 300);
  const debouncedMaxAdp = useDebounce(maxAdpInput, 300);

  // Premium advanced filters are only applied for premium users; empty or
  // invalid numeric input yields `undefined` (no filter sent to the server).
  const injuryStatusArg =
    isPremium && injuryStatusFilter ? injuryStatusFilter : undefined;
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

  // Stable key for the multi-select positions array so the reset effect can
  // compare by value rather than array identity.
  const positionsKey = positions.join('|');

  // Reset pagination when filters or sort change — the offset cursor is only
  // valid for the result set that produced it.
  const prevFiltersRef = useRef({
    positionsKey,
    teamFilter,
    debouncedSearch,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
    sortField: sort.field,
    sortDir: sort.dir,
  });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.positionsKey !== positionsKey ||
      prev.teamFilter !== teamFilter ||
      prev.debouncedSearch !== debouncedSearch ||
      prev.injuryStatusArg !== injuryStatusArg ||
      prev.minProjectedArg !== minProjectedArg ||
      prev.maxAdpArg !== maxAdpArg ||
      prev.sortField !== sort.field ||
      prev.sortDir !== sort.dir
    ) {
      prevFiltersRef.current = {
        positionsKey,
        teamFilter,
        debouncedSearch,
        injuryStatusArg,
        minProjectedArg,
        maxAdpArg,
        sortField: sort.field,
        sortDir: sort.dir,
      };
      appendNextRef.current = false;
      setCursor(undefined);
      setAllNodes([]);
    }
  }, [
    positionsKey,
    teamFilter,
    debouncedSearch,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
    sort.field,
    sort.dir,
  ]);

  const isConference = teamFilter === 'AFC' || teamFilter === 'NFC';
  const queryVars = {
    positions: positions.length > 0 ? positions : undefined,
    nflTeam:
      teamFilter === 'All' || isConference || teamFilter === 'FREE_AGENT'
        ? undefined
        : teamFilter,
    conference: isConference ? teamFilter : undefined,
    freeAgent: teamFilter === 'FREE_AGENT' ? true : undefined,
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    after: cursor,
    injuryStatus: injuryStatusArg,
    minProjectedPoints: minProjectedArg,
    maxAdpRank: maxAdpArg,
    sortBy: sort.field,
    sortDir: sort.field ? sort.dir : undefined,
  };

  const { data, loading, error } = useFootballPlayersQuery({
    variables: queryVars,
    notifyOnNetworkStatusChange: true,
    // cache-and-network ensures a network request always fires when variables
    // change, even back to a previously cached set. Required for E2E tests that
    // use waitForRequest to verify the outgoing GraphQL variables (LS-5607/LS-5602).
    fetchPolicy: 'cache-and-network',
  });

  // Accumulate pages — append when Load More was clicked, replace otherwise.
  // appendNextRef is set synchronously in loadMore and cleared by the filter-reset
  // effect, so a filter change racing a cursor fetch never merges stale pages.
  useEffect(() => {
    if (!data?.footballPlayers?.nodes) return;
    const newNodes = data.footballPlayers.nodes;
    if (appendNextRef.current) {
      appendNextRef.current = false;
      setAllNodes((prev) => [...prev, ...newNodes]);
    } else {
      setAllNodes(newNodes);
    }
  }, [data]);

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (pageInfo?.endCursor) {
      appendNextRef.current = true;
      setCursor(pageInfo.endCursor);
    }
  }, [pageInfo?.endCursor]);

  const isLoadingMore = loading && cursor !== undefined && allNodes.length > 0;
  const isInitialLoad = loading && allNodes.length === 0;

  const players = React.useMemo(() => {
    const nodes = allNodes ?? [];
    if (!hasFootballLeagues || availabilityFilter === 'all') return nodes;
    if (availabilityFilter === 'free_agents') {
      return nodes.filter((p) => p?.id != null && !rosteredIds.has(p.id));
    }
    return nodes.filter((p) => p?.id != null && rosteredIds.has(p.id));
  }, [allNodes, hasFootballLeagues, availabilityFilter, rosteredIds]);

  // Cross-league availability query (LS-7045). Runs only for premium users
  // with 2+ football leagues, after the player list loads.
  const visiblePlayerIds = players
    .map((p) => p?.id)
    .filter((id): id is number => id != null);
  const { data: availabilityData } = useFootballPlayerLeagueAvailabilityQuery({
    variables: {
      playerIds: visiblePlayerIds,
      leagueIds: footballLeagueIds,
    },
    skip: !showAvailabilityMatrix || visiblePlayerIds.length === 0,
  });

  // Build a map keyed by playerId for O(1) lookup in table rows.
  const availabilityByPlayerId = new Map<number, LeagueAvailabilityEntry[]>();
  if (availabilityData?.footballPlayerLeagueAvailability) {
    for (const entry of availabilityData.footballPlayerLeagueAvailability) {
      const list = availabilityByPlayerId.get(entry.playerId) ?? [];
      list.push({
        leagueId: entry.leagueId,
        leagueName: entry.leagueName,
        isAvailable: entry.isAvailable,
      });
      availabilityByPlayerId.set(entry.playerId, list);
    }
  }

  return (
    <YStack flex={1} backgroundColor={BG_DARK} minHeight="100vh">
      <PageMeta
        title="Football Players"
        description="Browse NFL football players"
      />

      {/* Header */}
      {showHeader && (
        <YStack
          paddingHorizontal={24}
          paddingTop={32}
          paddingBottom={20}
          gap={4}
          style={{
            background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.25)} 0%, transparent 100%)`,
          }}
        >
          <Text
            fontSize={28}
            fontWeight="800"
            color={TEXT_PRIMARY}
            fontFamily={FONT_DISPLAY}
            letterSpacing={-0.5}
          >
            Football Players
          </Text>
          <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            Browse, search, and filter NFL players
          </Text>
        </YStack>
      )}

      {/* Filters */}
      <YStack
        paddingHorizontal={16}
        paddingBottom={16}
        gap={12}
        backgroundColor={BG_DARK}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
        }}
      >
        {/* Search + view toggle */}
        <XStack gap={8} alignItems="center">
          <XStack
            flex={1}
            alignItems="center"
            gap={8}
            backgroundColor={SURFACE_CARD}
            borderWidth={1}
            borderColor={OUTLINE_SUBTLE}
            borderRadius={8}
            paddingHorizontal={12}
            height={44}
          >
            <Search size={16} color={TEXT_MUTED} />
            <Input
              flex={1}
              placeholder="Search players..."
              placeholderTextColor={TEXT_MUTED}
              value={searchInput}
              onChangeText={setSearchInput}
              backgroundColor="transparent"
              borderWidth={0}
              color={TEXT_PRIMARY}
              fontSize={14}
              fontFamily={FONT_BODY}
              height={44}
              paddingHorizontal={0}
              focusStyle={{ outlineWidth: 0 }}
              aria-label="Search players"
              accessibilityLabel="Search players"
            />
            {searchInput.length > 0 && (
              <XStack
                role="button"
                tabIndex={0}
                onPress={() => setSearchInput('')}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSearchInput('');
                  }
                }}
                cursor="pointer"
                padding={4}
                borderRadius={4}
                hoverStyle={{ backgroundColor: OUTLINE_SUBTLE }}
                focusStyle={{ outlineWidth: 0 }}
                aria-label="Clear search"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={TEXT_MUTED} />
              </XStack>
            )}
          </XStack>

          {/* View toggle */}
          <XStack gap={4}>
            <ViewToggleButton
              active={viewMode === 'cards'}
              onPress={() => handleSetViewMode('cards')}
              accessibilityLabel="Cards view"
            >
              <LayoutGrid
                size={16}
                color={viewMode === 'cards' ? TEXT_PRIMARY : TEXT_MUTED}
              />
            </ViewToggleButton>
            <ViewToggleButton
              active={viewMode === 'table'}
              onPress={() => handleSetViewMode('table')}
              accessibilityLabel="Table view"
            >
              <LayoutList
                size={16}
                color={viewMode === 'table' ? TEXT_PRIMARY : TEXT_MUTED}
              />
            </ViewToggleButton>
          </XStack>
        </XStack>

        {/* Position pills */}
        <FootballPositionFilter
          selected={positions}
          onToggle={togglePosition}
          onClear={clearPositions}
        />

        {/* Team filter */}
        <XStack alignItems="center" gap={8}>
          <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            Team:
          </Text>
          <FootballTeamFilter
            selected={teamFilter}
            onChange={setTeamFilter}
            teamMetadata={
              hasAdvancedSearchFilters
                ? (nflTeamMetadataData?.nflTeamSeasonMetadata ?? undefined)
                : undefined
            }
          />
        </XStack>

        {/* Availability filter — visible when user is in at least one football league (LS-7042) */}
        {hasFootballLeagues && (
          <XStack alignItems="center" gap={8} flexWrap="wrap">
            <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
              Availability:
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
                <YStack
                  key={value}
                  paddingHorizontal={12}
                  paddingVertical={6}
                  borderRadius={8}
                  borderWidth={1}
                  borderColor={active ? BRAND_NAVY_LIGHT : OUTLINE_SUBTLE}
                  backgroundColor={
                    active ? withAlpha(BRAND_NAVY_LIGHT, 0.25) : 'transparent'
                  }
                  cursor="pointer"
                  onPress={() => setAvailabilityFilter(value)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onKeyDown={(e: {
                    key: string;
                    preventDefault: () => void;
                  }) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAvailabilityFilter(value);
                    }
                  }}
                  hoverStyle={{ borderColor: BRAND_NAVY_LIGHT }}
                  pressStyle={{ opacity: 0.8 }}
                  animation="quick"
                >
                  <Text
                    fontSize={13}
                    fontWeight={active ? '700' : '500'}
                    color={active ? TEXT_PRIMARY : TEXT_MUTED}
                    fontFamily={FONT_BODY}
                  >
                    {label}
                  </Text>
                </YStack>
              );
            })}
          </XStack>
        )}

        {/* Advanced (premium) filters toggle */}
        <XStack
          alignItems="center"
          gap={8}
          alignSelf="flex-start"
          paddingHorizontal={10}
          paddingVertical={6}
          borderRadius={8}
          borderWidth={1}
          borderColor={showAdvanced ? BRAND_GOLD : OUTLINE_SUBTLE}
          backgroundColor={
            showAdvanced ? withAlpha(BRAND_GOLD, 0.12) : 'transparent'
          }
          cursor="pointer"
          onPress={() => setShowAdvanced((v) => !v)}
          role="button"
          aria-expanded={showAdvanced}
          tabIndex={0}
          onKeyDown={(e: { key: string; preventDefault: () => void }) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowAdvanced((v) => !v);
            }
          }}
          hoverStyle={{ borderColor: BRAND_GOLD }}
          pressStyle={{ opacity: 0.85 }}
          animation="quick"
        >
          <SlidersHorizontal
            size={15}
            color={showAdvanced ? BRAND_GOLD : TEXT_MUTED}
          />
          <Text
            fontSize={13}
            fontWeight="600"
            color={showAdvanced ? BRAND_GOLD : TEXT_MUTED}
            fontFamily={FONT_BODY}
          >
            Advanced filters
          </Text>
          <YStack
            paddingHorizontal={6}
            paddingVertical={1}
            borderRadius={4}
            backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
          >
            <Text
              fontSize={10}
              fontWeight="700"
              color={BRAND_GOLD}
              fontFamily={FONT_BODY}
              letterSpacing={0.5}
            >
              PREMIUM
            </Text>
          </YStack>
        </XStack>

        {showAdvanced && (
          <PremiumGate
            isPremium={isPremium}
            featureName={ADVANCED_FILTERS_FEATURE_NAME}
            featureDescription={ADVANCED_FILTERS_FEATURE_DESCRIPTION}
          >
            <AdvancedFiltersPanel
              injuryStatus={injuryStatusFilter}
              onInjuryStatusChange={setInjuryStatusFilter}
              minProjected={minProjectedInput}
              onMinProjectedChange={setMinProjectedInput}
              maxAdp={maxAdpInput}
              onMaxAdpChange={setMaxAdpInput}
            />
          </PremiumGate>
        )}

        {/* Sort control */}
        <FootballPlayerSort value={sort} onChange={setSort} />
      </YStack>

      {/* Content */}
      <YStack flex={1} padding={16} gap={16}>
        {error && (
          <YStack
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.1)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
            borderRadius={8}
            padding={16}
          >
            <Text color={BRAND_SEAM_RED_LIGHT} fontSize={14}>
              Failed to load players. Please try again.
            </Text>
          </YStack>
        )}

        {isInitialLoad && (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding={40}
          >
            <Spinner size="large" color={BRAND_GOLD} />
          </YStack>
        )}

        {!isInitialLoad && players.length === 0 && !loading && (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding={40}
            gap={8}
          >
            <Text fontSize={16} color={TEXT_MUTED} fontFamily={FONT_DISPLAY}>
              No players found
            </Text>
            <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
              Try adjusting your filters or search term.
            </Text>
          </YStack>
        )}

        {players.length > 0 && viewMode === 'cards' && (
          <YStack
            testID="player-list-cards"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {players.map((player) =>
              player?.id != null ? (
                <FootballPlayerCard
                  key={player.id}
                  player={player}
                  onNavigateToPlayer={(playerId) =>
                    navigate(`/football/players/${playerId}`)
                  }
                  isSelectable
                  isSelected={selectedIds.has(player.id)}
                  onSelect={handleSelectPlayer}
                />
              ) : null,
            )}
          </YStack>
        )}

        {players.length > 0 && viewMode === 'table' && (
          <YStack
            testID="player-list-table"
            backgroundColor={SURFACE_CARD}
            borderWidth={1}
            borderColor={OUTLINE_SUBTLE}
            borderRadius={10}
            overflow="hidden"
          >
            <TableHeader showAvailability={showAvailabilityMatrix} />
            {players.map((player) =>
              player?.id != null ? (
                <TableRow
                  key={player.id}
                  player={player}
                  onNavigate={(id) => navigate(`/football/players/${id}`)}
                  leagueEntries={
                    showAvailabilityMatrix
                      ? availabilityByPlayerId.get(player.id)
                      : undefined
                  }
                />
              ) : null,
            )}
          </YStack>
        )}

        {!isPremium && !isInitialLoad && players.length > 0 && (
          <ProjectionsUpsellBanner
            onUpgrade={() => setShowProjectionsModal(true)}
          />
        )}

        {/* Load more */}
        {hasMore && (
          <XStack justifyContent="center" paddingVertical={16}>
            {isLoadingMore ? (
              <Spinner size="small" color={BRAND_GOLD} />
            ) : (
              <YStack
                paddingHorizontal={24}
                paddingVertical={10}
                borderRadius={8}
                backgroundColor={SURFACE_PANEL}
                borderWidth={1}
                borderColor={OUTLINE_SUBTLE}
                onPress={loadMore}
                cursor="pointer"
                hoverStyle={{ borderColor: BRAND_NAVY }}
                pressStyle={{ opacity: 0.8 }}
                animation="quick"
              >
                <Text
                  fontSize={14}
                  color={TEXT_PRIMARY}
                  fontWeight="600"
                  fontFamily={FONT_BODY}
                >
                  Load more
                </Text>
              </YStack>
            )}
          </XStack>
        )}
      </YStack>

      {/* Compare sticky bar */}
      {selectedIds.size > 0 && (
        <XStack
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: '12px 16px',
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BG_DARK} 100%)`,
            borderTop: `1px solid ${OUTLINE_SUBTLE}`,
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text
            fontSize={14}
            color={TEXT_MUTED}
            fontFamily={FONT_BODY}
            flex={1}
          >
            {selectedIds.size === 1
              ? 'Select 1 more player to compare'
              : '2 players selected'}
          </Text>
          {selectedIds.size > 0 && (
            <YStack
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={6}
              backgroundColor={SURFACE_PANEL}
              borderWidth={1}
              borderColor={OUTLINE_SUBTLE}
              onPress={() => setSelectedIds(new Set())}
              role="button"
              tabIndex={0}
              onKeyDown={(e: { key: string; preventDefault: () => void }) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedIds(new Set());
                }
              }}
              cursor="pointer"
              pressStyle={{ opacity: 0.8 }}
            >
              <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                Clear
              </Text>
            </YStack>
          )}
          {isCompareReady && (
            <YStack
              paddingHorizontal={20}
              paddingVertical={8}
              borderRadius={8}
              backgroundColor={BRAND_NAVY}
              borderWidth={1}
              borderColor={BRAND_GOLD}
              onPress={goToCompare}
              role="button"
              tabIndex={0}
              onKeyDown={(e: { key: string; preventDefault: () => void }) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goToCompare();
                }
              }}
              cursor="pointer"
              hoverStyle={{ backgroundColor: BRAND_NAVY_LIGHT }}
              pressStyle={{ opacity: 0.85 }}
              animation="quick"
            >
              <Text
                fontSize={14}
                color={BRAND_GOLD}
                fontWeight="700"
                fontFamily={FONT_BODY}
              >
                Compare 2 Players
              </Text>
            </YStack>
          )}
        </XStack>
      )}
      {!isPremium && (
        <UpgradeModal
          open={showProjectionsModal}
          onOpenChange={setShowProjectionsModal}
          featureName="Projected Fantasy Points"
          featureDescription="Unlock weekly projected fantasy points for every player to make smarter start/sit decisions."
        />
      )}
    </YStack>
  );
}

export default FootballPlayersPage;

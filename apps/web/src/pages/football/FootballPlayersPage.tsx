import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Spinner, Text, useMedia, XStack, YStack } from 'tamagui';
import {
  LayoutGrid,
  LayoutList,
  Search,
  SlidersHorizontal,
  X,
} from '@tamagui/lucide-icons';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
import type { FootballPlayerCardStats } from '@legacy-sports/shared-components/football';
import {
  type FootballPlayersQuery,
  useFootballPlayersQuery,
} from '../../api/db/graphql.generated';
import type { FootballPosition } from '../../components/football/FootballPositionFilter';
import {
  POSITIONS as FOOTBALL_POSITIONS,
  FootballPositionFilter,
} from '../../components/football/FootballPositionFilter';
import type { TeamFilter } from '../../components/football/FootballTeamFilter';
import { FootballTeamFilter } from '../../components/football/FootballTeamFilter';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  getFootballPositionColor,
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

// ─── Table row ─────────────────────────────────────────────────────────────

function TableHeader() {
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
    </XStack>
  );
}

function TableRow({
  player,
  onNavigate,
}: {
  player: PlayerListItem;
  onNavigate: (id: string) => void;
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
    </XStack>
  );
}

// ─── View toggle button ────────────────────────────────────────────────────

function ViewToggleButton({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
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

export function FootballPlayersPage() {
  const navigate = useNavigate();
  const media = useMedia();
  const [searchParams, setSearchParams] = useSearchParams();
  const positionParam = searchParams.get('position') ?? 'All';
  const position: FootballPosition = VALID_POSITIONS.has(positionParam)
    ? (positionParam as FootballPosition)
    : 'All';
  const setPosition = useCallback(
    (pos: FootballPosition) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (pos === 'All') {
            next.delete('position');
          } else {
            next.set('position', pos);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const isPremium = useIsPremium();
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('All');
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<PlayerListItem[]>([]);
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

  // Reset pagination when filters change
  const prevFiltersRef = useRef({
    position,
    teamFilter,
    debouncedSearch,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
  });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.position !== position ||
      prev.teamFilter !== teamFilter ||
      prev.debouncedSearch !== debouncedSearch ||
      prev.injuryStatusArg !== injuryStatusArg ||
      prev.minProjectedArg !== minProjectedArg ||
      prev.maxAdpArg !== maxAdpArg
    ) {
      prevFiltersRef.current = {
        position,
        teamFilter,
        debouncedSearch,
        injuryStatusArg,
        minProjectedArg,
        maxAdpArg,
      };
      setCursor(undefined);
      setAllNodes([]);
    }
  }, [
    position,
    teamFilter,
    debouncedSearch,
    injuryStatusArg,
    minProjectedArg,
    maxAdpArg,
  ]);

  const isConference = teamFilter === 'AFC' || teamFilter === 'NFC';
  const queryVars = {
    position: position === 'All' ? undefined : position,
    nflTeam: teamFilter === 'All' || isConference ? undefined : teamFilter,
    conference: isConference ? teamFilter : undefined,
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    after: cursor,
    injuryStatus: injuryStatusArg,
    minProjectedPoints: minProjectedArg,
    maxAdpRank: maxAdpArg,
  };

  const { data, loading, error } = useFootballPlayersQuery({
    variables: queryVars,
    notifyOnNetworkStatusChange: true,
  });

  // Accumulate pages as cursor changes
  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    if (!data?.footballPlayers?.nodes) return;
    const newNodes = data.footballPlayers.nodes;
    if (prevCursorRef.current !== cursor) {
      // cursor changed — append
      setAllNodes((prev) => [...(prev ?? []), ...newNodes]);
    } else {
      // same cursor — replace (initial load or filter change reset)
      setAllNodes(newNodes);
    }
    prevCursorRef.current = cursor;
  }, [data, cursor]);

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (pageInfo?.endCursor) {
      setCursor(pageInfo.endCursor);
    }
  }, [pageInfo?.endCursor]);

  const isLoadingMore = loading && cursor !== undefined && allNodes.length > 0;
  const isInitialLoad = loading && allNodes.length === 0;

  const players = allNodes ?? [];

  return (
    <YStack flex={1} backgroundColor={BG_DARK} minHeight="100vh">
      <PageMeta
        title="Football Players"
        description="Browse NFL football players"
      />

      {/* Header */}
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
            height={40}
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
              height={40}
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
            >
              <LayoutGrid
                size={16}
                color={viewMode === 'cards' ? TEXT_PRIMARY : TEXT_MUTED}
              />
            </ViewToggleButton>
            <ViewToggleButton
              active={viewMode === 'table'}
              onPress={() => handleSetViewMode('table')}
            >
              <LayoutList
                size={16}
                color={viewMode === 'table' ? TEXT_PRIMARY : TEXT_MUTED}
              />
            </ViewToggleButton>
          </XStack>
        </XStack>

        {/* Position pills */}
        <FootballPositionFilter selected={position} onChange={setPosition} />

        {/* Team filter */}
        <XStack alignItems="center" gap={8}>
          <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            Team:
          </Text>
          <FootballTeamFilter selected={teamFilter} onChange={setTeamFilter} />
        </XStack>

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
            featureName="Advanced search filters"
            featureDescription="Filter players by projected fantasy points, ADP rank, and injury status with Premium."
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
            backgroundColor={SURFACE_CARD}
            borderWidth={1}
            borderColor={OUTLINE_SUBTLE}
            borderRadius={10}
            overflow="hidden"
          >
            <TableHeader />
            {players.map((player) =>
              player?.id != null ? (
                <TableRow
                  key={player.id}
                  player={player}
                  onNavigate={(id) => navigate(`/football/players/${id}`)}
                />
              ) : null,
            )}
          </YStack>
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
                Compare Players
              </Text>
            </YStack>
          )}
        </XStack>
      )}
    </YStack>
  );
}

export default FootballPlayersPage;

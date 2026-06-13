import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Spinner, Text, useMedia, XStack, YStack } from 'tamagui';
import { LayoutGrid, LayoutList, Search } from '@tamagui/lucide-icons';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
import type { FootballPlayerCardStats } from '@legacy-sports/shared-components/football';
import {
  type FootballPlayersQuery,
  useFootballPlayersQuery,
} from '../../api/db/graphql.generated';
import type { FootballPosition } from '../../components/football/FootballPositionFilter';
import { FootballPositionFilter } from '../../components/football/FootballPositionFilter';
import type { TeamFilter } from '../../components/football/FootballTeamFilter';
import { FootballTeamFilter } from '../../components/football/FootballTeamFilter';
import { PageMeta } from '../../components/PageMeta';
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

// ─── Page ──────────────────────────────────────────────────────────────────

export function FootballPlayersPage() {
  const navigate = useNavigate();
  const media = useMedia();
  const [position, setPosition] = useState<FootballPosition>('All');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('All');
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<PlayerListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  // Reset pagination when filters change
  const prevFiltersRef = useRef({ position, teamFilter, debouncedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.position !== position ||
      prev.teamFilter !== teamFilter ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      prevFiltersRef.current = { position, teamFilter, debouncedSearch };
      setCursor(undefined);
      setAllNodes([]);
    }
  }, [position, teamFilter, debouncedSearch]);

  const isConference = teamFilter === 'AFC' || teamFilter === 'NFC';
  const queryVars = {
    position: position === 'All' ? undefined : position,
    nflTeam: teamFilter === 'All' || isConference ? undefined : teamFilter,
    conference: isConference ? teamFilter : undefined,
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    after: cursor,
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
            />
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

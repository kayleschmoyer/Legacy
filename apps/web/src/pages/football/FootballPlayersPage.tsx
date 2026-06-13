import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { Search } from '@tamagui/lucide-icons';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
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
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

type PlayerListItem = NonNullable<
  FootballPlayersQuery['footballPlayers']
>['nodes'][number];

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

export function FootballPlayersPage() {
  const navigate = useNavigate();
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
        {/* Search */}
        <XStack
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
            backgroundColor={withAlpha('#C41E3A', 0.1)}
            borderWidth={1}
            borderColor={withAlpha('#C41E3A', 0.3)}
            borderRadius={8}
            padding={16}
          >
            <Text color="#E63950" fontSize={14}>
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

        {!isInitialLoad && (allNodes ?? []).length === 0 && !loading && (
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

        {/* Player grid — 1col mobile, 2col tablet, 3col desktop */}
        {(allNodes ?? []).length > 0 && (
          <YStack
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {(allNodes ?? []).map((player) =>
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

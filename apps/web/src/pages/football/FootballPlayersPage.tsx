import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { Search } from '@tamagui/lucide-icons';
import type { FootballPlayer } from '../../api/db/graphql.generated';
import { useFootballPlayersQuery } from '../../api/db/graphql.generated';
import { FootballPlayerCard } from '../../components/football/FootballPlayerCard';
import type { FootballPosition } from '../../components/football/FootballPositionFilter';
import { FootballPositionFilter } from '../../components/football/FootballPositionFilter';
import type { TeamFilter } from '../../components/football/FootballTeamFilter';
import { FootballTeamFilter } from '../../components/football/FootballTeamFilter';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function FootballPlayersPage() {
  const [position, setPosition] = useState<FootballPosition>('All');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('All');
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<FootballPlayer[]>([]);

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

  const queryVars = {
    position: position === 'All' ? undefined : position,
    nflTeam: teamFilter === 'All' ? undefined : teamFilter,
    search: debouncedSearch || undefined,
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
                <FootballPlayerCard key={player.id} player={player} />
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
    </YStack>
  );
}

export default FootballPlayersPage;

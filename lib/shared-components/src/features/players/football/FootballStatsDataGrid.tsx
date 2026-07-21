import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable } from 'react-native';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type FootballPlayersQuery,
  useFootballPlayersQuery,
} from '@legacy-sports/graphql';
import {
  type FootballAvailability,
  type FootballQueryVars,
  getFootballKeyStat,
} from './footballStatsHelpers';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  getPositionColor,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../shell/tokens';
import { EmptyCard, ErrorCard, LoadingSkeleton } from '../shell/StateCards';
import { csp } from '../crossPlatformStyle';

type PlayerListItem = NonNullable<
  FootballPlayersQuery['footballPlayers']
>['nodes'][number];

const SURFACE_HOVER = withAlpha(BRAND_NAVY_LIGHT, 0.12);

export interface FootballStatsDataGridProps {
  /** Committed GraphQL filter variables (positions, team, search, premium…). */
  queryVars: FootballQueryVars;
  /** Rows per page — drives the `first` connection arg. */
  pageSize: number;
  /**
   * Opaque key derived from the committed filters + page size. When it changes,
   * the accumulated pages and cursor reset — an offset cursor is only valid for
   * the result set that produced it.
   */
  resetKey: string;
  /** Row click → open the player detail surface for this id. */
  onPlayerSelect: (playerId: number) => void;
  /** Player IDs rostered in the viewer's football leagues (availability filter). */
  rosteredPlayerIds?: ReadonlySet<number>;
  /** Availability filter — applied client-side after fetching. */
  availabilityFilter?: FootballAvailability;
  /** Stat-column count for the loading skeleton shimmer rows. */
  loadingColumnCount?: number;
}

const colStyles = {
  paddingHorizontal: 12,
  paddingVertical: 10,
  alignItems: 'center' as const,
};

function HeaderCell({
  children,
  width,
  flex,
  minWidth,
  align,
}: {
  children: React.ReactNode;
  width?: number;
  flex?: number;
  minWidth?: number;
  align?: 'left' | 'right';
}) {
  return (
    <XStack
      width={width}
      flex={flex}
      minWidth={minWidth}
      paddingHorizontal={12}
      paddingVertical={8}
      justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}
    >
      <Text
        fontSize={11}
        fontWeight="700"
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        letterSpacing={0.8}
        textAlign={align === 'right' ? 'right' : 'left'}
      >
        {children}
      </Text>
    </XStack>
  );
}

function FootballTableRow({
  player,
  onSelect,
}: {
  player: PlayerListItem;
  onSelect: (id: number) => void;
}) {
  const pos = player?.position;
  const isDst = player?.isDst ?? false;
  const posLabel = isDst ? 'DST' : pos;
  const posColor = getPositionColor('football', posLabel ?? '');
  const keyStat = getFootballKeyStat(pos, isDst, player?.careerStats ?? null);
  const fullName =
    [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
    'Unknown Player';

  return (
    <XStack
      cursor="pointer"
      borderBottomWidth={1}
      borderColor={OUTLINE_SUBTLE}
      hoverStyle={{ backgroundColor: SURFACE_HOVER }}
      pressStyle={{ opacity: 0.85 }}
      animation="quick"
      onPress={() => player?.id != null && onSelect(player.id)}
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

/**
 * Football player-stats table. Table-only (the cards toggle stays on the
 * standalone `/football/players` route). Fetches the `FootballPlayers` cursor
 * connection driven by `first: pageSize`, accumulates pages behind a "Load
 * more" button, and resets accumulation when `resetKey` changes. Loading /
 * error / empty render through the shared {@link StateCards}. Row click →
 * `onPlayerSelect(playerId)` so the host opens the detail modal (LS-8442).
 */
export function FootballStatsDataGrid({
  queryVars,
  pageSize,
  resetKey,
  onPlayerSelect,
  rosteredPlayerIds,
  availabilityFilter,
  loadingColumnCount = 3,
}: FootballStatsDataGridProps) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allNodes, setAllNodes] = useState<PlayerListItem[]>([]);
  const appendNextRef = useRef(false);

  // Reset accumulation whenever the committed filters or page size change.
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      appendNextRef.current = false;
      setCursor(undefined);
      setAllNodes([]);
    }
  }, [resetKey]);

  const { data, loading, error } = useFootballPlayersQuery({
    variables: { ...queryVars, first: pageSize, after: cursor },
    notifyOnNetworkStatusChange: true,
    // cache-and-network guarantees a network request fires when variables
    // change, matching the standalone page (required for hermetic e2e that
    // assert the outgoing variables — LS-5607).
    fetchPolicy: 'cache-and-network',
  });

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

  const players = useMemo(() => {
    const nodes = allNodes ?? [];
    if (
      !availabilityFilter ||
      availabilityFilter === 'all' ||
      !rosteredPlayerIds
    ) {
      return nodes;
    }
    if (availabilityFilter === 'free_agents') {
      return nodes.filter((p) => p?.id != null && !rosteredPlayerIds.has(p.id));
    }
    return nodes.filter((p) => p?.id != null && rosteredPlayerIds.has(p.id));
  }, [allNodes, availabilityFilter, rosteredPlayerIds]);

  if (error && allNodes.length === 0) {
    return <ErrorCard />;
  }

  if (isInitialLoad) {
    return <LoadingSkeleton columnCount={loadingColumnCount} />;
  }

  if (players.length === 0) {
    return <EmptyCard />;
  }

  return (
    <YStack gap={16}>
      <YStack
        testID="player-list-table"
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={OUTLINE_SUBTLE}
        borderRadius={10}
        overflow="hidden"
      >
        <XStack
          backgroundColor={SURFACE_PANEL}
          borderBottomWidth={1}
          borderColor={OUTLINE_SUBTLE}
        >
          <HeaderCell flex={1} minWidth={160}>
            NAME
          </HeaderCell>
          <HeaderCell width={72}>POS</HeaderCell>
          <HeaderCell width={80}>TEAM</HeaderCell>
          <HeaderCell flex={1} minWidth={120} align="right">
            CAREER STATS
          </HeaderCell>
        </XStack>
        {players.map((player) =>
          player?.id != null ? (
            <FootballTableRow
              key={player.id}
              player={player}
              onSelect={onPlayerSelect}
            />
          ) : null,
        )}
      </YStack>

      {hasMore && (
        <XStack justifyContent="center" paddingVertical={8}>
          {isLoadingMore ? (
            <Spinner size="small" color={BRAND_GOLD} />
          ) : (
            <Pressable
              onPress={loadMore}
              accessibilityRole="button"
              accessibilityLabel="Load more players"
              style={csp({
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: SURFACE_PANEL,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: OUTLINE_SUBTLE,
              })}
            >
              <Text
                fontSize={14}
                color={TEXT_PRIMARY}
                fontWeight="600"
                fontFamily={FONT_BODY}
              >
                Load more
              </Text>
            </Pressable>
          )}
        </XStack>
      )}
    </YStack>
  );
}

export default FootballStatsDataGrid;

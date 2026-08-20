import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import { buildDepthChartBuckets } from './DraftPlayerBoard';
import { computeMyUpcomingPicks } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import type { CurrentDraftPickInfo, DraftPlayer, LeagueTeam } from './types';
import { withAlpha } from '../../utils/colors';
import { PositionBadge } from '../../components/PositionBadge';

const dash = '—';

/** Chip order per the design handoff, README "Players tab" §4 — distinct
 *  from `ALLOWED_POSITIONS_BY_SPORT.football`'s key order (BENCH excluded
 *  entirely; FLEX moves before DST/K to match the mock). */
const POSITION_CHIPS = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'DST',
  'K',
] as const;

interface PlayerListRow {
  kind: 'player';
  player: DraftPlayer;
  adp: number | null;
}

interface MarkerListRow {
  kind: 'marker';
  round: number;
  roundPickNumber: number;
}

type ListRow = PlayerListRow | MarkerListRow;

export interface DraftPlayersTabProps {
  /** Already filtered/searched server-side via `selectedPosition`/`searchTerm`
   *  (the same `GetAvailableDraftPlayers` query the Board tab reads) — no
   *  client-side re-filtering here (AC6: no new data wiring). */
  players: DraftPlayer[];
  myTeam: DraftPlayer[];
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  maxRosterSize: number | null;
  selectedPosition: string;
  searchTerm: string;
  onSetSelectedPosition: (pos: string) => void;
  onSetSearchTerm: (term: string) => void;
  /** Whether the DRAFT button should render at all for the viewer's turn —
   *  mirrors the Board tab's `canDraft` (isMyPick || controlAllTeams ||
   *  real commissioner pick), so the affordance is consistent across tabs. */
  canDraft: boolean;
  currentPickInfo: CurrentDraftPickInfo | null;
  boardOrderedTeams: LeagueTeam[];
  myTeamId: number | null;
  queuedPlayerIds: ReadonlySet<number>;
  onToggleQueue: (playerId: number) => void;
  onDraftPlayer: (playerId: number) => void;
}

/** The Players tab (LS-9399) — README "Players tab": search, position chips
 *  with roster counts, player rows with a queue star and conditional DRAFT
 *  button, and inline "YOUR PICK" markers ahead of the viewer's next two
 *  picks. Data comes entirely from `usePlayerData`/`useDraftActions` (via
 *  props) — no new queries or mutations (AC6). */
export function DraftPlayersTab({
  players,
  myTeam,
  leaguePositions,
  maxRosterSize,
  selectedPosition,
  searchTerm,
  onSetSelectedPosition,
  onSetSearchTerm,
  canDraft,
  currentPickInfo,
  boardOrderedTeams,
  myTeamId,
  queuedPlayerIds,
  onToggleQueue,
  onDraftPlayer,
}: DraftPlayersTabProps): React.JSX.Element {
  const palette = useDraftPalette();

  const rosterBuckets = useMemo(
    () =>
      buildDepthChartBuckets(
        leaguePositions,
        myTeam,
        'football',
        maxRosterSize,
      ),
    [leaguePositions, myTeam, maxRosterSize],
  );
  const bucketByPosition = useMemo(() => {
    const map = new Map<string, { total: number; filled: number }>();
    for (const bucket of rosterBuckets) {
      map.set(bucket.positionType, {
        total: bucket.total,
        filled: bucket.players.length,
      });
    }
    return map;
  }, [rosterBuckets]);
  const totalRosterSlots = useMemo(
    () => rosterBuckets.reduce((sum, bucket) => sum + bucket.total, 0),
    [rosterBuckets],
  );

  const myTeamIndex = useMemo(
    () =>
      myTeamId == null
        ? -1
        : boardOrderedTeams.findIndex((t) => String(t.id) === String(myTeamId)),
    [boardOrderedTeams, myTeamId],
  );
  const upcomingPicks = useMemo(
    () =>
      computeMyUpcomingPicks({
        currentPickInfo,
        teamCount: boardOrderedTeams.length,
        myTeamIndex,
        count: 2,
      }),
    [currentPickInfo, boardOrderedTeams.length, myTeamIndex],
  );

  // Markers only show with no filter/search applied — otherwise "N players
  // until my pick" no longer maps to overall picks (README "Players tab" §4,
  // "Interactions & Behavior": "markers hidden while filtered/searching").
  const showMarkers = selectedPosition === 'ALL' && searchTerm === '';

  const rows = useMemo<ListRow[]>(() => {
    // `adp` is the server's stack-rank fallback (player_scoring_cache,
    // LS-696) — the player's 1-based rank across the league's whole
    // draftable pool, using its customized scoring settings when it has
    // ever edited them. Stable for the life of the draft: it does not
    // renumber when other players are picked, so it is not simply the
    // player's index within this (already server-sorted, already-drafted-
    // excluded) list. Real historical ADP data isn't collected yet.
    const playerRows: PlayerListRow[] = players.map((player) => ({
      kind: 'player',
      player,
      adp: player.adp ?? null,
    }));
    if (!showMarkers || upcomingPicks.length === 0) return playerRows;

    const result: ListRow[] = [];
    let nextMarkerIdx = 0;
    playerRows.forEach((row, index) => {
      while (
        nextMarkerIdx < upcomingPicks.length &&
        upcomingPicks[nextMarkerIdx].picksUntil === index
      ) {
        const pick = upcomingPicks[nextMarkerIdx];
        result.push({
          kind: 'marker',
          round: pick.round,
          roundPickNumber: pick.roundPickNumber,
        });
        nextMarkerIdx++;
      }
      result.push(row);
    });
    while (nextMarkerIdx < upcomingPicks.length) {
      const pick = upcomingPicks[nextMarkerIdx];
      result.push({
        kind: 'marker',
        round: pick.round,
        roundPickNumber: pick.roundPickNumber,
      });
      nextMarkerIdx++;
    }
    return result;
  }, [players, showMarkers, upcomingPicks]);

  return (
    <YStack flex={1}>
      <XStack paddingHorizontal="$3" paddingTop={9}>
        <Input
          flex={1}
          borderRadius={10}
          paddingVertical={9}
          paddingHorizontal={12}
          fontSize={13}
          backgroundColor="$surfacePanel"
          borderColor="$surfacePanelBorder"
          color="$color"
          placeholder="Search players…"
          placeholderTextColor={palette.text.fg4}
          value={searchTerm}
          onChangeText={onSetSearchTerm}
        />
      </XStack>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        flexGrow={0}
        flexShrink={0}
      >
        <XStack gap={4} paddingHorizontal="$3" paddingVertical={8}>
          {POSITION_CHIPS.map((pos) => {
            const active = selectedPosition === pos;
            const tint =
              pos === 'ALL'
                ? palette.gold.gold
                : getPositionColor('football', pos);
            const countLabel =
              pos === 'ALL'
                ? `${myTeam.length}/${totalRosterSlots}`
                : `${bucketByPosition.get(pos)?.filled ?? 0}/${bucketByPosition.get(pos)?.total ?? 0}`;
            return (
              <Pressable
                key={pos}
                testID={`draft-players-chip-${pos}`}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${pos}`}
                accessibilityState={{ selected: active }}
                onPress={() => onSetSelectedPosition(pos)}
              >
                <YStack
                  minHeight={30}
                  justifyContent="center"
                  paddingVertical={5}
                  paddingHorizontal={11}
                  borderRadius={999}
                  borderWidth={1}
                  borderColor={active ? tint : '$outlineDefault'}
                  backgroundColor={active ? tint : 'transparent'}
                >
                  <Text
                    fontSize={11.5}
                    fontWeight="700"
                    textAlign="center"
                    color={active ? '$textOnAccent' : '$textMuted'}
                  >
                    {pos}
                  </Text>
                  <Text
                    fontSize={8.5}
                    textAlign="center"
                    color={active ? '$textOnAccent' : '$fg4'}
                  >
                    {countLabel}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'player'
            ? `player-${row.player.id}`
            : `marker-${row.round}-${row.roundPickNumber}`
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          item.kind === 'marker' ? (
            <YourPickMarker
              round={item.round}
              roundPickNumber={item.roundPickNumber}
            />
          ) : (
            <PlayersTabRow
              player={item.player}
              adp={item.adp}
              isQueued={queuedPlayerIds.has(item.player.id)}
              canDraft={canDraft}
              onToggleQueue={onToggleQueue}
              onDraftPlayer={onDraftPlayer}
            />
          )
        }
        ListEmptyComponent={
          <YStack padding="$6" alignItems="center">
            <Text color="$textMuted">No players match that filter</Text>
          </YStack>
        }
      />
    </YStack>
  );
}

function YourPickMarker({
  round,
  roundPickNumber,
}: {
  round: number;
  roundPickNumber: number;
}): React.JSX.Element {
  const palette = useDraftPalette();
  return (
    <XStack
      testID="draft-players-your-pick-marker"
      alignItems="center"
      gap={8}
      paddingHorizontal={12}
      paddingVertical={10}
    >
      <YStack flex={1} height={1} backgroundColor={palette.gold.gold} />
      <XStack
        borderRadius={999}
        borderWidth={1}
        borderColor={palette.gold.gold}
        paddingVertical={4}
        paddingHorizontal={10}
      >
        <Text
          fontSize={9.5}
          fontWeight="700"
          letterSpacing={1}
          textTransform="uppercase"
          color={palette.gold.goldLight}
        >
          {`Your pick (R${round}, P${roundPickNumber})`}
        </Text>
      </XStack>
      <YStack flex={1} height={1} backgroundColor={palette.gold.gold} />
    </XStack>
  );
}

function PlayersTabRow({
  player,
  adp,
  isQueued,
  canDraft,
  onToggleQueue,
  onDraftPlayer,
}: {
  player: DraftPlayer;
  adp: number | null;
  isQueued: boolean;
  canDraft: boolean;
  onToggleQueue: (playerId: number) => void;
  onDraftPlayer: (playerId: number) => void;
}): React.JSX.Element {
  const palette = useDraftPalette();
  const posColor = getPositionColor('football', player.position);
  const proj = player.ppg != null ? player.ppg.toFixed(1) : dash;

  return (
    <XStack
      testID="draft-players-row"
      alignItems="center"
      gap={8}
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius={12}
      paddingVertical={9}
      paddingHorizontal={10}
      marginBottom={6}
    >
      <Pressable
        testID={`draft-players-queue-${player.id}`}
        accessibilityRole="button"
        accessibilityLabel={
          isQueued ? `Remove ${player.name} from queue` : `Queue ${player.name}`
        }
        accessibilityState={{ selected: isQueued }}
        onPress={() => onToggleQueue(player.id)}
      >
        <YStack
          width={30}
          height={30}
          alignItems="center"
          justifyContent="center"
          borderRadius={999}
          backgroundColor={
            isQueued ? withAlpha(palette.gold.gold, 0.12) : undefined
          }
        >
          <Text
            fontSize={16}
            color={isQueued ? palette.gold.goldLight : '$fg4'}
          >
            {isQueued ? '★' : '☆'}
          </Text>
        </YStack>
      </Pressable>

      <YStack width={34} alignItems="center" gap={2}>
        <PositionBadge
          position={player.position}
          color={posColor}
          alpha={0.16}
          paddingHorizontal={6}
          paddingVertical={2}
          borderRadius={5}
        />
        <Text fontSize={8.5} color="$fg4" numberOfLines={1}>
          {dash}
        </Text>
      </YStack>

      <YStack flex={1} minWidth={0}>
        <Text fontWeight="600" fontSize={13.5} color="$color" numberOfLines={1}>
          {player.name}
        </Text>
        <Text fontSize={9.5} color="$textMuted" marginTop={2} numberOfLines={1}>
          {'ADP '}
          {adp != null ? adp.toFixed(1) : dash}
          {' · PROJ '}
          <Text fontSize={9.5} fontWeight="700" color="$brandGoldLight">
            {proj}
          </Text>
          {' · ROST '}
          {dash}
        </Text>
      </YStack>

      {canDraft && (
        <Pressable
          testID={`draft-players-draft-${player.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Draft ${player.name}`}
          onPress={() => onDraftPlayer(player.id)}
        >
          <YStack
            minHeight={44}
            justifyContent="center"
            backgroundColor="$brandGold"
            borderRadius={999}
            paddingVertical={10}
            paddingHorizontal={14}
          >
            <Text
              fontFamily="$heading"
              fontSize={12}
              fontWeight="800"
              letterSpacing={1}
              color="$textOnAccent"
            >
              DRAFT
            </Text>
          </YStack>
        </Pressable>
      )}
    </XStack>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 16,
  },
});

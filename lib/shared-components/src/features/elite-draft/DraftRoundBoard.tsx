/**
 * DraftRoundBoard — the phone-tier draft board (LS-10000).
 *
 * The design's phone board is round-scoped, not a narrowed desktop grid:
 * numbered round tabs, a round summary carrying the position mix and the snake
 * direction, then one tile per team three-across so a whole round is a single
 * screenful. Player — not position — carries the tile; position is secondary,
 * a border-top tint plus a small tag.
 *
 * Design source (`docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/
 * project/`): `DraftRoomMobile.html`'s two `.mob-round` containers, the
 * `.mob-round` block in `styles/mobile.css`, and `renderRound()` in
 * `scripts/draft.js`. Reimplemented in Tamagui rather than ported from the DOM
 * — the design's renderer is a reference for data shape and state vocabulary
 * only.
 *
 * This is the phone tier's board. The wider tiers render `DraftPlayerBoard` →
 * `DraftGrid` and are untouched by this component. It replaced the horizontally
 * scrolled `DraftBoardGrid`, which LS-10000 deleted as its only caller.
 *
 * All view-independent logic lives in `roundBoard.ts` so it is unit-testable
 * without a renderer.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { buildBoardCells } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { DraftPickInspector } from './DraftPickInspector';
import {
  buildPickInspectorData,
  type PickInspectorData,
  type PickInspectorState,
} from './draftPickInspectorModel';
import {
  buildRoundSummary,
  buildRoundTiles,
  cellsForRound,
  describeRoundTile,
  resolveInitialRound,
  resolveRoundTabState,
  type RoundSummary,
  type RoundTile,
} from './roundBoard';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { getPositionColor } from './utils';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import { withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

const TILE_MIN_HEIGHT = 62;
const TAB_MIN_WIDTH = 38;
/** Touch-target floor — the design's own `min-height: 44px` on `.rtabs button`. */
const TAB_MIN_HEIGHT = 44;

/** `RoundTile.state` distinguishes `mine` from `drafted`; the shared
 *  inspector only needs to know whether the pick is made, so both collapse
 *  to `made` there (the `isMine` flag carries the "your pick" distinction
 *  through separately). */
function inspectorStateFor(state: RoundTile['state']): PickInspectorState {
  if (state === 'on-the-clock') return 'on-the-clock';
  if (state === 'upcoming') return 'upcoming';
  return 'made';
}

export interface DraftRoundBoardProps {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  rounds: number;
  /** Drives tile position tinting. Required, never defaulted: a baseball
   *  default once silently mis-colored football boards (LS-8784). */
  sport: SportKind;
  /** The draft's `draftOrder`. A `linear` draft never reverses its even
   *  rounds, so tiles are numbered in board order and the snake caption is
   *  hidden (LS-10506); anything else — including not-yet-loaded — snakes. */
  draftOrder?: string | null;
  /** Fires when the viewer taps their own on-the-clock tile — the phone
   *  board's route into the Players tab. */
  onMakePick: () => void;
}

// ---------------------------------------------------------------------------
// Round tabs
// ---------------------------------------------------------------------------

function RoundTabs({
  rounds,
  activeRound,
  picksMadeByRound,
  teamCount,
  onSelectRound,
}: {
  rounds: number;
  activeRound: number;
  picksMadeByRound: number[];
  teamCount: number;
  onSelectRound: (round: number) => void;
}): React.JSX.Element {
  const palette = useDraftPalette();

  // Keep the active round's tab scrolled into view — in a long draft the
  // current round's tab sat off-screen to the right (LS-10593).
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const tabLayoutsRef = useRef(new Map<number, { x: number; width: number }>());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const handleTabLayout = useCallback(
    (round: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      tabLayoutsRef.current.set(round, { x, width });
      setLayoutVersion((v) => v + 1);
    },
    [],
  );

  useEffect(() => {
    const tab = tabLayoutsRef.current.get(activeRound);
    if (!tab || viewportWidth <= 0) return;
    scrollRef.current?.scrollTo({
      x: Math.max(0, tab.x + tab.width / 2 - viewportWidth / 2),
      animated: true,
    });
  }, [activeRound, viewportWidth, layoutVersion]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="draft-round-board-tabs"
      onLayout={(event: LayoutChangeEvent) =>
        setViewportWidth(event.nativeEvent.layout.width)
      }
    >
      <XStack
        role="tablist"
        accessibilityRole="tablist"
        aria-label="Draft rounds"
        accessibilityLabel="Draft rounds"
        paddingHorizontal={8}
        backgroundColor={palette.surface.surfaceSubtle}
        borderWidth={1}
        borderColor={palette.surface.outlineDefault}
        borderTopLeftRadius={10}
        borderTopRightRadius={10}
      >
        {Array.from({ length: rounds }, (_, index) => {
          const round = index + 1;
          const state = resolveRoundTabState({
            round,
            activeRound,
            picksMade: picksMadeByRound[index] ?? 0,
            teamCount,
          });
          const isActive = state === 'active';
          const label = `Round ${round}`;

          return (
            <YStack
              key={round}
              testID={`draft-round-board-tab-${round}`}
              onLayout={(event: LayoutChangeEvent) =>
                handleTabLayout(round, event)
              }
              minWidth={TAB_MIN_WIDTH}
              minHeight={TAB_MIN_HEIGHT}
              alignItems="center"
              justifyContent="center"
              borderBottomWidth={2}
              borderBottomColor={isActive ? palette.gold.gold : 'transparent'}
              onPress={() => onSelectRound(round)}
              pressStyle={{ opacity: 0.7 }}
              cursor="pointer"
              role="tab"
              accessibilityRole="tab"
              tabIndex={0}
              onKeyDown={handleKeyActivate(() => onSelectRound(round))}
              aria-label={label}
              accessibilityLabel={label}
              aria-selected={isActive}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                fontFamily="$heading"
                fontSize={15}
                fontWeight="800"
                color={
                  isActive
                    ? palette.gold.gold
                    : state === 'done'
                      ? palette.text.fg3
                      : palette.text.fg4
                }
              >
                {round}
              </Text>
            </YStack>
          );
        })}
      </XStack>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Round summary — position mix + snake direction
// ---------------------------------------------------------------------------

function RoundSummaryHeader({
  summary,
  sport,
}: {
  summary: RoundSummary;
  sport: SportKind;
}): React.JSX.Element {
  const palette = useDraftPalette();

  return (
    <YStack
      testID="draft-round-board-summary"
      paddingHorizontal={12}
      paddingTop={11}
      paddingBottom={12}
      borderBottomWidth={1}
      borderBottomColor={palette.surface.outlineDefault}
      gap={7}
    >
      <XStack alignItems="baseline" justifyContent="space-between" gap={10}>
        <Text
          fontFamily="$heading"
          fontSize={19}
          fontWeight="800"
          letterSpacing={0.4}
          color={palette.text.fg1}
        >
          {`Round ${summary.round}`}
        </Text>
        <Text
          testID="draft-round-board-summary-progress"
          fontSize={10.5}
          color={palette.text.fg3}
          numberOfLines={1}
        >
          {summary.hasStarted
            ? `${summary.picksMade} of ${summary.totalPicks} · ${summary.rangeLabel}`
            : `picks ${summary.rangeLabel}`}
        </Text>
      </XStack>

      {summary.hasStarted ? (
        <>
          {summary.mix.length > 0 && (
            <XStack
              testID="draft-round-board-mix"
              height={8}
              gap={2}
              borderRadius={2}
              overflow="hidden"
            >
              {summary.mix.map((segment) => (
                <YStack
                  key={segment.position}
                  testID={`draft-round-board-mix-${segment.position}`}
                  flex={segment.count}
                  height={8}
                  backgroundColor={getPositionColor(sport, segment.position)}
                />
              ))}
            </XStack>
          )}
          <XStack flexWrap="wrap" gap={9} alignItems="center">
            {summary.mix.map((segment) => (
              <Text
                key={segment.position}
                fontFamily="$heading"
                fontSize={9}
                fontWeight="700"
                letterSpacing={0.55}
                color={getPositionColor(sport, segment.position)}
              >
                {`${segment.count} ${segment.position}`}
              </Text>
            ))}
            {/* A linear draft has no snake to describe (LS-10506). */}
            {summary.snakeDirection !== null && (
              <Text
                testID="draft-round-board-snake"
                fontFamily="$heading"
                fontSize={9}
                fontWeight="700"
                letterSpacing={0.55}
                color={palette.text.fg4}
              >
                {summary.snakeDirection === 'left-to-right'
                  ? 'SNAKE LEFT TO RIGHT'
                  : 'SNAKE RIGHT TO LEFT'}
              </Text>
            )}
          </XStack>
        </>
      ) : (
        <Text
          testID="draft-round-board-locked"
          fontFamily="$heading"
          fontSize={9}
          fontWeight="700"
          letterSpacing={0.55}
          color={palette.text.fg4}
        >
          {`UNLOCKS WHEN ROUND ${summary.unlocksAfterRound ?? summary.round - 1} COMPLETES`}
        </Text>
      )}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/**
 * Resolves a tile's four painted surfaces from its state. Split out so the
 * state → appearance mapping reads as one table rather than as conditionals
 * scattered through the JSX.
 */
function useTileTheme(
  tile: RoundTile,
  sport: SportKind,
): {
  backgroundColor: string;
  borderColor: string;
  topColor: string;
  dashed: boolean;
  nameColor: string;
  headColor: string;
} {
  const palette = useDraftPalette();
  const positionColor = tile.position
    ? getPositionColor(sport, tile.position)
    : palette.surface.outlineDefault;

  switch (tile.state) {
    case 'on-the-clock':
      return {
        backgroundColor: withAlpha(palette.gold.gold, 0.13),
        borderColor: palette.gold.gold,
        topColor: palette.gold.gold,
        dashed: false,
        nameColor: palette.gold.goldLight,
        headColor: palette.gold.goldLight,
      };
    case 'mine':
      return {
        backgroundColor: palette.surface.surfaceRaised,
        borderColor: withAlpha(palette.gold.gold, 0.4),
        topColor: palette.gold.gold,
        dashed: false,
        nameColor: palette.gold.goldLight,
        headColor: palette.gold.goldLight,
      };
    case 'drafted':
      return {
        backgroundColor: palette.surface.surfaceSubtle,
        borderColor: palette.surface.outlineSubtle,
        topColor: positionColor,
        dashed: false,
        nameColor: palette.text.fg1,
        headColor: palette.text.fg3,
      };
    case 'upcoming':
    default:
      return {
        backgroundColor: 'transparent',
        borderColor: palette.surface.outlineSubtle,
        topColor: palette.surface.outlineDefault,
        dashed: true,
        nameColor: palette.text.fg4,
        headColor: palette.text.fg3,
      };
  }
}

function RoundTileView({
  tile,
  sport,
  onMakePick,
  onOpenInspector,
}: {
  tile: RoundTile;
  sport: SportKind;
  onMakePick: () => void;
  /** Opens the shared pick inspector (LS-10163) for this tile. */
  onOpenInspector: (tile: RoundTile) => void;
}): React.JSX.Element {
  const palette = useDraftPalette();
  const theme = useTileTheme(tile, sport);
  // The viewer's own on-the-clock tile routes straight to making the pick —
  // that shortcut predates this ticket and stays; every other tile (including
  // everyone else's on-the-clock tile) opens the read-only inspector instead.
  const actionable = tile.state === 'on-the-clock' && tile.isMine;
  const onTap = actionable ? onMakePick : () => onOpenInspector(tile);

  const teamLabel = `${tile.isMine ? '★ ' : ''}${tile.teamName}`;
  const bodyLabel =
    tile.state === 'on-the-clock'
      ? tile.isMine
        ? 'Make pick'
        : 'On the clock'
      : tile.state === 'upcoming'
        ? 'upcoming'
        : (tile.playerName ?? '—');

  // Every tile is labelled, not just the actionable one: on a 3-across grid
  // the visual state is carried by border and tint alone, which a screen
  // reader cannot convey. The label is also what the specs assert against —
  // Tamagui drops `testID`/`data-*` from components carrying a11y props in
  // the production web build (LS-5976), so state must not hang off those.
  const a11yLabel = describeRoundTile(tile);

  return (
    <YStack
      testID={`draft-round-board-tile-${tile.teamId}`}
      minHeight={TILE_MIN_HEIGHT}
      paddingTop={5}
      paddingHorizontal={6}
      paddingBottom={6}
      gap={1}
      borderRadius={6}
      borderWidth={1}
      borderTopWidth={2}
      borderStyle={theme.dashed ? 'dashed' : 'solid'}
      borderColor={theme.borderColor}
      borderTopColor={theme.topColor}
      backgroundColor={theme.backgroundColor}
      onPress={onTap}
      pressStyle={{ opacity: 0.85 }}
      cursor="pointer"
      role="button"
      accessibilityRole="button"
      tabIndex={0}
      onKeyDown={handleKeyActivate(onTap)}
      aria-haspopup={actionable ? undefined : 'dialog'}
      aria-label={a11yLabel}
      accessibilityLabel={a11yLabel}
    >
      <XStack alignItems="baseline" justifyContent="space-between" gap={4}>
        <Text
          flexShrink={1}
          fontFamily="$heading"
          fontSize={9}
          fontWeight="800"
          letterSpacing={0.55}
          color={theme.headColor}
          numberOfLines={1}
        >
          {teamLabel}
        </Text>
        <Text
          fontFamily="$heading"
          fontSize={8}
          fontWeight="700"
          color={palette.text.fg4}
          numberOfLines={1}
        >
          {tile.pickLabel}
        </Text>
      </XStack>

      <Text
        testID={`draft-round-board-tile-${tile.teamId}-name`}
        fontFamily="$heading"
        fontSize={tile.playerName ? 13 : 10.5}
        fontWeight={tile.playerName ? '700' : '400'}
        fontStyle={tile.playerName ? 'normal' : 'italic'}
        lineHeight={tile.playerName ? 14 : 13}
        color={theme.nameColor}
        numberOfLines={1}
      >
        {bodyLabel}
      </Text>

      {tile.position !== null && (
        <XStack marginTop="auto" alignItems="baseline" gap={4}>
          <Text
            fontFamily="$heading"
            fontSize={9}
            fontWeight="700"
            letterSpacing={0.55}
            color={getPositionColor(sport, tile.position)}
            numberOfLines={1}
          >
            {tile.club ? `${tile.position} · ${tile.club}` : tile.position}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function DraftRoundBoard({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  rounds,
  sport,
  draftOrder,
  onMakePick,
}: DraftRoundBoardProps): React.JSX.Element | null {
  const palette = useDraftPalette();
  const teamCount = teams.length;
  const currentRound = currentPickInfo?.isComplete
    ? null
    : (currentPickInfo?.round ?? null);

  const cells = useMemo(
    () =>
      buildBoardCells({
        teams,
        picks,
        currentPickInfo,
        myTeamId,
        statsLookup,
        rounds,
      }),
    [teams, picks, currentPickInfo, myTeamId, statsLookup, rounds],
  );

  const maxPickRound = useMemo(
    () => picks.reduce((max, pick) => Math.max(max, pick.round), 0),
    [picks],
  );

  const [selectedRound, setSelectedRound] = useState(() =>
    resolveInitialRound({ currentRound, maxPickRound, rounds }),
  );

  // Follow the draft: when the clock moves into a new round, bring the board
  // with it. A round the viewer picked by hand is left alone until the clock
  // moves again, so browsing back through completed rounds is not yanked away
  // by the next pick.
  const [followedRound, setFollowedRound] = useState(currentRound);
  useEffect(() => {
    if (currentRound !== null && currentRound !== followedRound) {
      setFollowedRound(currentRound);
      setSelectedRound(
        resolveInitialRound({ currentRound, maxPickRound, rounds }),
      );
    }
  }, [currentRound, followedRound, maxPickRound, rounds]);

  const picksMadeByRound = useMemo(
    () =>
      Array.from({ length: rounds }, (_, index) =>
        cellsForRound({ cells, round: index + 1, teamCount }).reduce(
          (count, cell) => count + (cell.pick ? 1 : 0),
          0,
        ),
      ),
    [cells, rounds, teamCount],
  );

  const roundCells = useMemo(
    () => cellsForRound({ cells, round: selectedRound, teamCount }),
    [cells, selectedRound, teamCount],
  );

  const summary = useMemo(
    () =>
      buildRoundSummary({
        cells: roundCells,
        round: selectedRound,
        teamCount,
        currentRound,
        draftOrder,
      }),
    [roundCells, selectedRound, teamCount, currentRound, draftOrder],
  );

  const tiles = useMemo(
    () =>
      buildRoundTiles({
        cells: roundCells,
        teams,
        round: selectedRound,
        statsLookup,
        draftOrder,
      }),
    [roundCells, teams, selectedRound, statsLookup, draftOrder],
  );

  // Pick inspector (LS-10163): every tile — made, on the clock, or still
  // upcoming — opens the same shared popup on tap, except the viewer's own
  // on-the-clock tile, which keeps its existing route straight to
  // `onMakePick` (see `RoundTileView`).
  const [inspectorData, setInspectorData] = useState<PickInspectorData | null>(
    null,
  );
  const openInspector = (tile: RoundTile): void =>
    setInspectorData(
      buildPickInspectorData({
        round: selectedRound,
        pickLabel: tile.pickLabel,
        teamName: tile.teamName,
        state: inspectorStateFor(tile.state),
        playerName: tile.playerName,
        position: tile.position,
        isMine: tile.isMine,
      }),
    );

  if (teamCount === 0) return null;

  return (
    <YStack testID="draft-round-board" marginHorizontal={14}>
      <RoundTabs
        rounds={rounds}
        activeRound={selectedRound}
        picksMadeByRound={picksMadeByRound}
        teamCount={teamCount}
        onSelectRound={setSelectedRound}
      />

      <YStack
        backgroundColor={palette.surface.surfacePanel}
        borderWidth={1}
        borderTopWidth={0}
        borderColor={palette.surface.outlineDefault}
        borderBottomLeftRadius={12}
        borderBottomRightRadius={12}
      >
        <RoundSummaryHeader summary={summary} sport={sport} />

        {/* Three-across: `flexWrap` on fractional-width children rather than
            CSS grid, which react-native-web does not implement. */}
        <XStack
          testID="draft-round-board-tiles"
          flexWrap="wrap"
          paddingHorizontal={9}
          paddingTop={7}
          paddingBottom={9}
        >
          {tiles.map((tile) => (
            <YStack key={tile.key} width="33.333%" padding={3}>
              <RoundTileView
                tile={tile}
                sport={sport}
                onMakePick={onMakePick}
                onOpenInspector={openInspector}
              />
            </YStack>
          ))}
        </XStack>
      </YStack>

      <DraftPickInspector
        data={inspectorData}
        onClose={() => setInspectorData(null)}
        testID="draft-round-board-pick-inspector"
      />
    </YStack>
  );
}

export default DraftRoundBoard;

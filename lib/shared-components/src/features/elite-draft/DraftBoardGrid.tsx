/**
 * DraftBoardGrid — the Draft Room v2 Board tab (LS-9398): a horizontally
 * scrollable rounds × teams grid, Sleeper-style. README "Board tab (default
 * home)". Renders on top of the same pick/team data LS-9397's shell chrome
 * already fetches (`useDraftQueries`) — no new GraphQL/WebSocket wiring.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import {
  abbreviatedPlayerName,
  buildBoardCells,
  initialsOf,
  snakePickInRound,
} from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import { withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

const GUTTER_WIDTH = 30;
const CELL_WIDTH = 92;
const CELL_HEIGHT = 56;
const CELL_GAP = 4;
const CELL_RADIUS = 8;
const AVATAR_SIZE = 26;

export interface DraftBoardGridProps {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  rounds: number;
  /** Drives cell position-color tinting (LS-8784 pattern) — required, not
   *  defaulted, so this component never silently mis-colors a football board
   *  the way a baseball default once did on DraftGrid. */
  sport: SportKind;
  /** Fires when the viewer taps the current-pick cell on their own turn
   *  (README AC4). The Players tab body may still be a LS-9397 placeholder —
   *  only the navigation call itself is in scope for this ticket. */
  onMakePick: () => void;
}

/** Pulses a boolean on a ~700ms cadence — the current-pick cell's
 *  `ringPulse` ring (README "Board tab": 1.4s cycle, opacity 1→.15). Mirrors
 *  DraftHeaderBand's `useClockBreath` simplification for cross-platform
 *  parity (LS-9206) rather than a full keyframe animation. */
function useRingPulse(active: boolean): boolean {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!active) {
      setPulse(false);
      return undefined;
    }
    const id = setInterval(() => setPulse((v) => !v), 700);
    return () => clearInterval(id);
  }, [active]);
  return active ? pulse : false;
}

function TeamHeaderCell({
  team,
  isMine,
  isOnClock,
}: {
  team: LeagueTeam;
  isMine: boolean;
  isOnClock: boolean;
}): React.JSX.Element {
  const palette = useDraftPalette();
  const borderColor = isOnClock
    ? palette.gold.gold
    : isMine
      ? withAlpha(palette.gold.gold, 0.6)
      : palette.surface.outlineDefault;

  return (
    <YStack width={CELL_WIDTH} alignItems="center" gap={3}>
      <YStack
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        borderRadius={AVATAR_SIZE / 2}
        alignItems="center"
        justifyContent="center"
        backgroundColor={
          isMine
            ? withAlpha(palette.gold.gold, 0.2)
            : palette.surface.surfacePanel
        }
        borderWidth={isOnClock ? 2 : 1}
        borderColor={borderColor}
      >
        <Text
          fontFamily="$heading"
          fontSize={11}
          fontWeight="800"
          color={isMine ? palette.gold.goldLight : palette.text.fg3}
        >
          {initialsOf(team.name)}
        </Text>
      </YStack>
      <Text
        fontSize={9}
        fontWeight="700"
        color={isMine ? palette.gold.goldLight : palette.text.fg4}
        numberOfLines={1}
      >
        {isMine ? 'YOU' : team.name}
      </Text>
    </YStack>
  );
}

interface BoardCellViewProps {
  round: number;
  teamId: string;
  isMine: boolean;
  pick: DraftPickRecord | null;
  position: string | null;
  playerName: string | null;
  isCurrent: boolean;
  sport: SportKind;
  emptyPickLabel: string;
  onMakePick: () => void;
}

function BoardCellView({
  round,
  teamId,
  isMine,
  pick,
  position,
  playerName,
  isCurrent,
  sport,
  emptyPickLabel,
  onMakePick,
}: BoardCellViewProps): React.JSX.Element {
  const palette = useDraftPalette();
  const pulse = useRingPulse(isCurrent && !pick);
  const testID = `draft-board-grid-cell-${round}-${teamId}`;

  if (pick) {
    const posColor = position
      ? getPositionColor(sport, position)
      : palette.surface.outlineStrong;
    return (
      <YStack
        testID={testID}
        width={CELL_WIDTH}
        height={CELL_HEIGHT}
        borderRadius={CELL_RADIUS}
        borderWidth={1}
        borderColor={withAlpha(posColor, isMine ? 0.55 : 0.5)}
        backgroundColor={withAlpha(posColor, isMine ? 0.5 : 0.32)}
        padding={5}
        justifyContent="space-between"
      >
        <Text fontSize={8.5} fontWeight="700" color="$fgOnAccent" opacity={0.6}>
          {`${pick.round}.${pick.pickNumber}`}
        </Text>
        <Text
          fontSize={11}
          fontWeight="700"
          color="$fgOnAccent"
          numberOfLines={2}
        >
          {playerName ? abbreviatedPlayerName(playerName) : '—'}
        </Text>
        <Text
          fontSize={8.5}
          color="$fgOnAccent"
          opacity={0.65}
          numberOfLines={1}
        >
          {position ?? '—'}
        </Text>
      </YStack>
    );
  }

  if (isCurrent) {
    const label = isMine ? 'MAKE PICK' : 'On the clock…';
    return (
      <YStack
        testID={testID}
        width={CELL_WIDTH}
        height={CELL_HEIGHT}
        borderRadius={CELL_RADIUS}
        borderWidth={2}
        borderColor={palette.gold.gold}
        backgroundColor={
          isMine
            ? withAlpha(palette.gold.gold, 0.22)
            : palette.surface.surfacePanel
        }
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        onPress={isMine ? onMakePick : undefined}
        pressStyle={isMine ? { opacity: 0.85 } : undefined}
        role={isMine ? 'button' : undefined}
        accessibilityRole={isMine ? 'button' : undefined}
        aria-label={isMine ? label : undefined}
        accessibilityLabel={isMine ? label : undefined}
      >
        <YStack
          testID={`${testID}-ring`}
          position="absolute"
          top={-2}
          left={-2}
          right={-2}
          bottom={-2}
          borderRadius={CELL_RADIUS + 2}
          borderWidth={2}
          borderColor={palette.gold.gold}
          opacity={pulse ? 0.15 : 1}
        />
        <Text
          fontSize={9.5}
          fontWeight="700"
          letterSpacing={0.5}
          textTransform="uppercase"
          textAlign="center"
          color={isMine ? palette.gold.goldLight : palette.text.fg4}
        >
          {label}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack
      testID={testID}
      width={CELL_WIDTH}
      height={CELL_HEIGHT}
      borderRadius={CELL_RADIUS}
      borderWidth={1}
      borderColor={
        isMine
          ? withAlpha(palette.gold.gold, 0.3)
          : palette.surface.outlineSubtle
      }
      backgroundColor={palette.surface.surfaceSubtle}
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize={8.5} color={palette.surface.outlineStrong}>
        {emptyPickLabel}
      </Text>
    </YStack>
  );
}

export function DraftBoardGrid({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  rounds,
  sport,
  onMakePick,
}: DraftBoardGridProps): React.JSX.Element | null {
  const palette = useDraftPalette();

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

  if (teams.length === 0) return null;

  const teamCount = teams.length;
  const currentTeamId =
    currentPickInfo?.teamId != null ? String(currentPickInfo.teamId) : null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="draft-board-grid"
    >
      <YStack>
        <XStack gap={CELL_GAP} marginBottom={6}>
          <YStack width={GUTTER_WIDTH} />
          {teams.map((team) => (
            <TeamHeaderCell
              key={team.id}
              team={team}
              isMine={myTeamId !== null && String(team.id) === String(myTeamId)}
              isOnClock={
                currentTeamId !== null && String(team.id) === currentTeamId
              }
            />
          ))}
        </XStack>

        {Array.from({ length: rounds }, (_, roundIdx) => {
          const round = roundIdx + 1;
          const reversed = round % 2 === 0;
          const rowCells = cells.slice(
            roundIdx * teamCount,
            (roundIdx + 1) * teamCount,
          );

          return (
            <XStack
              key={`round-${round}`}
              gap={CELL_GAP}
              marginBottom={CELL_GAP}
              alignItems="center"
            >
              <YStack
                width={GUTTER_WIDTH}
                alignItems="center"
                justifyContent="center"
              >
                <Text
                  fontFamily="$heading"
                  fontSize={12}
                  fontWeight="800"
                  color={palette.text.fg4}
                >
                  {`R${round}`}
                </Text>
                <Text fontSize={10} color={palette.surface.outlineStrong}>
                  {reversed ? '←' : '→'}
                </Text>
              </YStack>
              {rowCells.map((cell, columnIndex) => (
                <BoardCellView
                  key={cell.key}
                  round={round}
                  teamId={cell.teamId}
                  isMine={cell.isMine}
                  pick={cell.pick}
                  position={cell.position}
                  playerName={cell.playerName}
                  isCurrent={cell.isCurrent}
                  sport={sport}
                  emptyPickLabel={`${round}.${snakePickInRound({ round, columnIndex, teamCount })}`}
                  onMakePick={onMakePick}
                />
              ))}
            </XStack>
          );
        })}
      </YStack>
    </ScrollView>
  );
}

export default DraftBoardGrid;

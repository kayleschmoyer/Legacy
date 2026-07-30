/**
 * DraftMiniBoard (native) — the whole draft on one screen.
 *
 * Columns are teams in draft order, rows are rounds, and every cell is painted
 * with the drafted player's position color. The viewer's own column is picked
 * out in gold, the pick on the clock pulses, and tapping any cell writes a
 * description of it into the caption underneath — that caption is how mobile
 * gets at pick history without a separate tab.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import {
  type BoardCell,
  buildBoardCells,
  describeBoardCell,
  initialsOf,
} from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import { withAlpha } from '../../utils/colors';

const CELL_HEIGHT = 23;
const CELL_GAP = 3;
/** Roughly five rounds of cells — deeper boards scroll inside the header. */
const BOARD_MAX_HEIGHT = 5 * (CELL_HEIGHT + CELL_GAP) + 4;

export interface DraftMiniBoardProps {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  rounds: number;
}

/** A gold ring that breathes over the cell currently on the clock. */
function OnClockRing({ color }: { color: string }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: color,
        opacity: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.2],
        }),
      }}
    />
  );
}

export function DraftMiniBoard({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  rounds,
}: DraftMiniBoardProps): React.JSX.Element | null {
  const palette = useDraftPalette();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const nameByTeamId = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) map.set(String(team.id), team.name);
    return map;
  }, [teams]);

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

  const selected = useMemo<BoardCell | null>(
    () => cells.find((c) => c.key === selectedKey) ?? null,
    [cells, selectedKey],
  );

  if (teams.length === 0) return null;

  // Filled cells sit on a translucent wash of the position color. Light mode
  // needs a denser wash for `fgOnAccent` (a near-white in both themes) to stay
  // legible on it.
  const fillAlpha = (isMine: boolean) =>
    palette.resolvedTheme === 'light'
      ? isMine
        ? 0.92
        : 0.74
      : isMine
        ? 0.85
        : 0.55;

  const rows = Array.from({ length: rounds }, (_, i) =>
    cells.slice(i * teams.length, (i + 1) * teams.length),
  );

  return (
    <YStack>
      {/* Team column headers */}
      <XStack gap={CELL_GAP} marginBottom={4}>
        {teams.map((team) => {
          const isMine =
            myTeamId !== null && String(team.id) === String(myTeamId);
          return (
            <YStack key={team.id} flex={1} alignItems="center">
              <Text
                fontFamily="$heading"
                fontSize={9}
                fontWeight="800"
                letterSpacing={0.5}
                color={isMine ? '$brandGoldLight' : '$fg4'}
                numberOfLines={1}
              >
                {initialsOf(team.name)}
              </Text>
            </YStack>
          );
        })}
      </XStack>

      <ScrollView
        maxHeight={BOARD_MAX_HEIGHT}
        showsVerticalScrollIndicator={false}
      >
        <YStack gap={CELL_GAP}>
          {rows.map((row, rowIndex) => (
            <XStack key={`round-${rowIndex + 1}`} gap={CELL_GAP}>
              {row.map((cell) => {
                const positionColor = cell.position
                  ? getPositionColor('baseball', cell.position)
                  : null;
                const isSelected = cell.key === selectedKey;
                const borderColor = isSelected
                  ? palette.gold.goldLight
                  : cell.isCurrent
                    ? palette.gold.gold
                    : cell.pick && cell.isMine
                      ? withAlpha(palette.gold.gold, 0.6)
                      : palette.surface.panelBorder;

                return (
                  <Pressable
                    key={cell.key}
                    style={pressableCellStyle}
                    accessibilityRole="button"
                    accessibilityLabel={describeBoardCell(
                      cell,
                      nameByTeamId.get(cell.teamId) ?? 'Unknown Team',
                    )}
                    onPress={() =>
                      setSelectedKey((prev) =>
                        prev === cell.key ? null : cell.key,
                      )
                    }
                  >
                    <YStack
                      height={CELL_HEIGHT}
                      borderRadius={4}
                      borderWidth={1}
                      borderColor={borderColor}
                      backgroundColor={
                        positionColor
                          ? withAlpha(positionColor, fillAlpha(cell.isMine))
                          : '$surfacePanel'
                      }
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text
                        fontSize={8.5}
                        fontWeight="700"
                        color={cell.position ? '$fgOnAccent' : '$brandGold'}
                        numberOfLines={1}
                      >
                        {cell.position ?? (cell.isCurrent ? '●' : '')}
                      </Text>
                      {cell.isCurrent && (
                        <OnClockRing color={palette.gold.gold} />
                      )}
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
          ))}
        </YStack>
      </ScrollView>

      <Text
        fontSize={11}
        color="$textMuted"
        marginTop={8}
        minHeight={14}
        numberOfLines={2}
      >
        {describeBoardCell(
          selected,
          (selected && nameByTeamId.get(selected.teamId)) ?? 'Unknown Team',
        )}
      </Text>
    </YStack>
  );
}

const pressableCellStyle = { flex: 1 } as const;

export default DraftMiniBoard;

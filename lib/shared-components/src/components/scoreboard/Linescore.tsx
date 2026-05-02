/**
 * Linescore — inning-by-inning run breakdown with R/H/E totals.
 *
 * Renders as a Tamagui XStack/YStack grid so it works on both web and
 * native. Empty inning cells show an em-dash. The `currentInningIndex`
 * cell is highlighted when provided (used for live games).
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

export interface LinescoreProps {
  awayAbbr: string;
  homeAbbr: string;
  awayInnings: number[];
  homeInnings: number[];
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
  /**
   * Zero-based inning index to highlight as the current half-inning.
   * Use together with `currentInningHalf` to mark only one row.
   */
  currentInningIndex?: number | null;
  /** "Top" highlights the away row, "Bot" highlights the home row. */
  currentInningHalf?: 'Top' | 'Bot' | null;
}

const TABULAR_NUMS = ['tabular-nums'] as 'tabular-nums'[];
const CELL_WIDTH = 28;
const TOTAL_WIDTH = 32;
const LABEL_WIDTH = 40;

function inningTotal(innings: number[]): number {
  return innings.reduce(
    (sum, run) => sum + (Number.isFinite(run) ? run : 0),
    0,
  );
}

export function Linescore({
  awayAbbr,
  homeAbbr,
  awayInnings,
  homeInnings,
  awayHits,
  homeHits,
  awayErrors,
  homeErrors,
  currentInningIndex = null,
  currentInningHalf = null,
}: LinescoreProps): React.JSX.Element {
  const inningCount = Math.max(awayInnings.length, homeInnings.length, 9);
  const inningNumbers = Array.from({ length: inningCount }, (_, i) => i + 1);

  const awayRuns = inningTotal(awayInnings);
  const homeRuns = inningTotal(homeInnings);

  const renderRow = (
    abbr: string,
    innings: number[],
    runs: number,
    hits: number,
    errors: number,
    isCurrentRow: boolean,
  ) => (
    <XStack alignItems="center" gap="$1">
      <YStack width={LABEL_WIDTH}>
        <Text
          fontSize={12}
          fontWeight="700"
          letterSpacing={0.5}
          color="$color12"
        >
          {abbr}
        </Text>
      </YStack>

      {inningNumbers.map((_, i) => {
        const value = innings[i];
        const isCurrentCell =
          isCurrentRow &&
          currentInningIndex != null &&
          i === currentInningIndex;
        return (
          <YStack
            key={i}
            width={CELL_WIDTH}
            alignItems="center"
            justifyContent="center"
            paddingVertical={2}
            borderRadius={4}
            backgroundColor={isCurrentCell ? '$green3' : 'transparent'}
          >
            <Text
              fontSize={12}
              color={isCurrentCell ? '$green11' : '$color11'}
              fontVariant={TABULAR_NUMS}
            >
              {value !== undefined ? String(value) : '–'}
            </Text>
          </YStack>
        );
      })}

      <YStack width={8} />

      {[
        { value: runs, prominent: true },
        { value: hits, prominent: false },
        { value: errors, prominent: false },
      ].map((cell, i) => (
        <YStack
          key={i}
          width={TOTAL_WIDTH}
          alignItems="center"
          justifyContent="center"
        >
          <Text
            fontSize={cell.prominent ? 14 : 12}
            fontWeight={cell.prominent ? '800' : '600'}
            color={cell.prominent ? '$color12' : '$color11'}
            fontVariant={TABULAR_NUMS}
          >
            {cell.value}
          </Text>
        </YStack>
      ))}
    </XStack>
  );

  return (
    <YStack gap={4}>
      {/* Header row — inning numbers + R / H / E */}
      <XStack alignItems="center" gap="$1" paddingBottom={2}>
        <YStack width={LABEL_WIDTH} />
        {inningNumbers.map((n) => (
          <YStack key={n} width={CELL_WIDTH} alignItems="center">
            <Text
              fontSize={10}
              fontWeight="700"
              letterSpacing={1}
              color="$color9"
              textTransform="uppercase"
              fontVariant={TABULAR_NUMS}
            >
              {n}
            </Text>
          </YStack>
        ))}
        <YStack width={8} />
        {(['R', 'H', 'E'] as const).map((label) => (
          <YStack key={label} width={TOTAL_WIDTH} alignItems="center">
            <Text
              fontSize={10}
              fontWeight="700"
              letterSpacing={1}
              color="$color9"
              textTransform="uppercase"
            >
              {label}
            </Text>
          </YStack>
        ))}
      </XStack>

      {renderRow(
        awayAbbr,
        awayInnings,
        awayRuns,
        awayHits,
        awayErrors,
        currentInningHalf === 'Top',
      )}
      {renderRow(
        homeAbbr,
        homeInnings,
        homeRuns,
        homeHits,
        homeErrors,
        currentInningHalf === 'Bot',
      )}
    </YStack>
  );
}

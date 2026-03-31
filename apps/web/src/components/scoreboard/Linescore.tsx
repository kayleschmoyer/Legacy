import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

export interface LinescoreProps {
  homeInnings: number[];
  awayInnings: number[];
  homeAbbr: string;
  awayAbbr: string;
}

/**
 * Linescore — inning-by-inning run breakdown displayed as a compact grid.
 * Shows up to 9 innings (or more for extra innings) with per-inning runs and
 * a total runs (R) column. Hits and errors are not rendered here; they appear
 * in the GameCard footer.
 */
export function Linescore({
  homeInnings,
  awayInnings,
  homeAbbr,
  awayAbbr,
}: LinescoreProps) {
  const numInnings = Math.max(homeInnings.length, awayInnings.length, 9);
  const inningNumbers = Array.from({ length: numInnings }, (_, i) => i + 1);

  const cellStyle = {
    width: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const headerStyle = {
    ...cellStyle,
    paddingBottom: 2,
  };

  return (
    <YStack>
      {/* Header row — inning numbers */}
      <XStack gap="$1" alignItems="center">
        <YStack width={40} />
        {inningNumbers.map((n) => (
          <YStack key={n} style={headerStyle}>
            <Text fontSize="$1" color="$gray10" fontWeight="600">
              {n}
            </Text>
          </YStack>
        ))}
        <YStack width={8} />
        <YStack style={headerStyle}>
          <Text fontSize="$1" color="$gray10" fontWeight="600">
            R
          </Text>
        </YStack>
      </XStack>

      {/* Away team row */}
      <XStack gap="$1" alignItems="center">
        <YStack width={40}>
          <Text fontSize="$2" color="$gray12" fontWeight="600">
            {awayAbbr}
          </Text>
        </YStack>
        {inningNumbers.map((_, i) => (
          <YStack key={i} style={cellStyle}>
            <Text fontSize="$2" color="$gray11">
              {awayInnings[i] !== undefined ? awayInnings[i] : '-'}
            </Text>
          </YStack>
        ))}
        <YStack width={8} />
        <YStack style={cellStyle}>
          <Text fontSize="$2" color="$gray12" fontWeight="700">
            {awayInnings.reduce((a, b) => a + b, 0)}
          </Text>
        </YStack>
      </XStack>

      {/* Home team row */}
      <XStack gap="$1" alignItems="center">
        <YStack width={40}>
          <Text fontSize="$2" color="$gray12" fontWeight="600">
            {homeAbbr}
          </Text>
        </YStack>
        {inningNumbers.map((_, i) => (
          <YStack key={i} style={cellStyle}>
            <Text fontSize="$2" color="$gray11">
              {homeInnings[i] !== undefined ? homeInnings[i] : '-'}
            </Text>
          </YStack>
        ))}
        <YStack width={8} />
        <YStack style={cellStyle}>
          <Text fontSize="$2" color="$gray12" fontWeight="700">
            {homeInnings.reduce((a, b) => a + b, 0)}
          </Text>
        </YStack>
      </XStack>
    </YStack>
  );
}

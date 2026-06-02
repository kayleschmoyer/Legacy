// CustomEraRange — start/end year inputs shown when the "Custom Era" filter is
// selected. Shared by web and mobile league creation (LS-5174). testIDs match
// the web E2E selectors (`create-league-era-start-input` / `-end-input`).

import React from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';

export interface CustomEraRangeProps {
  startYear?: number;
  endYear?: number;
  onChangeStart: (v: number | undefined) => void;
  onChangeEnd: (v: number | undefined) => void;
  disabled?: boolean;
  /** Highlight both inputs (e.g. invalid range). */
  invalid?: boolean;
}

function parseYear(text: string): number | undefined {
  const year = parseInt(text, 10);
  return isNaN(year) ? undefined : year;
}

export function CustomEraRange({
  startYear,
  endYear,
  onChangeStart,
  onChangeEnd,
  disabled = false,
  invalid = false,
}: CustomEraRangeProps): React.JSX.Element {
  const borderColor = invalid ? '$red8' : '$brandNavyLight';
  return (
    <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
      <YStack flex={1} gap="$2" minWidth={120}>
        <Text
          fontFamily="$display"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$color11"
        >
          Start Year
        </Text>
        <Input
          id="era-start"
          size="$3"
          testID="create-league-era-start-input"
          placeholder="e.g. 1940"
          value={startYear !== undefined ? String(startYear) : ''}
          onChangeText={(text: string) => onChangeStart(parseYear(text))}
          keyboardType="numeric"
          disabled={disabled}
          borderColor={borderColor}
        />
      </YStack>
      <Text color="$gray9" marginBottom="$3">
        –
      </Text>
      <YStack flex={1} gap="$2" minWidth={120}>
        <Text
          fontFamily="$display"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$color11"
        >
          End Year
        </Text>
        <Input
          id="era-end"
          size="$3"
          testID="create-league-era-end-input"
          placeholder="e.g. 1960"
          value={endYear !== undefined ? String(endYear) : ''}
          onChangeText={(text: string) => onChangeEnd(parseYear(text))}
          keyboardType="numeric"
          disabled={disabled}
          borderColor={borderColor}
        />
      </YStack>
    </XStack>
  );
}

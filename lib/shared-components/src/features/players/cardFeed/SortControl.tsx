import React from 'react';
import { Text, XStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';
import { FONT_DISPLAY } from '../shell/tokens';

export interface SortControlProps {
  /** Current sort direction; tapping the control toggles it. */
  direction: 'asc' | 'desc';
  onToggle: () => void;
  /** Result count shown to the left of the control, e.g. "1,204 players". */
  resultCount: number;
  testID?: string;
}

/**
 * Result-count + FPTS sort-direction toggle row for the Players card feed
 * (LS-8832, design handoff option 1c). Sorting is always by fantasy points —
 * the design has no column picker, just a direction toggle.
 */
export function SortControl({
  direction,
  onToggle,
  resultCount,
  testID = 'players-card-feed-sort',
}: SortControlProps) {
  const arrow = direction === 'desc' ? '▼' : '▲';
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <Text fontSize={12} color={TEXT_TERTIARY}>
        {resultCount.toLocaleString()} players
      </Text>
      <XStack
        testID={testID}
        paddingHorizontal={12}
        paddingVertical={6}
        borderRadius={8}
        borderWidth={1}
        borderColor={withAlpha(BRAND_GOLD, 0.4)}
        backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
        onPress={onToggle}
        pressStyle={{ opacity: 0.85 }}
        accessibilityRole="button"
        accessibilityLabel={`Sort by fantasy points, currently ${direction === 'desc' ? 'descending' : 'ascending'}`}
      >
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={11}
          textTransform="uppercase"
          color={BRAND_GOLD_LIGHT}
        >
          FPTS {arrow}
        </Text>
      </XStack>
    </XStack>
  );
}

export default SortControl;

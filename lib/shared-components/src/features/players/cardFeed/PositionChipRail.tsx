import React from 'react';
import { ScrollView, Text, XStack } from 'tamagui';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  getPositionColor,
  lightenForContrast,
  OUTLINE_DEFAULT,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../../../utils/colors';
import type { Sport } from '../../../utils/colors';
import { FONT_DISPLAY } from '../shell/tokens';

export interface PositionChipRailProps {
  sport: Sport;
  positions: readonly string[];
  value: string;
  onChange: (position: string) => void;
  testID?: string;
}

/**
 * Horizontally-scrolling, single-select position filter chip rail for the
 * Players card feed (LS-8832, design handoff option 1c). `ALL` gets the gold
 * treatment; every other chip resolves its accent from the canonical
 * `getPositionColor(sport, position)` table, with the active label lightened
 * to a WCAG AAA-on-`darkSurface.bg` variant via `lightenForContrast` (the
 * handoff's "prototype PCT map, or compute via oklch lighten" instruction).
 */
export function PositionChipRail({
  sport,
  positions,
  value,
  onChange,
  testID = 'players-card-feed-position-chips',
}: PositionChipRailProps) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <XStack gap={6}>
        {positions.map((position) => {
          const active = value === position;
          const isAll = position === 'ALL';
          const accent = isAll ? BRAND_GOLD : getPositionColor(sport, position);
          const activeTextColor = isAll
            ? BRAND_GOLD_LIGHT
            : lightenForContrast(accent, BG_DARK);
          const activeBg = isAll
            ? withAlpha(BRAND_GOLD, 0.14)
            : withAlpha(WHITE, 0.06);

          return (
            <XStack
              key={position}
              testID={`${testID}-${position}`}
              paddingHorizontal={13}
              paddingVertical={7}
              borderRadius={9999}
              borderWidth={1}
              borderColor={active ? accent : OUTLINE_DEFAULT}
              backgroundColor={active ? activeBg : 'transparent'}
              onPress={() => !active && onChange(position)}
              pressStyle={{ opacity: 0.85 }}
              role="tab"
              accessibilityRole="tab"
              aria-selected={active}
              accessibilityState={{ selected: active }}
            >
              <Text
                fontFamily={FONT_DISPLAY}
                fontWeight="700"
                fontSize={11}
                letterSpacing={0.8}
                color={active ? activeTextColor : TEXT_MUTED}
              >
                {position}
              </Text>
            </XStack>
          );
        })}
      </XStack>
    </ScrollView>
  );
}

export default PositionChipRail;

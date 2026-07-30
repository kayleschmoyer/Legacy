import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  BRAND_NAVY,
  OUTLINE_DEFAULT,
  SURFACE_PANEL,
  TEXT_MUTED,
  WHITE,
} from '../../../utils/colors';
import { FONT_DISPLAY } from '../shell/tokens';

export interface SportToggleProps {
  sport: 'baseball' | 'football';
  onChange: (sport: 'baseball' | 'football') => void;
  testID?: string;
}

const SEGMENTS: ReadonlyArray<{ key: 'baseball' | 'football'; label: string }> =
  [
    { key: 'baseball', label: 'MLB' },
    { key: 'football', label: 'NFL' },
  ];

/**
 * Compact MLB/NFL pill toggle for the Players card feed title row (LS-8832,
 * design handoff option 1c). Switching segments is the caller's
 * responsibility to wire to the existing `sportKey` remount contract in
 * `players.tsx` — this component only reports the requested sport.
 */
export function SportToggle({ sport, onChange, testID }: SportToggleProps) {
  return (
    <XStack
      testID={testID}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={OUTLINE_DEFAULT}
      borderRadius={9999}
      padding={3}
    >
      {SEGMENTS.map(({ key, label }) => {
        const active = sport === key;
        return (
          <YStack
            key={key}
            testID={testID ? `${testID}-${key}` : undefined}
            paddingHorizontal={12}
            paddingVertical={5}
            borderRadius={9999}
            backgroundColor={active ? BRAND_NAVY : 'transparent'}
            onPress={() => !active && onChange(key)}
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
              letterSpacing={0.96}
              color={active ? WHITE : TEXT_MUTED}
            >
              {label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

export default SportToggle;

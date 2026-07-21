import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { FG3, FONT_BODY, FONT_DISPLAY, OUTLINE_DEFAULT } from './tokens';
import {
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export type AvailabilityValue = 'all' | 'free_agents' | 'rostered';

const DEFAULT_OPTIONS: readonly [AvailabilityValue, string][] = [
  ['all', 'All'],
  ['free_agents', 'Free Agents'],
  ['rostered', 'Rostered'],
];

export interface AvailabilityFilterProps {
  value: AvailabilityValue;
  onChange: (value: AvailabilityValue) => void;
  options?: readonly [AvailabilityValue, string][];
}

/**
 * All / Free Agents / Rostered availability pill row. Only meaningful when the
 * viewer is in at least one league of the active sport — the caller decides
 * whether to render it. Sport-neutral.
 */
export function AvailabilityFilter({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: AvailabilityFilterProps) {
  return (
    <XStack
      gap={6}
      alignItems="center"
      flexWrap="wrap"
      style={csp({ paddingTop: 4 })}
    >
      <Text
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: FG3,
          whiteSpace: 'nowrap',
        })}
      >
        Availability
      </Text>
      {options.map(([optValue, label]) => {
        const active = value === optValue;
        return (
          <Pressable
            key={optValue}
            onPress={() => onChange(optValue)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={csp({
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 9999,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: active ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT,
              backgroundColor: active
                ? withAlpha(BRAND_NAVY, 0.45)
                : 'transparent',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_BODY,
                fontWeight: active ? '700' : '500',
                fontSize: 13,
                color: active ? TEXT_PRIMARY : FG3,
              })}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

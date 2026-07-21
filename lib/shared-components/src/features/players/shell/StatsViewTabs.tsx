import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { BG_PANEL, FG3, FONT_DISPLAY } from './tokens';
import { BRAND_NAVY, STATS_BORDER, WHITE } from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface StatsTabDef {
  id: string;
  label: string;
}

export interface StatsViewTabsProps {
  tabs: readonly StatsTabDef[];
  active: string;
  onSelect: (id: string) => void;
  /** Accessible label for the tablist. */
  ariaLabel?: string;
}

/**
 * Pill-cluster view-mode tabs (baseball: Combined / Hitters / Pitchers). Renders
 * nothing when fewer than two tabs are supplied, so a single-view sport
 * (football) can pass `[]` and get no tab strip. Sport-neutral.
 */
export function StatsViewTabs({
  tabs,
  active,
  onSelect,
  ariaLabel = 'Player stats view mode',
}: StatsViewTabsProps): React.JSX.Element | null {
  if (tabs.length < 2) return null;
  return (
    <XStack
      role="tablist"
      accessibilityRole="tablist"
      aria-label={ariaLabel}
      style={csp({
        alignSelf: 'flex-start',
        gap: 4,
        padding: 5,
        background: BG_PANEL,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 9999,
      })}
    >
      {tabs.map(({ id, label }) => {
        const selected = active === id;
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            role="tab"
            accessibilityRole="tab"
            aria-selected={selected}
            accessibilityState={{ selected }}
            style={csp({
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: 9999,
              backgroundColor: selected ? BRAND_NAVY : 'transparent',
              minHeight: 44,
              minWidth: 44,
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: selected ? WHITE : FG3,
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

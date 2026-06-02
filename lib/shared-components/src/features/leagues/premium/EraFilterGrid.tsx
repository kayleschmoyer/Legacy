// EraFilterGrid — cross-platform era selector for league creation (LS-5174).
//
// Replaces the web-only `EraCardGrid` (raw `<div>`/`<button>` + inline CSS) with
// a Tamagui implementation that renders on both web and React Native. Premium
// eras show a lock and route taps to `onUpgrade` instead of selecting until the
// viewer is premium.

import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { ERAS_BY_SPORT, type LeagueSport } from './constants';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  EMERALD,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';

const THEME_PRIMARY_BY_SPORT: Record<LeagueSport, string> = {
  baseball: BRAND_NAVY_LIGHT,
  football: EMERALD,
};

export interface EraFilterGridProps {
  sport: LeagueSport;
  value: string;
  onChange: (v: string) => void;
  /** Whether the viewer can select premium eras. */
  isPremium: boolean;
  disabled?: boolean;
  /** Called when a locked (premium) era is tapped by a non-premium viewer. */
  onUpgrade: () => void;
}

export function EraFilterGrid({
  sport,
  value,
  onChange,
  isPremium,
  disabled = false,
  onUpgrade,
}: EraFilterGridProps): React.JSX.Element {
  const eraOptions = ERAS_BY_SPORT[sport];
  const themePrimary = THEME_PRIMARY_BY_SPORT[sport];

  return (
    <XStack flexWrap="wrap" gap="$2">
      {eraOptions.map((era) => {
        const locked = era.premium && !isPremium;
        const selected = value === era.id;
        const borderColor = selected
          ? era.premium
            ? BRAND_GOLD
            : withAlpha(themePrimary, 0.8)
          : PANEL_BORDER;
        const backgroundColor = selected
          ? era.premium
            ? withAlpha(BRAND_GOLD, 0.08)
            : withAlpha(themePrimary, 0.22)
          : BG_DARK;

        return (
          <YStack
            key={era.id}
            testID={`era-card-${era.id}`}
            accessibilityRole="button"
            accessibilityLabel={era.name}
            aria-label={era.name}
            onPress={() => {
              if (disabled) return;
              if (locked) {
                onUpgrade();
                return;
              }
              onChange(era.id);
            }}
            flexGrow={1}
            flexBasis="30%"
            minWidth={96}
            minHeight={76}
            padding="$3"
            gap={3}
            borderWidth={1}
            borderStyle={locked ? 'dashed' : 'solid'}
            borderColor={borderColor}
            borderRadius={8}
            backgroundColor={backgroundColor}
            opacity={disabled ? 0.5 : 1}
            cursor={disabled ? 'default' : 'pointer'}
            pressStyle={disabled ? undefined : { scale: 0.97 }}
          >
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={14}
              letterSpacing={0.1}
              color={selected && era.premium ? BRAND_GOLD_LIGHT : TEXT_PRIMARY}
            >
              {era.name}
            </Text>
            <Text fontFamily="$body" fontSize={11} color={TEXT_MUTED}>
              {era.years}
            </Text>
            {era.premium && (
              <YStack position="absolute" top={8} right={8}>
                <Lock size={11} color={BRAND_GOLD_LIGHT} />
              </YStack>
            )}
          </YStack>
        );
      })}
    </XStack>
  );
}

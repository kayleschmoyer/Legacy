import React from 'react';
import { isWeb, Text, XStack } from 'tamagui';
import { Zap } from '@tamagui/lucide-icons/icons/Zap';
import {
  ACCENT_INK,
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  OUTLINE_DEFAULT,
  OUTLINE_STRONG,
  OUTLINE_SUBTLE,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY } from '../../utils/typography';

export interface RosterActionBarProps {
  /** Fires when the gold "Optimal Lineup" button is pressed. */
  onOptimalLineup?: () => void;
  /** Disables the "Optimal Lineup" button while keeping it visible. */
  optimalLineupDisabled?: boolean;
  /** Fires when the ghost "Quick Swap" button is pressed (e.g. scroll to bench). */
  onQuickSwap?: () => void;
}

const BUTTON_MIN_HEIGHT = 44;

function BarButton({
  label,
  icon,
  variant,
  disabled,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  variant: 'gold' | 'ghost';
  disabled?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const gold = variant === 'gold';
  return (
    <XStack
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      flex={1}
      minHeight={BUTTON_MIN_HEIGHT}
      alignItems="center"
      justifyContent="center"
      gap="$2"
      borderRadius="$4"
      borderWidth={1}
      borderColor={gold ? 'transparent' : OUTLINE_DEFAULT}
      backgroundColor={gold ? BRAND_GOLD : 'transparent'}
      opacity={disabled ? 0.55 : 1}
      hoverStyle={
        disabled
          ? undefined
          : gold
            ? { backgroundColor: BRAND_GOLD_LIGHT }
            : { borderColor: OUTLINE_STRONG }
      }
      pressStyle={disabled ? undefined : { scale: 0.98 }}
      onPress={disabled ? undefined : onPress}
    >
      {icon}
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1}
        textTransform="uppercase"
        color={gold ? ACCENT_INK : TEXT_PRIMARY}
      >
        {label}
      </Text>
    </XStack>
  );
}

/**
 * RosterActionBar — the thumb-reach action bar from the roster "command
 * center" mobile layout (LS-9355, mockup 2b). Callers render it on narrow
 * viewports only: web pins it with fixed positioning; native places it as a
 * sibling below the tab's ScrollView so it stays on screen naturally.
 *
 * Buttons render only when their handler is provided.
 */
export function RosterActionBar({
  onOptimalLineup,
  optimalLineupDisabled = false,
  onQuickSwap,
}: RosterActionBarProps): React.JSX.Element | null {
  if (onOptimalLineup == null && onQuickSwap == null) return null;
  return (
    <XStack
      gap="$2"
      paddingHorizontal="$3.5"
      paddingTop="$2.5"
      paddingBottom="$3.5"
      borderTopWidth={1}
      borderTopColor={OUTLINE_SUBTLE}
      backgroundColor={withAlpha(BG_DARK, 0.94)}
      // Fixed pinning + glass blur are DOM-only; native callers place the bar
      // outside their ScrollView instead.
      style={
        isWeb
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 5,
              backdropFilter: 'blur(10px)',
            }
          : undefined
      }
    >
      {onOptimalLineup != null && (
        <BarButton
          label="Optimal Lineup"
          icon={<Zap size={13} color={ACCENT_INK} />}
          variant="gold"
          disabled={optimalLineupDisabled}
          onPress={onOptimalLineup}
        />
      )}
      {onQuickSwap != null && (
        <BarButton label="Quick Swap" variant="ghost" onPress={onQuickSwap} />
      )}
    </XStack>
  );
}

import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { FONT_BODY, FONT_DISPLAY, OUTLINE_SUBTLE } from './tokens';
import { Platform } from '../../../platform-components';
import { BRAND_GOLD_LIGHT, SURFACE_CARD } from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface AdvancedFilterPanelProps {
  /** Uppercase section heading (e.g. "Stat Ranges"). */
  title: string;
  /** Reset link label; omit to hide the reset affordance. */
  resetLabel?: string;
  onReset?: () => void;
  /**
   * When true (default) the children are laid out in the shared `.ps-adv-grid`
   * 3-column responsive grid (baseball sliders). Pass false to render children
   * in a plain column (football's mixed controls own their own layout).
   */
  grid?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible advanced-filters panel frame: a titled card with an optional
 * "Reset" link and a slot for the sport's controls. Baseball fills it with stat
 * sliders; football with projected-points / ADP inputs. Sport-neutral.
 */
export function AdvancedFilterPanel({
  title,
  resetLabel,
  onReset,
  grid = true,
  children,
}: AdvancedFilterPanelProps) {
  return (
    <YStack
      className={Platform.OS === 'web' ? 'ps-adv-panel' : undefined}
      style={csp({
        padding: '18px 20px',
        background: SURFACE_CARD,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 16,
        gap: 14,
      })}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text
          style={csp({
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: 1.76,
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          })}
        >
          {title}
        </Text>
        {resetLabel && onReset && (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            style={csp({
              backgroundColor: 'transparent',
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 6,
            })}
          >
            <Text
              style={csp({
                color: BRAND_GOLD_LIGHT,
                fontFamily: FONT_BODY,
                fontSize: 13,
                fontWeight: '500',
              })}
            >
              {resetLabel}
            </Text>
          </Pressable>
        )}
      </XStack>
      {grid ? (
        <XStack
          className={Platform.OS === 'web' ? 'ps-adv-grid' : undefined}
          style={csp({
            display: Platform.OS === 'web' ? 'grid' : 'flex',
            flexDirection: 'column',
            gap: 20,
          })}
        >
          {children}
        </XStack>
      ) : (
        children
      )}
    </YStack>
  );
}

import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  FG3,
  FONT_BODY,
  FONT_DISPLAY,
  OUTLINE_DEFAULT,
  OUTLINE_SUBTLE,
} from './tokens';
import { Platform } from '../../../platform-components';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  SURFACE_CARD,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import type { ToggleableColumn } from '../columnVisibility';
import { csp } from '../crossPlatformStyle';

// ── Column visibility picker ────────────────────────────────────────────────────

export interface ColumnPickerPanelProps {
  columns: ToggleableColumn[];
  /** Keys currently shown (explicit selection, or the preset baseline). */
  visibleKeys: ReadonlySet<string>;
  /** True when an explicit selection exists — gates the "Reset columns" link. */
  customized: boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
}

/**
 * Per-column show/hide picker (LS-7105 / PST-001). Rendered inline beneath the
 * toolbar — mirrors the Advanced panel's treatment — so it works identically on
 * web and native without a popover/portal dependency. Each row is a checkbox
 * toggling a single stat column; "Reset columns" clears the selection back to
 * the statsFormat preset.
 */
export function ColumnPickerPanel({
  columns,
  visibleKeys,
  customized,
  onToggle,
  onReset,
}: ColumnPickerPanelProps) {
  return (
    <YStack
      testID="column-picker-panel"
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
          Visible Columns
        </Text>
        {customized && (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reset columns to default"
            testID="column-picker-reset"
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
              Reset columns
            </Text>
          </Pressable>
        )}
      </XStack>
      <XStack
        className={Platform.OS === 'web' ? 'ps-col-grid' : undefined}
        style={csp({
          display: Platform.OS === 'web' ? 'grid' : 'flex',
          flexDirection: 'column',
          gap: 8,
        })}
      >
        {columns.map((col) => {
          const checked = visibleKeys.has(col.key);
          return (
            <Pressable
              key={col.key}
              onPress={() => onToggle(col.key)}
              // react-native-web 0.21 drops accessibilityState, so the checked
              // state must be passed as aria-checked for it to reach the DOM.
              role="checkbox"
              aria-checked={checked}
              aria-label={`${col.label} column`}
              accessibilityState={{ checked }}
              // RNW activates onPress on Enter for any role but on Space only
              // for button roles, so a checkbox needs its own Space handler
              // (LS-10734). preventDefault stops Space scrolling the page.
              // Spread because RN's PressableProps doesn't type the web-only
              // onKeyDown that RNW forwards; native ignores it.
              {...{
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === ' ' && !e.repeat) {
                    e.preventDefault();
                    onToggle(col.key);
                  }
                },
              }}
              testID={`column-toggle-${col.key}`}
              style={csp({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 6,
                minHeight: 36,
              })}
            >
              <YStack
                style={csp({
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: checked ? BRAND_GOLD : OUTLINE_DEFAULT,
                  backgroundColor: checked
                    ? withAlpha(BRAND_GOLD, 0.2)
                    : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                {checked && (
                  <Text
                    style={csp({
                      color: BRAND_GOLD_LIGHT,
                      fontSize: 13,
                      lineHeight: 14,
                    })}
                  >
                    ✓
                  </Text>
                )}
              </YStack>
              <Text
                numberOfLines={1}
                style={csp({
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: checked ? TEXT_PRIMARY : FG3,
                })}
              >
                {col.label}
              </Text>
            </Pressable>
          );
        })}
      </XStack>
    </YStack>
  );
}

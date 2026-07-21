import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView } from 'react-native';
import { Text } from 'tamagui';
import { FG3, FONT_BODY, FONT_DISPLAY, MODAL_SCRIM } from './tokens';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  STATS_BORDER,
  SURFACE_PANEL,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface NativeSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

// ── Native filter controls ─────────────────────────────────────────────────────
// Web renders inline `<select>`; this is the cross-platform equivalent rendered
// under `Platform.OS !== 'web'` so native reaches filter parity without forking
// the page or pulling in a picker dependency.

/**
 * Native (iOS/Android) replacement for the web `<select>`. Shows the current
 * value with a chevron and opens a bottom-sheet option list on tap. The parent
 * field already renders the `{label}` caption, so this only owns the value and
 * the picker (LS-7806).
 */
export function NativeSelect({
  label,
  value,
  options,
  onChange,
}: NativeSelectProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={csp({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 24,
        })}
      >
        <Text
          numberOfLines={1}
          style={csp({
            flex: 1,
            fontFamily: FONT_BODY,
            fontSize: 14,
            color: TEXT_PRIMARY,
          })}
        >
          {value}
        </Text>
        <Text style={csp({ color: FG3, fontSize: 12 })}>▾</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label} picker`}
          style={csp({
            flex: 1,
            backgroundColor: MODAL_SCRIM,
            justifyContent: 'flex-end',
          })}
        >
          {/* Inner Pressable absorbs taps so a tap on the sheet doesn't dismiss it. */}
          <Pressable
            onPress={() => {
              /* absorb tap — keep the sheet open */
            }}
            style={csp({
              backgroundColor: SURFACE_PANEL,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderColor: STATS_BORDER,
              paddingTop: 16,
              paddingBottom: 28,
              maxHeight: '60%',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
                paddingHorizontal: 20,
                paddingBottom: 8,
              })}
            >
              {label}
            </Text>
            <ScrollView>
              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      if (opt !== value) onChange(opt);
                      close();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={csp({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      minHeight: 48,
                      backgroundColor: selected
                        ? withAlpha(BRAND_NAVY, 0.35)
                        : 'transparent',
                    })}
                  >
                    <Text
                      style={csp({
                        fontFamily: FONT_BODY,
                        fontSize: 16,
                        fontWeight: selected ? '700' : '400',
                        color: selected ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                      })}
                    >
                      {opt}
                    </Text>
                    {selected ? (
                      <Text
                        style={csp({ color: BRAND_GOLD_LIGHT, fontSize: 16 })}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

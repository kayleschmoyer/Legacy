import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Pressable } from 'react-native';
import {
  FG4,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  OUTLINE_DEFAULT,
} from './tokens';
import {
  createDebouncedCommit,
  type DebouncedCommit,
  parseSliderValue,
  SLIDER_COMMIT_DEBOUNCE_MS,
  sliderFillPct,
  stepValue,
} from './sliderUtils';
import { Platform } from '../../../platform-components';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface StatSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}

/**
 * Stable {@link DebouncedCommit} bound to the latest `commit` callback. The
 * debounce instance is created once (per `delayMs`) so its pending timer
 * survives re-renders, while a ref keeps it calling the current `commit`
 * without rebuilding the timer. Any pending commit is cancelled on unmount.
 */
export function useDebouncedCommit(
  commit: () => void,
  delayMs: number = SLIDER_COMMIT_DEBOUNCE_MS,
): DebouncedCommit {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const debounced = useMemo(
    () => createDebouncedCommit(() => commitRef.current(), delayMs),
    [delayMs],
  );
  useEffect(() => debounced.cancel, [debounced]);
  return debounced;
}

/**
 * A labeled advanced-filter range slider. Web renders a native range `<input>`
 * with a gold fill track; native falls back to a −/+ stepper. The keyboard
 * commit path is debounced so a held arrow key doesn't refire the grid query
 * per keystroke (LS-7128). Sport-neutral — the label/format/range are supplied
 * by each sport config's advanced panel.
 */
export function StatSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: StatSliderProps) {
  const pct = sliderFillPct(value, min, max);

  // Debounce the keyboard commit path: onKeyUp fires once per arrow-key press,
  // so holding an arrow would otherwise commit (remount grid + refetch) per
  // keystroke. Mouse/touch release are terminal single events and commit
  // immediately (cancelling any pending debounce); blur flushes a pending
  // keyboard commit so leaving the control doesn't wait out the delay (LS-7128).
  const debouncedCommit = useDebouncedCommit(onCommit);
  const commitImmediately = useCallback(() => {
    debouncedCommit.cancel();
    onCommit();
  }, [debouncedCommit, onCommit]);

  return (
    <YStack style={csp({ gap: 8 })}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text
          style={csp({
            fontFamily: FONT_BODY,
            fontWeight: '500',
            fontSize: 13,
            color: TEXT_MUTED,
          })}
        >
          {label}
        </Text>
        <Text
          style={csp({
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 18,
            color: BRAND_GOLD_LIGHT,
            fontVariantNumeric: 'tabular-nums',
          })}
        >
          {format(value)}
        </Text>
      </XStack>
      {Platform.OS === 'web' ? (
        <input
          type="range"
          aria-label={label}
          className="ps-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
          onChange={(e) => {
            const next = parseSliderValue(e.target.value);
            // Reject NaN/±Infinity at the setter boundary so corrupted input
            // never reaches filter state (LS-7137).
            if (next !== null) {
              onChange(next);
            }
          }}
          onMouseUp={commitImmediately}
          onTouchEnd={commitImmediately}
          onKeyUp={debouncedCommit.trigger}
          onBlur={debouncedCommit.flush}
        />
      ) : (
        <NativeRangeStepper
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          onCommit={onCommit}
        />
      )}
      <XStack justifyContent="space-between">
        <Text
          style={csp({
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          })}
        >
          {format(min)}
        </Text>
        <Text
          style={csp({
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: FG4,
          })}
        >
          {format(max)}
        </Text>
      </XStack>
    </YStack>
  );
}

interface NativeRangeStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}

/**
 * Native replacement for the web range `<input>`. React Native ships no slider
 * primitive and this library deliberately avoids a slider dependency, so the
 * value (rendered by the parent {@link StatSlider}) is adjusted via −/+ stepper
 * buttons. Each press snaps to the step grid, clamps to range, and commits the
 * applied-filter snapshot (LS-7806).
 */
function NativeRangeStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
}: NativeRangeStepperProps) {
  const apply = useCallback(
    (delta: number) => {
      const next = stepValue(value, delta, min, max, step);
      if (next !== value) {
        onChange(next);
        onCommit();
      }
    },
    [value, min, max, step, onChange, onCommit],
  );

  const pct = sliderFillPct(value, min, max);

  return (
    <XStack style={csp({ gap: 12, alignItems: 'center' })}>
      <StepperButton
        label="−"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => apply(-step)}
      />
      <YStack
        style={csp({
          flex: 1,
          height: 4,
          borderRadius: 9999,
          backgroundColor: withAlpha(WHITE, 0.08),
          overflow: 'hidden',
        })}
      >
        <YStack
          style={csp({
            width: `${pct}%`,
            height: 4,
            backgroundColor: BRAND_GOLD,
          })}
        />
      </YStack>
      <StepperButton
        label="+"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => apply(step)}
      />
    </XStack>
  );
}

interface StepperButtonProps {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}

function StepperButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: StepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={csp({
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: OUTLINE_DEFAULT,
        backgroundColor: SURFACE_CARD,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 22,
          lineHeight: 24,
          color: TEXT_PRIMARY,
        })}
      >
        {label}
      </Text>
    </Pressable>
  );
}

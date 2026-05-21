/**
 * SportFilter — segmented pill that switches the scoreboard between sports.
 *
 * Three options: All · MLB · NFL. The chrome ships now so the future NFL
 * scoreboard wires in without a header redesign; `disabledSports` lets the
 * caller render any sport as not-yet-selectable when its backend is offline.
 *
 * Implements the WAI-ARIA radiogroup pattern:
 *   - The container has `role="radiogroup"` and owns a keyboard handler that
 *     moves selection via ArrowLeft / ArrowRight / Home / End.
 *   - Each option has `role="radio"`. Only the currently selected option is
 *     in the tab order (`tabIndex={0}`); the others are `tabIndex={-1}` and
 *     reachable via arrow keys, per the standard pattern.
 *   - Disabled options are skipped during arrow navigation but remain visible.
 */
import React, { useCallback, useRef } from 'react';
import { Text, XStack } from 'tamagui';
import { FONT_DISPLAY } from '../../constants/typography';
import { BaseballIcon, FootballIcon } from '../icons/SportIcons';

export type SportKey = 'all' | 'mlb' | 'nfl';

interface SportFilterProps {
  value: SportKey;
  onChange: (next: SportKey) => void;
  /** Sports that have no data today render as disabled. */
  disabledSports?: SportKey[];
}

interface Option {
  key: SportKey;
  label: string;
  glyph: React.ReactNode | null;
}

const OPTIONS: Option[] = [
  { key: 'all', label: 'All', glyph: null },
  { key: 'mlb', label: 'MLB', glyph: <BaseballIcon size={14} /> },
  { key: 'nfl', label: 'NFL', glyph: <FootballIcon size={14} /> },
];

export function SportFilter({
  value,
  onChange,
  disabledSports = [],
}: SportFilterProps) {
  const buttonRefs = useRef<Record<SportKey, HTMLButtonElement | null>>({
    all: null,
    mlb: null,
    nfl: null,
  });

  const focusKey = useCallback((next: SportKey) => {
    buttonRefs.current[next]?.focus();
  }, []);

  // Roving-tabindex arrow navigation per WAI-ARIA radiogroup pattern. Arrow
  // keys move selection and focus together; disabled options are skipped.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const enabled = OPTIONS.filter((o) => !disabledSports.includes(o.key));
      if (enabled.length === 0) return;

      const idx = Math.max(
        0,
        enabled.findIndex((o) => o.key === value),
      );
      let nextIdx: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIdx = (idx + 1) % enabled.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIdx = (idx - 1 + enabled.length) % enabled.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = enabled.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      const nextKey = enabled[nextIdx].key;
      onChange(nextKey);
      focusKey(nextKey);
    },
    [disabledSports, focusKey, onChange, value],
  );

  return (
    <XStack
      role="radiogroup"
      aria-label="Filter scoreboard by sport"
      onKeyDown={onKeyDown}
      alignItems="center"
      gap={2}
      backgroundColor="$surfacePanel"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$10"
      padding={4}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        const disabled = disabledSports.includes(opt.key);
        return (
          <SportButton
            key={opt.key}
            sportKey={opt.key}
            label={opt.label}
            glyph={opt.glyph}
            active={active}
            disabled={disabled}
            buttonRef={(el) => {
              buttonRefs.current[opt.key] = el;
            }}
            onPress={() => {
              if (disabled) return;
              onChange(opt.key);
            }}
          />
        );
      })}
    </XStack>
  );
}

function SportButton({
  sportKey,
  label,
  glyph,
  active,
  disabled,
  buttonRef,
  onPress,
}: {
  sportKey: SportKey;
  label: string;
  glyph: React.ReactNode | null;
  active: boolean;
  disabled: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onPress: () => void;
}) {
  return (
    <XStack
      tag="button"
      type="button"
      role="radio"
      ref={buttonRef as never}
      data-testid={`scoreboard-sport-${sportKey}`}
      aria-checked={active}
      aria-disabled={disabled}
      disabled={disabled}
      // Roving tabindex: only the selected radio is in the tab order.
      tabIndex={active ? 0 : -1}
      title={disabled ? `${label} scoreboard coming soon` : undefined}
      onPress={onPress}
      alignItems="center"
      gap="$2"
      paddingHorizontal="$3"
      paddingVertical="$2"
      minHeight={36}
      borderWidth={0}
      borderRadius="$10"
      backgroundColor={active ? '$brandNavy' : 'transparent'}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.45 : 1}
      hoverStyle={
        disabled || active
          ? undefined
          : { backgroundColor: 'rgba(255, 255, 255, 0.04)' }
      }
    >
      {glyph}
      <Text
        fontSize={12}
        fontWeight="700"
        letterSpacing={1.4}
        textTransform="uppercase"
        color={active ? 'white' : '$color11'}
        fontFamily={FONT_DISPLAY}
      >
        {label}
      </Text>
    </XStack>
  );
}

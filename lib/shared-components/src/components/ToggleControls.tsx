import React from 'react';
import {
  RadioGroup,
  Checkbox as TamaguiCheckbox,
  Switch as TamaguiSwitch,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import type { GetProps } from 'tamagui';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { Minus } from '@tamagui/lucide-icons/icons/Minus';
import { handleKeyActivate } from '../utils/keyboardActivation';

// ─── Switch ──────────────────────────────────────────────────────────────────
export interface SwitchProps extends GetProps<typeof TamaguiSwitch> {
  label?: string;
  subLabel?: string;
}

export function Switch({
  label,
  subLabel,
  ...props
}: SwitchProps): React.JSX.Element {
  const sw = (
    <TamaguiSwitch
      size="$3"
      width={42}
      height={24}
      backgroundColor="$surfaceCard"
      borderColor="$outlineStrong"
      borderWidth={1}
      $checked={{
        backgroundColor: '$brandNavy',
        borderColor: '$brandNavyLight',
      }}
      {...props}
    >
      <TamaguiSwitch.Thumb
        animation="quick"
        backgroundColor="white"
        shadowColor="rgba(0,0,0,0.4)"
        shadowOffset={{ width: 0, height: 1 }}
        shadowRadius={3}
        shadowOpacity={1}
        $checked={{ backgroundColor: '$brandGold' }}
      />
    </TamaguiSwitch>
  );
  if (!label) return sw;
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$3">
      <YStack gap={2}>
        <Text fontFamily="$body" fontSize={14} color="$color">
          {label}
        </Text>
        {subLabel != null && (
          <Text fontFamily="$body" fontSize={12} color="$textMuted">
            {subLabel}
          </Text>
        )}
      </YStack>
      {sw}
    </XStack>
  );
}

// ─── Checkbox ────────────────────────────────────────────────────────────────
export interface CheckboxProps extends Omit<
  GetProps<typeof TamaguiCheckbox>,
  'children'
> {
  label?: string;
  /** When true, show indeterminate state (overrides checked icon). */
  indeterminate?: boolean;
}

export function Checkbox({
  label,
  indeterminate,
  checked: checkedProp,
  defaultChecked,
  onCheckedChange,
  ...props
}: CheckboxProps): React.JSX.Element {
  // Tamagui has no `$checked` pseudo, so the checked fill must be driven from
  // the resolved state explicitly — otherwise checked and unchecked boxes
  // render identically (LS-10798). Mirror the state for uncontrolled usage.
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
    defaultChecked ?? false,
  );
  const isControlled = checkedProp !== undefined;
  const checked = isControlled ? checkedProp : uncontrolledChecked;
  const isOn = checked !== false;
  const checkbox = (
    <TamaguiCheckbox
      size="$3"
      width={18}
      height={18}
      borderWidth={1.5}
      borderRadius={4}
      {...props}
      // Navy fill carries the light theme; the gold border keeps the checked
      // box distinct on the dark card surface, where navy alone is ~1.4:1.
      backgroundColor={isOn ? '$brandNavy' : '$surfaceCard'}
      borderColor={isOn ? '$brandGold' : '$outlineStrong'}
      checked={checked}
      onCheckedChange={(next) => {
        if (!isControlled) setUncontrolledChecked(next);
        onCheckedChange?.(next);
      }}
    >
      <TamaguiCheckbox.Indicator>
        {indeterminate ? (
          <Minus size={12} color="white" />
        ) : (
          <Check size={12} color="white" />
        )}
      </TamaguiCheckbox.Indicator>
    </TamaguiCheckbox>
  );
  if (!label) return checkbox;
  return (
    <XStack gap="$2" alignItems="center">
      {checkbox}
      <Text fontFamily="$body" fontSize={14} color="$color">
        {label}
      </Text>
    </XStack>
  );
}

// ─── Radio ───────────────────────────────────────────────────────────────────
export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: RadioOption[];
  name?: string;
}

export function Radio({
  value,
  defaultValue,
  onValueChange,
  options,
  name,
}: RadioProps): React.JSX.Element {
  const [localValue, setLocalValue] = React.useState(defaultValue ?? '');
  const controlled = value !== undefined;
  const currentValue = controlled ? value : localValue;

  const handleValueChange = React.useCallback(
    (val: string) => {
      if (!controlled) setLocalValue(val);
      onValueChange?.(val);
    },
    [controlled, onValueChange],
  );

  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      name={name}
    >
      <YStack gap="$2">
        {options.map((opt) => {
          const isSelected = currentValue === opt.value;
          return (
            <XStack key={opt.value} gap="$2" alignItems="center">
              <RadioGroup.Item
                value={opt.value}
                size="$3"
                width={18}
                height={18}
                disabled={opt.disabled}
                backgroundColor="$surfaceCard"
                borderColor={isSelected ? '$brandGold' : '$outlineStrong'}
                borderWidth={1.5}
              >
                <RadioGroup.Indicator backgroundColor="$brandGold" />
              </RadioGroup.Item>
              <Text
                fontFamily="$body"
                fontSize={14}
                color={opt.disabled ? '$textMuted' : '$color'}
              >
                {opt.label}
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </RadioGroup>
  );
}

// ─── SegmentedControl ────────────────────────────────────────────────────────
export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  /** `pill` (default) — fully-rounded nav/filter style. `box` — rectangular form-field style. */
  variant?: 'pill' | 'box';
}

/**
 * Pill-segmented control. Used for sub-nav (e.g. era picker) and
 * AM/PM toggles in DateTimePicker.
 *
 * Exposed as a WAI-ARIA radio group (LS-10696): the active option is the
 * group's single tab stop (roving tabindex), Left/Right/Up/Down/Home/End move
 * focus and selection together, and Enter/Space activate the focused option.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  size = 'md',
  fullWidth = false,
  variant = 'pill',
}: SegmentedControlProps): React.JSX.Element {
  const isBox = variant === 'box';
  const padY = size === 'sm' ? 4 : isBox ? 7 : 6;
  const padX = size === 'sm' ? 10 : 14;
  const fontSize = size === 'sm' ? 12 : isBox ? 12 : 13;
  const containerRadius = isBox ? 6 : 9999;
  const itemRadius = isBox ? 4 : 9999;
  const letterSpacing = isBox ? 1 : 0.6;
  // When `value` matches no option, the first option keeps the group
  // reachable by Tab (a radio group with no tab stop is skipped entirely).
  const hasActive = options.some((opt) => opt.value === value);
  return (
    <XStack
      role="radiogroup"
      accessibilityRole="radiogroup"
      backgroundColor={isBox ? '$surfaceCard' : '$surfaceSubtle'}
      borderRadius={containerRadius}
      borderWidth={1}
      borderColor={isBox ? '$outlineStrong' : '$outlineSubtle'}
      padding={3}
      gap={2}
      alignSelf={fullWidth ? 'stretch' : 'flex-start'}
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        const isTabStop = active || (!hasActive && index === 0);
        const select = () => onValueChange(opt.value);
        return (
          <XStack
            key={opt.value}
            role="radio"
            accessibilityRole="radio"
            aria-checked={active}
            accessibilityState={{ checked: active }}
            tabIndex={isTabStop ? 0 : -1}
            paddingHorizontal={padX}
            paddingVertical={padY}
            borderRadius={itemRadius}
            backgroundColor={active ? '$brandNavy' : 'transparent'}
            cursor="pointer"
            onPress={select}
            onKeyDown={handleSegmentKeyDown(select)}
            hoverStyle={
              !active ? { backgroundColor: '$surfaceInteractive' } : undefined
            }
            focusVisibleStyle={{
              outlineWidth: 2,
              outlineColor: '$focusRing',
              outlineStyle: 'solid',
              outlineOffset: 1,
            }}
            animation="quick"
            flex={fullWidth ? 1 : undefined}
            justifyContent="center"
          >
            <Text
              fontFamily="$heading"
              fontSize={fontSize}
              fontWeight="700"
              letterSpacing={letterSpacing}
              color={active ? '$color12' : '$textMuted'}
              textTransform="uppercase"
            >
              {opt.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Radio-group keyboard handling for one SegmentedControl option (web only —
 * native never fires `onKeyDown`). Arrow/Home/End resolve the target among
 * the option's sibling radios in the DOM, then focus and click it so
 * selection runs through the same press path a pointer uses.
 */
const handleSegmentKeyDown =
  (select: () => void) => (e: React.KeyboardEvent<HTMLElement>) => {
    const { key } = e;
    if (key === 'Enter' || key === ' ') {
      handleKeyActivate(select)(e);
      return;
    }
    const isNext = NEXT_KEYS.has(key);
    const isPrev = PREV_KEYS.has(key);
    if (!isNext && !isPrev && key !== 'Home' && key !== 'End') return;
    const radios = Array.from(
      e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
        ':scope > [role="radio"]',
      ) ?? [],
    );
    const count = radios.length;
    if (count === 0) return;
    e.preventDefault();
    const current = radios.indexOf(e.currentTarget);
    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
          ? count - 1
          : (current + (isNext ? 1 : -1) + count) % count;
    const target = radios[nextIndex];
    if (target == null || target === e.currentTarget) return;
    target.focus();
    target.click();
  };

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
import { Check, Minus } from '@tamagui/lucide-icons';

// ─── Switch ──────────────────────────────────────────────────────────────────
export interface SwitchProps extends GetProps<typeof TamaguiSwitch> {
  label?: string;
}

/** Brand switch — relies on the parent theme for the on-color. */
export function Switch({ label, ...props }: SwitchProps): React.JSX.Element {
  const sw = (
    <TamaguiSwitch
      size="$3"
      backgroundColor="$surfaceCard"
      borderColor="$outlineStrong"
      borderWidth={1}
      {...props}
    >
      <TamaguiSwitch.Thumb animation="quick" backgroundColor="$brandGold" />
    </TamaguiSwitch>
  );
  if (!label) return sw;
  return (
    <XStack gap="$2" alignItems="center">
      {sw}
      <Text fontFamily="$body" fontSize={14} color="$color">
        {label}
      </Text>
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
  ...props
}: CheckboxProps): React.JSX.Element {
  const checkbox = (
    <TamaguiCheckbox
      size="$3"
      backgroundColor="$surfaceCard"
      borderColor="$outlineStrong"
      borderWidth={1}
      borderRadius={4}
      {...props}
    >
      <TamaguiCheckbox.Indicator>
        {indeterminate ? (
          <Minus size={14} color="white" />
        ) : (
          <Check size={14} color="white" />
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
  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
    >
      <YStack gap="$2">
        {options.map((opt) => (
          <XStack key={opt.value} gap="$2" alignItems="center">
            <RadioGroup.Item
              value={opt.value}
              size="$3"
              disabled={opt.disabled}
              backgroundColor="$surfaceCard"
              borderColor="$outlineStrong"
              borderWidth={1}
            >
              <RadioGroup.Indicator backgroundColor="$brandNavy" />
            </RadioGroup.Item>
            <Text
              fontFamily="$body"
              fontSize={14}
              color={opt.disabled ? '$textMuted' : '$color'}
            >
              {opt.label}
            </Text>
          </XStack>
        ))}
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
  return (
    <XStack
      backgroundColor={isBox ? '$surfacePanel' : '$surfaceSubtle'}
      borderRadius={containerRadius}
      borderWidth={1}
      borderColor={isBox ? '$outlineStrong' : '$outlineSubtle'}
      padding={3}
      gap={2}
      alignSelf={fullWidth ? 'stretch' : 'flex-start'}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <XStack
            key={opt.value}
            paddingHorizontal={padX}
            paddingVertical={padY}
            borderRadius={itemRadius}
            backgroundColor={active ? '$brandNavy' : 'transparent'}
            cursor="pointer"
            onPress={() => onValueChange(opt.value)}
            hoverStyle={
              !active ? { backgroundColor: '$surfaceInteractive' } : undefined
            }
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

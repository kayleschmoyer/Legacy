import React from 'react';
import {
  Adapt,
  Sheet,
  Select as TamaguiSelect,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { Chip, type ChipTone } from './Chip';
import { Popover } from './Popover';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Optional label rendered above the trigger. */
  label?: string;
  disabled?: boolean;
  /** Show a small leading dot indicator (used by era pickers). */
  leading?: React.ReactNode;
  /**
   * Accessible name for the trigger (the visible `label` is not associated
   * with it). A labelled trigger is also exposed as a `combobox` on every
   * platform: Tamagui only adds that role on pointer devices, so on touch
   * (where it adapts to a Sheet) the trigger would otherwise be a plain button.
   */
  'aria-label'?: string;
}

// The Tamagui media-query typing ('sm') is unavailable in this project, so the
// Adapt `when` prop rejects the string under the build TS program, while the
// lint TS program treats AdaptWhen as an error type (tripping no-unsafe-*).
// Casting through `unknown` to `never` is assignable to the prop under build
// and stays a clean (non-error) type under lint; keeping it in a helper (whose
// source is `unknown`) prevents eslint --fix from stripping the assertion.
const asAdaptWhen = (value: unknown): never => value as never;

/**
 * Single-select dropdown styled to match the brand input contract.
 * Uses the Tamagui Select primitive (which adapts to a Sheet on mobile).
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  label,
  disabled = false,
  leading,
  'aria-label': ariaLabel,
}: SelectProps): React.JSX.Element {
  return (
    <YStack gap="$1" minWidth={200}>
      {label ? (
        <Text
          fontFamily="$heading"
          fontSize={11}
          color="$textMuted"
          fontWeight="700"
          letterSpacing={1.2}
          textTransform="uppercase"
        >
          {label}
        </Text>
      ) : null}
      <TamaguiSelect
        value={value}
        onValueChange={onValueChange}
        disablePreventBodyScroll
      >
        <TamaguiSelect.Trigger
          aria-label={ariaLabel}
          role={ariaLabel ? 'combobox' : undefined}
          width="100%"
          borderRadius={6}
          borderWidth={1}
          borderColor="$outlineStrong"
          backgroundColor="$surfaceCard"
          paddingHorizontal={14}
          paddingVertical={11}
          disabled={disabled}
          opacity={disabled ? 0.5 : 1}
          iconAfter={<ChevronDown size={16} color="$textMuted" />}
          hoverStyle={{ borderColor: '$focusRing' }}
          focusStyle={{ borderColor: '$focusRing' }}
        >
          <XStack gap="$2" alignItems="center" flex={1}>
            {leading}
            <TamaguiSelect.Value placeholder={placeholder}>
              <Text fontFamily="$body" fontSize={15} color="$color">
                {options.find((o) => o.value === value)?.label ?? placeholder}
              </Text>
            </TamaguiSelect.Value>
          </XStack>
        </TamaguiSelect.Trigger>

        <Adapt when={asAdaptWhen('sm')} platform="touch">
          <Sheet modal dismissOnSnapToBottom snapPointsMode="fit">
            <Sheet.Frame>
              <Sheet.ScrollView>
                <Adapt.Contents />
              </Sheet.ScrollView>
            </Sheet.Frame>
            <Sheet.Overlay />
          </Sheet>
        </Adapt>

        <TamaguiSelect.Content zIndex={200000}>
          <TamaguiSelect.Viewport
            backgroundColor="$surfaceCard"
            borderRadius={8}
            borderWidth={1}
            borderColor="$outlineStrong"
            padding={6}
            minWidth={200}
            boxShadow="0 4px 14px rgba(8, 12, 20, 0.55)"
          >
            <TamaguiSelect.Group>
              {options.map((opt, i) => {
                const isSelected = opt.value === value;
                return (
                  <TamaguiSelect.Item
                    key={opt.value}
                    index={i}
                    value={opt.value}
                    disabled={opt.disabled}
                    borderRadius={6}
                    paddingVertical={9}
                    paddingHorizontal={12}
                    backgroundColor={isSelected ? '$brandNavy' : 'transparent'}
                    hoverStyle={{
                      backgroundColor: isSelected
                        ? '$brandNavy'
                        : '$backgroundHover',
                    }}
                  >
                    <TamaguiSelect.ItemText>
                      <Text
                        fontFamily="$body"
                        fontSize={14}
                        color={isSelected ? '$textOnAccent' : '$color11'}
                      >
                        {opt.label}
                      </Text>
                    </TamaguiSelect.ItemText>
                    <TamaguiSelect.ItemIndicator marginLeft="auto">
                      <Check size={14} color="$textOnAccent" />
                    </TamaguiSelect.ItemIndicator>
                  </TamaguiSelect.Item>
                );
              })}
            </TamaguiSelect.Group>
          </TamaguiSelect.Viewport>
        </TamaguiSelect.Content>
      </TamaguiSelect>
    </YStack>
  );
}

export interface MultiSelectOption extends SelectOption {
  /** Chip tone for the selected pill (e.g. a position color). Defaults to `navy`. */
  tone?: ChipTone;
}

export interface MultiSelectProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  options: MultiSelectOption[];
  /** Optional label rendered above the chip row. */
  label?: string;
  /** Text on the dashed "add" affordance. Defaults to `+ Add`. */
  addLabel?: string;
  disabled?: boolean;
}

/**
 * Multi-select chip picker — selected options render as removable chips;
 * a dashed "+ Add" chip opens a popover checklist of the remaining options.
 */
export function MultiSelect({
  value,
  onValueChange,
  options,
  label,
  addLabel = '+ Add',
  disabled = false,
}: MultiSelectProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((opt) => value.includes(opt.value));

  const toggle = (optValue: string): void => {
    if (value.includes(optValue)) {
      onValueChange(value.filter((v) => v !== optValue));
    } else {
      onValueChange([...value, optValue]);
    }
  };

  return (
    <YStack gap="$1">
      {label ? (
        <Text
          fontFamily="$heading"
          fontSize={11}
          color="$textMuted"
          fontWeight="700"
          letterSpacing={1.2}
          textTransform="uppercase"
        >
          {label}
        </Text>
      ) : null}
      <XStack gap={6} flexWrap="wrap" alignItems="center">
        {selected.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            tone={opt.tone ?? 'navy'}
            trailing={
              disabled ? undefined : (
                <Text
                  fontSize={11}
                  fontWeight="700"
                  color="$color12"
                  onPress={() => toggle(opt.value)}
                  cursor="pointer"
                  role="button"
                  aria-label={`Remove ${opt.label}`}
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(opt.value);
                    }
                  }}
                >
                  ×
                </Text>
              )
            }
          />
        ))}
        {!disabled && (
          <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={
              <XStack
                borderWidth={1}
                borderStyle="dashed"
                borderColor="$outlineStrong"
                borderRadius={9999}
                paddingHorizontal={10}
                paddingVertical={5}
                cursor="pointer"
                role="button"
                tabIndex={0}
                aria-label={addLabel}
                onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(true);
                  }
                }}
              >
                <Text
                  fontFamily="$heading"
                  fontSize={11}
                  fontWeight="700"
                  letterSpacing={0.8}
                  textTransform="uppercase"
                  color="$textMuted"
                >
                  {addLabel}
                </Text>
              </XStack>
            }
          >
            <YStack gap={2} minWidth={180}>
              {options.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <XStack
                    key={opt.value}
                    onPress={() => !opt.disabled && toggle(opt.value)}
                    paddingVertical={9}
                    paddingHorizontal={12}
                    borderRadius={6}
                    justifyContent="space-between"
                    alignItems="center"
                    backgroundColor={isSelected ? '$brandNavy' : 'transparent'}
                    hoverStyle={
                      opt.disabled
                        ? undefined
                        : {
                            backgroundColor: isSelected
                              ? '$brandNavy'
                              : '$backgroundHover',
                          }
                    }
                    opacity={opt.disabled ? 0.5 : 1}
                    cursor={opt.disabled ? 'not-allowed' : 'pointer'}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    tabIndex={opt.disabled ? undefined : 0}
                    onKeyDown={
                      opt.disabled
                        ? undefined
                        : (e: React.KeyboardEvent<HTMLElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggle(opt.value);
                            }
                          }
                    }
                  >
                    <Text
                      fontFamily="$body"
                      fontSize={14}
                      color={isSelected ? '$textOnAccent' : '$color11'}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && <Check size={14} color="$textOnAccent" />}
                  </XStack>
                );
              })}
            </YStack>
          </Popover>
        )}
      </XStack>
    </YStack>
  );
}

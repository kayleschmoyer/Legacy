import React from 'react';
import {
  Adapt,
  Sheet,
  Select as TamaguiSelect,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check, ChevronDown } from '@tamagui/lucide-icons';

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
}

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

        <Adapt when={'sm' as never} platform="touch">
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

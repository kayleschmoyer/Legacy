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
          fontFamily="$body"
          fontSize={12}
          color="$textMuted"
          fontWeight="600"
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
          height={40}
          borderRadius={6}
          borderWidth={1}
          borderColor="$outlineStrong"
          backgroundColor="$surfacePanel"
          paddingHorizontal={12}
          disabled={disabled}
          opacity={disabled ? 0.6 : 1}
          iconAfter={<ChevronDown size={16} color="$textMuted" />}
          hoverStyle={{ borderColor: '$brandNavyLight' }}
          focusStyle={{ borderColor: '$brandNavyLight' }}
        >
          <XStack gap="$2" alignItems="center" flex={1}>
            {leading}
            <TamaguiSelect.Value placeholder={placeholder}>
              <Text fontFamily="$body" fontSize={14} color="$color">
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
            borderRadius={12}
            borderWidth={1}
            borderColor="$glassBorder"
            padding={4}
            minWidth={200}
          >
            <TamaguiSelect.Group>
              {options.map((opt, i) => (
                <TamaguiSelect.Item
                  key={opt.value}
                  index={i}
                  value={opt.value}
                  disabled={opt.disabled}
                  borderRadius={8}
                  paddingVertical={8}
                  paddingHorizontal={10}
                  hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
                >
                  <TamaguiSelect.ItemText>
                    <Text fontFamily="$body" fontSize={14} color="$color">
                      {opt.label}
                    </Text>
                  </TamaguiSelect.ItemText>
                  <TamaguiSelect.ItemIndicator marginLeft="auto">
                    <Check size={14} color="$brandGold" />
                  </TamaguiSelect.ItemIndicator>
                </TamaguiSelect.Item>
              ))}
            </TamaguiSelect.Group>
          </TamaguiSelect.Viewport>
        </TamaguiSelect.Content>
      </TamaguiSelect>
    </YStack>
  );
}

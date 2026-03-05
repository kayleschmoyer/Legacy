import React from 'react';
import { Select } from 'tamagui';

export interface DropdownItem {
  text: string;
  value: string;
}

export interface DropdownProperties {
  value: string;
  onChange: (value: string) => void;
  items: readonly Readonly<DropdownItem>[];
  disabled?: boolean;
  placeholder?: string;
  /** Accessible label for the select element (required for a11y when no visible label is present) */
  'aria-label'?: string;
}

/**
 * Dropdown  cross-platform select component built on Tamagui's Select.
 *
 * Replaces the legacy HTML <select>-based implementation with a Tamagui
 * component that renders consistently on both web and React Native.
 */
export function Dropdown({
  value,
  onChange,
  items,
  disabled = false,
  placeholder = 'Select an option...',
}: DropdownProperties): React.JSX.Element {
  return (
    <Select value={value} onValueChange={disabled ? undefined : onChange}>
      <Select.Trigger disabled={disabled} opacity={disabled ? 0.5 : 1}>
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>

      <Select.Content>
        <Select.ScrollUpButton />
        <Select.Viewport>
          {items.map((item, i) => (
            <Select.Item key={item.value} index={i} value={item.value}>
              <Select.ItemText>{item.text}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
        <Select.ScrollDownButton />
      </Select.Content>
    </Select>
  );
}

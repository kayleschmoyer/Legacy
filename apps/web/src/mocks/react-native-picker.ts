import React from 'react';

// Web-compatible Picker implementation
interface PickerProps {
  selectedValue?: string | number;
  onValueChange?: (value: string | number, index: number) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

interface PickerItemProps {
  label: string;
  value: string | number;
  color?: string;
  testID?: string;
}

export const Picker: React.FC<PickerProps> & {
  Item: React.FC<PickerItemProps>;
} = ({ selectedValue, onValueChange, style, children }) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const index = event.target.selectedIndex;
    if (onValueChange) {
      // Try to parse as number if possible, otherwise keep as string
      const parsedValue = isNaN(Number(value)) ? value : Number(value);
      onValueChange(parsedValue, index);
    }
  };

  return React.createElement('select', {
    value: selectedValue,
    onChange: handleChange,
    style: {
      padding: '8px',
      borderRadius: '4px',
      border: '1px solid #ccc',
      fontSize: '16px',
      backgroundColor: 'white',
      ...style,
    },
    children,
  });
};

// Picker.Item component
const PickerItem: React.FC<PickerItemProps> = ({
  label,
  value,
  color,
  testID,
}) =>
  React.createElement('option', {
    value,
    style: { color },
    'data-testid': testID,
    children: label,
  });

Picker.Item = PickerItem;

// Default export for compatibility
export default Picker;

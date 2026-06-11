import React from 'react';
import { DatePickerProps } from '../DatePicker';

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
}: DatePickerProps) {
  return (
    <input
      type="date"
      data-testid="date-picker-input"
      placeholder={placeholder ?? 'Select date'}
      value={value ? value.toISOString().split('T')[0] : ''}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) {
          const parsed = new Date(e.target.value);
          if (!isNaN(parsed.getTime())) {
            onChange(parsed);
          }
        }
      }}
    />
  );
}

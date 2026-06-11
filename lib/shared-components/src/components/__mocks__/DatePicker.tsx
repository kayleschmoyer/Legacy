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
        const { value } = e.target;
        // Only forward values that match YYYY-MM-DD — the same constraint a
        // real <input type="date"> enforces in browsers.
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const parsed = new Date(value);
          if (!isNaN(parsed.getTime())) {
            onChange(parsed);
          }
        }
      }}
    />
  );
}

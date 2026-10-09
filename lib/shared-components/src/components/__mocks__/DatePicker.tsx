import React from 'react';
import { DatePickerProps } from '../DatePicker';
import {
  parseLocalDateInput,
  toLocalDateInput,
} from '../../utils/DateUtilities';

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
      value={value ? toLocalDateInput(value) : ''}
      disabled={disabled}
      onChange={(e) => {
        const { value } = e.target;
        // Only forward values that match YYYY-MM-DD — the same constraint a
        // real <input type="date"> enforces in browsers.
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const parsed = parseLocalDateInput(value);
          if (parsed) {
            onChange(parsed);
          }
        }
      }}
    />
  );
}

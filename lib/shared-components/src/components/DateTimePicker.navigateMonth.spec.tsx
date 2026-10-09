import React from 'react';
import { DateTimePicker } from './DateTimePicker';
import { fireEvent, render, screen } from '../test-utils';

describe('DateTimePicker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    // [system date, expected month after clicking "prev", label]
    [
      new Date(2026, 6, 31),
      'June 2026',
      'day-of-month overflow (Jul 31 -> Jun 30)',
    ],
    [
      new Date(2026, 2, 31),
      'February 2026',
      'day-of-month overflow (Mar 31 -> Feb 28)',
    ],
    [
      new Date(2026, 4, 31),
      'April 2026',
      'day-of-month overflow (May 31 -> Apr 30)',
    ],
  ])(
    'navigates to the previous month even with %s (%s)',
    (systemDate, expectedMonthLabel) => {
      jest.useFakeTimers();
      jest.setSystemTime(systemDate);

      render(<DateTimePicker onChange={jest.fn()} useNativeInput={false} />);

      fireEvent.click(screen.getByTestId('date-time-picker-trigger'));
      fireEvent.click(screen.getByTestId('date-time-picker-prev-month'));

      expect(screen.getByText(expectedMonthLabel)).toBeTruthy();
    },
  );

  it('navigates to the next month even when day-of-month would overflow', () => {
    jest.useFakeTimers();
    // Jan 31 -> next month (Feb) has only 28 days in 2026.
    jest.setSystemTime(new Date(2026, 0, 31));

    render(<DateTimePicker onChange={jest.fn()} useNativeInput={false} />);

    fireEvent.click(screen.getByTestId('date-time-picker-trigger'));
    fireEvent.click(screen.getByTestId('date-time-picker-next-month'));

    expect(screen.getByText('February 2026')).toBeTruthy();
  });
});

describe('DateTimePicker day testIDs (LS-10486)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    jest.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each(['Asia/Kolkata', 'America/Los_Angeles'])(
    'keys each day cell by its local calendar date under TZ=%s',
    (zone) => {
      process.env.TZ = zone;
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 9, 8, 12));

      render(<DateTimePicker onChange={jest.fn()} useNativeInput={false} />);
      fireEvent.click(screen.getByTestId('date-time-picker-trigger'));

      expect(
        screen.getByTestId('date-time-picker-day-2026-10-08'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('date-time-picker-day-2026-10-01'),
      ).toBeTruthy();
    },
  );
});

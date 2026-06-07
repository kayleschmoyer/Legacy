import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScoreboardDateNav } from './ScoreboardDateNav';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockTodayISO = jest.fn(() => '2024-06-15');
const mockOffsetDate = jest.fn(
  (iso: string, days: number) => `OFFSET(${iso},${days})`,
);

jest.mock('@legacy-sports/shared-components', () => ({
  todayISO: () => mockTodayISO(),
  offsetDate: (iso: string, days: number) => mockOffsetDate(iso, days),
}));

jest.mock('tamagui', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  function MockStack({
    children,
    onPress,
    testID,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
    disabled?: boolean;
    [key: string]: unknown;
  }) {
    if (onPress) {
      return createElement(
        Pressable,
        { onPress: disabled ? undefined : onPress, testID, disabled },
        children,
      );
    }
    return createElement(View, { testID }, children);
  }
  return {
    Text: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => createElement(Text, rest, children),
    XStack: MockStack,
    YStack: MockStack,
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScoreboardDateNav', () => {
  const onChange = jest.fn();

  beforeEach(() => {
    onChange.mockClear();
    mockTodayISO.mockReturnValue('2024-06-15');
    // Reset offsetDate to a real-ish implementation for most tests
    mockOffsetDate.mockImplementation((iso: string, days: number) => {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d + days);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    });
  });

  it('renders date nav with prev and next arrows', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    expect(screen.getByTestId('scoreboard-date-prev')).toBeTruthy();
    expect(screen.getByTestId('scoreboard-date-next')).toBeTruthy();
    expect(screen.getByTestId('scoreboard-date-trigger')).toBeTruthy();
  });

  it('disables the next arrow when date equals today', () => {
    render(<ScoreboardDateNav date="2024-06-15" onChange={onChange} />);
    const nextBtn = screen.getByTestId('scoreboard-date-next');
    fireEvent.press(nextBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the next arrow when date is after today', () => {
    render(<ScoreboardDateNav date="2024-06-16" onChange={onChange} />);
    const nextBtn = screen.getByTestId('scoreboard-date-next');
    fireEvent.press(nextBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('enables the next arrow when date is before today', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    const nextBtn = screen.getByTestId('scoreboard-date-next');
    fireEvent.press(nextBtn);
    expect(onChange).toHaveBeenCalledWith('2024-06-11');
  });

  it('calls onChange with the previous day when prev is pressed', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    const prevBtn = screen.getByTestId('scoreboard-date-prev');
    fireEvent.press(prevBtn);
    expect(onChange).toHaveBeenCalledWith('2024-06-09');
  });

  it('opens the calendar modal when the date pill is pressed', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    expect(screen.queryByTestId('scoreboard-date-calendar')).toBeNull();
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByTestId('scoreboard-date-calendar')).toBeTruthy();
  });

  it('shows the correct month and year heading in the calendar', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByText('June 2024')).toBeTruthy();
  });

  it('renders day cells for June 2024', () => {
    render(<ScoreboardDateNav date="2024-06-01" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    // June 2024 has 30 days; day 1 should be present
    expect(screen.getByTestId('scoreboard-date-day-2024-06-01')).toBeTruthy();
    expect(screen.getByTestId('scoreboard-date-day-2024-06-30')).toBeTruthy();
  });

  it('disables future days beyond maxDate (today)', () => {
    // date = today so maxDate = 2024-06-15; days 16-30 should be disabled
    render(<ScoreboardDateNav date="2024-06-15" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    const futureDay = screen.getByTestId('scoreboard-date-day-2024-06-16');
    fireEvent.press(futureDay);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange and closes modal when a past day is selected', () => {
    render(<ScoreboardDateNav date="2024-06-15" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    fireEvent.press(screen.getByTestId('scoreboard-date-day-2024-06-10'));
    expect(onChange).toHaveBeenCalledWith('2024-06-10');
    expect(screen.queryByTestId('scoreboard-date-calendar')).toBeNull();
  });

  it('navigates to the previous month', () => {
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByText('June 2024')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scoreboard-month-prev'));
    expect(screen.getByText('May 2024')).toBeTruthy();
  });

  it('navigates to the next month', () => {
    // Use a past month so next-month is not blocked
    mockTodayISO.mockReturnValue('2024-08-01');
    render(<ScoreboardDateNav date="2024-06-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByText('June 2024')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scoreboard-month-next'));
    expect(screen.getByText('July 2024')).toBeTruthy();
  });

  it('wraps month navigation across year boundaries (Dec -> Jan)', () => {
    mockTodayISO.mockReturnValue('2025-03-01');
    render(<ScoreboardDateNav date="2024-12-15" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByText('December 2024')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scoreboard-month-next'));
    expect(screen.getByText('January 2025')).toBeTruthy();
  });

  it('wraps month navigation across year boundaries (Jan -> Dec)', () => {
    render(<ScoreboardDateNav date="2024-01-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('scoreboard-date-trigger'));
    expect(screen.getByText('January 2024')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scoreboard-month-prev'));
    expect(screen.getByText('December 2023')).toBeTruthy();
  });
});

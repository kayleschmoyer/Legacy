/**
 * LS-10456 — the web scoreboard date picker allows browsing future dates (to
 * preview upcoming slates), bounded by how far ahead the schedule feed
 * publishes. A date typed past that bound is clamped with a visible notice
 * rather than silently reset to today.
 *
 * LS-10649 — dates before MLB's first season are clamped to the minimum with
 * an "available from" notice, and never queried.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DateNav } from './Scoreboard';

const TODAY = '2026-10-04';
const MAX_DATE = '2027-10-04';
const MIN_DATE = '1876-01-01';

jest.mock('@legacy-sports/graphql', () => ({
  useGetScoreboardQuery: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/scoreboard', () => ({
  todayISO: () => '2026-10-04',
  maxScoreboardDateISO: () => '2027-10-04',
  formatDisplayDate: (iso: string) => `DISPLAY(${iso})`,
  SCOREBOARD_MIN_DATE_ISO: '1876-01-01',
  offsetDate: (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(2000, 0, 1);
    dt.setFullYear(y, m - 1, d + days);
    return `${String(dt.getFullYear()).padStart(4, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  },
  partitionScoreboardGames: jest.fn(),
  useScoreboardLivePolling: jest.fn(),
  ScoreboardContainer: () => null,
}));

jest.mock('tamagui', () => {
  const Passthrough = ({
    children,
    testID,
    role,
  }: {
    children?: React.ReactNode;
    testID?: string;
    role?: string;
  }) => (
    <div data-testid={testID} role={role}>
      {children}
    </div>
  );
  return { Text: Passthrough, XStack: Passthrough, YStack: Passthrough };
});

function renderNav(date: string) {
  const onChange = jest.fn();
  render(<DateNav date={date} onChange={onChange} />);
  return onChange;
}

describe('Scoreboard DateNav (web)', () => {
  it('lets the picker select dates after today, up to the schedule bound', () => {
    renderNav(TODAY);
    expect(screen.getByTestId('scoreboard-date-picker')).toHaveAttribute(
      'max',
      MAX_DATE,
    );
  });

  it('enables Next on today and advances to tomorrow', () => {
    const onChange = renderNav(TODAY);
    const next = screen.getByRole('button', { name: 'Next day' });
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledWith('2026-10-05');
  });

  it('accepts a future date typed into the picker as-is', () => {
    const onChange = renderNav(TODAY);
    fireEvent.change(screen.getByTestId('scoreboard-date-picker'), {
      target: { value: '2027-04-01' },
    });
    expect(onChange).toHaveBeenCalledWith('2027-04-01');
    expect(screen.queryByTestId('scoreboard-date-clamped')).toBeNull();
  });

  it('clamps a date past the bound to the bound and says so (not today)', () => {
    const onChange = renderNav(TODAY);
    fireEvent.change(screen.getByTestId('scoreboard-date-picker'), {
      target: { value: '2028-01-01' },
    });
    expect(onChange).toHaveBeenCalledWith(MAX_DATE);
    expect(onChange).not.toHaveBeenCalledWith(TODAY);
    expect(screen.getByTestId('scoreboard-date-clamped')).toHaveTextContent(
      `Schedules are only available through DISPLAY(${MAX_DATE}).`,
    );
  });

  it('clears the clamp notice once the user picks another date', () => {
    renderNav(TODAY);
    const picker = screen.getByTestId('scoreboard-date-picker');
    fireEvent.change(picker, { target: { value: '2028-01-01' } });
    expect(screen.getByTestId('scoreboard-date-clamped')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.queryByTestId('scoreboard-date-clamped')).toBeNull();
  });

  it('disables Next on the last selectable date', () => {
    const onChange = renderNav(MAX_DATE);
    const next = screen.getByRole('button', { name: 'Next day' });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bounds the picker below at the first MLB season', () => {
    renderNav(TODAY);
    expect(screen.getByTestId('scoreboard-date-picker')).toHaveAttribute(
      'min',
      MIN_DATE,
    );
  });

  it('holds a date typed before the minimum without selecting it, then clamps on blur', () => {
    const onChange = renderNav(TODAY);
    const picker = screen.getByTestId('scoreboard-date-picker');
    fireEvent.change(picker, { target: { value: '0001-01-01' } });
    // No request for the out-of-range date — the parent is never told about it.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('scoreboard-date-clamped')).toHaveTextContent(
      `Scores are only available from DISPLAY(${MIN_DATE}).`,
    );
    fireEvent.blur(picker);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(MIN_DATE);
  });

  it('does not clamp the partial years Chrome emits while a year is typed', () => {
    const onChange = renderNav(TODAY);
    const picker = screen.getByTestId('scoreboard-date-picker');
    for (const value of ['0002-10-04', '0020-10-04', '0202-10-04']) {
      fireEvent.change(picker, { target: { value } });
    }
    fireEvent.change(picker, { target: { value: '2024-10-04' } });
    fireEvent.blur(picker);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2024-10-04');
    expect(screen.queryByTestId('scoreboard-date-clamped')).toBeNull();
  });

  it('disables Previous on the first selectable date', () => {
    const onChange = renderNav(MIN_DATE);
    const prev = screen.getByRole('button', { name: 'Previous day' });
    expect(prev).toBeDisabled();
    fireEvent.click(prev);
    expect(onChange).not.toHaveBeenCalled();
  });
});

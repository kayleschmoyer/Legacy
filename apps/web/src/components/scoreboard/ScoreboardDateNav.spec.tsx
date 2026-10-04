/**
 * LS-10456 — the web scoreboard date picker allows browsing future dates (to
 * preview upcoming slates), bounded by how far ahead the schedule feed
 * publishes. A date typed past that bound is clamped with a visible notice
 * rather than silently reset to today.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DateNav } from './Scoreboard';

const TODAY = '2026-10-04';
const MAX_DATE = '2027-10-04';

jest.mock('@legacy-sports/graphql', () => ({
  useGetScoreboardQuery: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/scoreboard', () => ({
  todayISO: () => '2026-10-04',
  maxScoreboardDateISO: () => '2027-10-04',
  formatDisplayDate: (iso: string) => `DISPLAY(${iso})`,
  offsetDate: (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
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
});

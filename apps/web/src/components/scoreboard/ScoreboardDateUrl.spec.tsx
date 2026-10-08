/**
 * LS-10648 — the selected scoreboard date lives in the URL (`?date=`) so a
 * reload keeps it, Back/Forward step through previously viewed dates, and a
 * dated link can be shared. Today is omitted from the URL, and an invalid or
 * out-of-range `?date=` falls back to today.
 *
 * Lives beside (not inside) Scoreboard.spec.tsx because rendering
 * `<Scoreboard />` needs module-level mocks of tamagui and the shared
 * scoreboard package that the pure `partitionScoreboardGames` tests there
 * must not inherit.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useGetScoreboardQuery } from '@legacy-sports/graphql';

import { resolveScoreboardDateParam, Scoreboard } from './Scoreboard';

jest.mock('@legacy-sports/graphql', () => ({
  useGetScoreboardQuery: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/scoreboard', () => ({
  todayISO: () => '2026-10-06',
  maxScoreboardDateISO: () => '2027-10-06',
  formatDisplayDate: (iso: string) => `DISPLAY(${iso})`,
  offsetDate: (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  },
  partitionScoreboardGames: jest.fn(),
  useScoreboardLivePolling: jest.fn(),
  ScoreboardContainer: ({
    date,
    dateNav,
  }: {
    date: string;
    dateNav: React.ReactNode;
  }) => (
    <div>
      <span data-testid="scoreboard-date">{date}</span>
      {dateNav}
    </div>
  ),
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

const mockedQuery = useGetScoreboardQuery as jest.Mock;

let navigate: ReturnType<typeof useNavigate>;

function LocationProbe() {
  const location = useLocation();
  navigate = useNavigate();
  return (
    <>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="location">{location.search}</span>
    </>
  );
}

function renderAt(url: string, previous?: string) {
  render(
    <MemoryRouter
      initialEntries={previous ? [previous, url] : [url]}
      initialIndex={previous ? 1 : 0}
    >
      <Scoreboard />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const shownDate = () => screen.getByTestId('scoreboard-date').textContent;
const search = () => screen.getByTestId('location').textContent;
const queriedDate = (): string => {
  const [options] = mockedQuery.mock.lastCall as [
    { variables: { date: string } },
  ];
  return options.variables.date;
};

beforeEach(() => {
  mockedQuery.mockReset();
  mockedQuery.mockReturnValue({
    data: undefined,
    loading: true,
    error: undefined,
    startPolling: jest.fn(),
    stopPolling: jest.fn(),
  });
});

describe('Scoreboard date in the URL (LS-10648)', () => {
  it('opens today with a clean URL when no ?date= is present', () => {
    renderAt('/scoreboard');
    expect(shownDate()).toBe('2026-10-06');
    expect(search()).toBe('');
  });

  it('restores the date from ?date= on load (reload / shared link)', () => {
    renderAt('/scoreboard?date=2026-10-03');
    expect(shownDate()).toBe('2026-10-03');
    expect(queriedDate()).toBe('2026-10-03');
    expect(screen.getByTestId('scoreboard-date-picker')).toHaveValue(
      '2026-10-03',
    );
  });

  it('writes the selected date to ?date= when the date changes', () => {
    renderAt('/scoreboard');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(search()).toBe('?date=2026-10-05');
    expect(shownDate()).toBe('2026-10-05');

    fireEvent.change(screen.getByTestId('scoreboard-date-picker'), {
      target: { value: '2026-10-03' },
    });
    expect(search()).toBe('?date=2026-10-03');
    expect(queriedDate()).toBe('2026-10-03');
  });

  it('drops ?date= when navigating back to today', () => {
    renderAt('/scoreboard?date=2026-10-05');
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(search()).toBe('');
    expect(shownDate()).toBe('2026-10-06');
  });

  it('preserves unrelated search params', () => {
    renderAt('/scoreboard?ref=ticker');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    const params = new URLSearchParams(search() ?? '');
    expect(params.get('ref')).toBe('ticker');
    expect(params.get('date')).toBe('2026-10-05');
  });

  it('steps Back to the previously viewed date and Forward re-applies it', () => {
    renderAt('/scoreboard');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(shownDate()).toBe('2026-10-04');

    act(() => navigate(-1));
    expect(shownDate()).toBe('2026-10-05');
    act(() => navigate(-1));
    expect(shownDate()).toBe('2026-10-06');
    expect(search()).toBe('');

    act(() => navigate(1));
    expect(shownDate()).toBe('2026-10-05');
    expect(search()).toBe('?date=2026-10-05');
  });

  it('does not add a history entry when the date is unchanged', () => {
    renderAt('/scoreboard?date=2027-10-06', '/dashboard');
    // Typing past the bound clamps to the bound — the date already shown.
    fireEvent.change(screen.getByTestId('scoreboard-date-picker'), {
      target: { value: '2028-01-01' },
    });
    expect(shownDate()).toBe('2027-10-06');
    // One Back step leaves the page: no duplicate entry was pushed.
    act(() => navigate(-1));
    expect(screen.getByTestId('pathname').textContent).toBe('/dashboard');
  });

  it.each([
    ['malformed', 'banana'],
    ['wrong shape', '2026-1-3'],
    ['impossible calendar date', '2026-02-30'],
    ['past the schedule bound', '2027-10-07'],
    ['empty', ''],
  ])('falls back to today for a %s ?date=', (_label, value) => {
    renderAt(`/scoreboard?date=${value}`);
    expect(shownDate()).toBe('2026-10-06');
    expect(queriedDate()).toBe('2026-10-06');
  });
});

describe('resolveScoreboardDateParam', () => {
  it('accepts valid dates up to and including the schedule bound', () => {
    expect(resolveScoreboardDateParam('2026-10-03')).toBe('2026-10-03');
    expect(resolveScoreboardDateParam('2027-10-06')).toBe('2027-10-06');
  });

  it('returns today for a missing param', () => {
    expect(resolveScoreboardDateParam(null)).toBe('2026-10-06');
  });
});

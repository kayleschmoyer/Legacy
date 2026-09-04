import React from 'react';
import {
  DraftCountdown,
  formatCountdown,
  formatLobbySummary,
  formatOpeningDay,
  OpeningDayBanner,
} from './OpeningDayBanner';
import { act, render } from '../../test-utils';

describe('formatCountdown (LS-9858)', () => {
  it('renders days alongside the clock when a day or more remains', () => {
    // 2d 14:32:06 — the mock's sample value.
    const ms = 2 * 86_400_000 + 14 * 3_600_000 + 32 * 60_000 + 6 * 1000;
    expect(formatCountdown(ms)).toBe('2d 14:32:06');
  });

  it('drops the day segment below 24 hours and zero-pads each field', () => {
    expect(formatCountdown(3_600_000 + 2 * 60_000 + 5 * 1000)).toBe('01:02:05');
  });

  it('returns null at and past zero so the clock can stop', () => {
    expect(formatCountdown(0)).toBeNull();
    expect(formatCountdown(-1)).toBeNull();
    expect(formatCountdown(Number.NaN)).toBeNull();
  });
});

describe('formatOpeningDay (LS-9858)', () => {
  it('includes a timezone abbreviation so the time is never ambiguous', () => {
    const formatted = formatOpeningDay('2026-04-24T20:00:00-04:00');
    expect(formatted).not.toBeNull();
    // Rendered in the *runner's* local zone, so assert the shape rather than
    // a fixed zone: "<day> · <time> <ZONE>". The mock's hardcoded "ET" is
    // exactly what this must not do.
    expect(formatted).toMatch(/ · .*\d{2} (AM|PM) \S+$/);
  });

  it('returns null for an unparseable timestamp rather than "Invalid Date"', () => {
    expect(formatOpeningDay('not-a-date')).toBeNull();
  });
});

describe('formatLobbySummary (LS-9858)', () => {
  it('pairs the manager count with the round count', () => {
    expect(formatLobbySummary(12, 23)).toBe(
      '12 managers locked in · 23 rounds',
    );
  });

  it('singularizes both clauses', () => {
    expect(formatLobbySummary(1, 1)).toBe('1 manager locked in · 1 round');
  });

  it('omits the round clause when the league has no roster size on file', () => {
    expect(formatLobbySummary(8, null)).toBe('8 managers locked in');
    expect(formatLobbySummary(8, 0)).toBe('8 managers locked in');
  });
});

describe('DraftCountdown ticking (LS-9858)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ticks down once a second', () => {
    const target = Date.now() + 5000;
    const { getByText } = render(<DraftCountdown targetMs={target} />);
    expect(getByText('00:00:05')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByText('00:00:03')).toBeTruthy();
  });

  it('stops cleanly at zero and clears its interval', () => {
    const target = Date.now() + 2000;
    const { getByText } = render(<DraftCountdown targetMs={target} />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByText('Starting now')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('mounts already-stopped for a start time in the past', () => {
    const { getByText } = render(
      <DraftCountdown targetMs={Date.now() - 60_000} />,
    );
    expect(getByText('Starting now')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('OpeningDayBanner (LS-9858)', () => {
  it('renders the Opening Day block with the summary line', () => {
    const target = new Date(Date.now() + 90_000).toISOString();
    const { getByText } = render(
      <OpeningDayBanner
        scheduledAt={target}
        managerCount={12}
        roundCount={23}
      />,
    );
    expect(getByText('Opening Day')).toBeTruthy();
    expect(getByText('12 managers locked in · 23 rounds')).toBeTruthy();
  });

  it('renders nothing for an unparseable timestamp', () => {
    const { queryByText } = render(
      <OpeningDayBanner scheduledAt="nope" managerCount={12} roundCount={23} />,
    );
    expect(queryByText('Opening Day')).toBeNull();
  });
});

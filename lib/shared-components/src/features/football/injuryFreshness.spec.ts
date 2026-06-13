/**
 * Tests for formatInjuryFreshness (LS-6251 / FPD-027).
 */
import {
  formatInjuryFreshness,
  INJURY_STALE_THRESHOLD_MS,
} from './injuryFreshness';

const NOW = Date.parse('2026-06-11T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('formatInjuryFreshness', () => {
  it('returns null for null / undefined / empty input', () => {
    expect(formatInjuryFreshness(null, NOW)).toBeNull();
    expect(formatInjuryFreshness(undefined, NOW)).toBeNull();
    expect(formatInjuryFreshness('', NOW)).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(formatInjuryFreshness('not-a-date', NOW)).toBeNull();
  });

  it('renders "just now" when synced less than a minute ago', () => {
    expect(formatInjuryFreshness(isoAgo(30 * 1000), NOW)).toEqual({
      label: 'Last updated: just now',
      isStale: false,
    });
  });

  it('renders minutes when fresh (matches ticket example)', () => {
    expect(formatInjuryFreshness(isoAgo(6 * 60 * 1000), NOW)).toEqual({
      label: 'Last updated: 6 min ago',
      isStale: false,
    });
  });

  it('treats just under one hour as still fresh', () => {
    const justUnder = INJURY_STALE_THRESHOLD_MS - 1;
    expect(formatInjuryFreshness(isoAgo(justUnder), NOW)).toEqual({
      label: 'Last updated: 59 min ago',
      isStale: false,
    });
  });

  it('flips to stale at exactly the one-hour threshold', () => {
    expect(
      formatInjuryFreshness(isoAgo(INJURY_STALE_THRESHOLD_MS), NOW),
    ).toEqual({
      label: 'Stale (1 hour old)',
      isStale: true,
    });
  });

  it('renders stale hours (matches ticket example)', () => {
    expect(formatInjuryFreshness(isoAgo(12 * 60 * 60 * 1000), NOW)).toEqual({
      label: 'Stale (12 hours old)',
      isStale: true,
    });
  });

  it('renders stale days once a day old, with singular/plural', () => {
    expect(formatInjuryFreshness(isoAgo(24 * 60 * 60 * 1000), NOW)).toEqual({
      label: 'Stale (1 day old)',
      isStale: true,
    });
    expect(formatInjuryFreshness(isoAgo(50 * 60 * 60 * 1000), NOW)).toEqual({
      label: 'Stale (2 days old)',
      isStale: true,
    });
  });

  it('clamps future timestamps (clock skew) to "just now"', () => {
    expect(formatInjuryFreshness(isoAgo(-5 * 60 * 1000), NOW)).toEqual({
      label: 'Last updated: just now',
      isStale: false,
    });
  });
});

import { getSessionStatus } from './sessionStatus';

const NOW = 1_700_000_000_000;
const secondsFromNow = (s: number) => Math.floor(NOW / 1000) + s;

describe('getSessionStatus', () => {
  it('reports active with no hint when expiry is unknown', () => {
    expect(getSessionStatus(null, NOW)).toEqual({
      state: 'active',
      label: 'Active',
      expiryHint: null,
    });
  });

  it('reports active with minutes remaining', () => {
    expect(getSessionStatus(secondsFromNow(42 * 60), NOW)).toEqual({
      state: 'active',
      label: 'Active',
      expiryHint: 'Expires in 42m',
    });
  });

  it('rounds sub-minute remainders up to 1m', () => {
    expect(getSessionStatus(secondsFromNow(20), NOW).expiryHint).toBe(
      'Expires in 1m',
    );
  });

  it('formats hour-scale remainders', () => {
    expect(getSessionStatus(secondsFromNow(2 * 3600), NOW).expiryHint).toBe(
      'Expires in 2h',
    );
    expect(getSessionStatus(secondsFromNow(90 * 60), NOW).expiryHint).toBe(
      'Expires in 1h 30m',
    );
  });

  it('reports expired once the expiry has passed', () => {
    expect(getSessionStatus(secondsFromNow(-1), NOW)).toEqual({
      state: 'expired',
      label: 'Expired',
      expiryHint: null,
    });
    expect(getSessionStatus(secondsFromNow(0), NOW).state).toBe('expired');
  });
});

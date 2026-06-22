import { toIntId } from './RouteUtils';

describe('toIntId', () => {
  it('returns a positive integer for a numeric string', () => {
    expect(toIntId('42')).toBe(42);
  });

  it('returns 1 for "1"', () => {
    expect(toIntId('1')).toBe(1);
  });

  it('returns null for undefined', () => {
    expect(toIntId(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(toIntId(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toIntId('')).toBeNull();
  });

  it('returns null for a non-numeric string (e.g. "abc")', () => {
    expect(toIntId('abc')).toBeNull();
  });

  it('returns null for a query-string fragment (e.g. "?playerId=abc")', () => {
    expect(toIntId('?playerId=abc')).toBeNull();
  });

  it('returns the first element parsed as int when given an array', () => {
    expect(toIntId(['7', '99'])).toBe(7);
  });

  it('returns null when the first array element is non-numeric', () => {
    expect(toIntId(['abc', '99'])).toBeNull();
  });

  it('returns null for a number value (not a string)', () => {
    expect(toIntId(42)).toBeNull();
  });

  it('returns null for an object', () => {
    expect(toIntId({})).toBeNull();
  });

  it('truncates a decimal string to its integer part', () => {
    expect(toIntId('3.14')).toBe(3);
  });
});

import { parseRouteId } from './parseRouteId';

describe('parseRouteId', () => {
  it('parses a plain positive integer', () => {
    expect(parseRouteId('14109')).toBe(14109);
    expect(parseRouteId('1')).toBe(1);
  });

  it('rejects trailing or leading junk (LS-10778)', () => {
    expect(parseRouteId('14109abc')).toBeNull();
    expect(parseRouteId('14111x')).toBeNull();
    expect(parseRouteId('abc14109')).toBeNull();
    expect(parseRouteId(' 14109')).toBeNull();
    expect(parseRouteId('14109 ')).toBeNull();
  });

  it('rejects signs, decimals, exponents and hex', () => {
    expect(parseRouteId('-5')).toBeNull();
    expect(parseRouteId('+5')).toBeNull();
    expect(parseRouteId('1.5')).toBeNull();
    expect(parseRouteId('1e3')).toBeNull();
    expect(parseRouteId('0x10')).toBeNull();
  });

  it('rejects zero and integers beyond the safe range', () => {
    expect(parseRouteId('0')).toBeNull();
    expect(parseRouteId('9007199254740993')).toBeNull();
  });

  it('rejects missing or empty params', () => {
    expect(parseRouteId(undefined)).toBeNull();
    expect(parseRouteId(null)).toBeNull();
    expect(parseRouteId('')).toBeNull();
  });
});

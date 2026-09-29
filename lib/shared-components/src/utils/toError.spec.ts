import { toError } from './toError';

describe('toError', () => {
  it('returns an Error instance unchanged, preserving its stack', () => {
    const original = new Error('boom');
    expect(toError(original)).toBe(original);
  });

  it('wraps a non-Error rejection reason in an Error', () => {
    const result = toError('NotAllowedError');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('NotAllowedError');
  });

  it('wraps undefined and objects without throwing', () => {
    expect(toError(undefined).message).toBe('undefined');
    expect(toError({ code: 1 })).toBeInstanceOf(Error);
  });
});

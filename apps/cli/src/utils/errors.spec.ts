import { errorMessage, toError } from './errors';

describe('errorMessage', () => {
  it('returns the message for an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the message for an Error subclass', () => {
    expect(errorMessage(new TypeError('bad type'))).toBe('bad type');
  });

  it('returns a string value unchanged', () => {
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  it('stringifies numbers and booleans', () => {
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(false)).toBe('false');
  });

  it('serializes a plain object instead of [object Object]', () => {
    expect(errorMessage({ code: 'E_DUP', detail: 'duplicate key' })).toBe(
      '{"code":"E_DUP","detail":"duplicate key"}',
    );
  });

  it('falls back for values JSON.stringify cannot represent', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorMessage(circular)).toBe('Unknown error');
  });

  it('falls back for undefined, which JSON.stringify returns undefined for', () => {
    expect(errorMessage(undefined)).toBe('Unknown error');
  });

  it('handles null', () => {
    expect(errorMessage(null)).toBe('null');
  });
});

describe('toError', () => {
  it('returns the same Error instance, preserving its stack', () => {
    const original = new Error('original');
    const result = toError(original);
    expect(result).toBe(original);
    expect(result.stack).toBe(original.stack);
  });

  it('wraps a non-Error value in an Error carrying its message', () => {
    const result = toError('something failed');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('something failed');
  });

  it('wraps a plain object using its serialized form', () => {
    expect(toError({ code: 'E_DUP' }).message).toBe('{"code":"E_DUP"}');
  });
});

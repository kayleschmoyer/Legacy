import { formatLogEntry } from './types';
import type { LogEntry } from './types';
import { ConsoleOutputDestination } from './destinations/ConsoleOutputDestination';

function makeEntry(args: LogEntry['args']): LogEntry {
  return {
    level: 'error',
    message: 'test',
    args,
    timestamp: new Date('2024-01-01T00:00:00.000Z'),
  };
}

describe('formatLogEntry — Error serialization', () => {
  it('preserves stack when a direct Error is passed as an arg', () => {
    const err = new Error('boom');
    const result = formatLogEntry(makeEntry([err]));
    expect(result).toContain('"stack"');
    expect(result).toContain('boom');
  });

  it('preserves stack when Error is wrapped in an object { error }', () => {
    const err = new Error('wrapped');
    const result = formatLogEntry(makeEntry([{ error: err }]));
    expect(result).toContain('"stack"');
    expect(result).toContain('wrapped');
  });

  it('includes name and message for direct Error', () => {
    const err = new TypeError('bad type');
    const result = formatLogEntry(makeEntry([err]));
    expect(result).toContain('"name"');
    expect(result).toContain('TypeError');
    expect(result).toContain('"message"');
    expect(result).toContain('bad type');
  });

  it('includes name and message for nested Error', () => {
    const err = new RangeError('out of range');
    const result = formatLogEntry(makeEntry([{ err }]));
    expect(result).toContain('RangeError');
    expect(result).toContain('out of range');
    expect(result).toContain('"stack"');
  });

  it('does not affect plain string args', () => {
    const result = formatLogEntry(makeEntry(['hello']));
    expect(result).toContain('hello');
    expect(result).not.toContain('"stack"');
  });

  it('does not affect plain object args', () => {
    const result = formatLogEntry(makeEntry([{ foo: 'bar' }]));
    expect(result).toContain('"foo"');
    expect(result).toContain('"bar"');
  });

  it('handles null and undefined args gracefully', () => {
    const result = formatLogEntry(makeEntry([null, undefined]));
    expect(result).toContain('null');
    expect(result).toContain('undefined');
  });
});

describe('logging', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});

describe('ConsoleOutputDestination — EPIPE handling', () => {
  it('silently swallows EPIPE errors from console writes', () => {
    const dest = new ConsoleOutputDestination();
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    jest.spyOn(console, 'info').mockImplementation(() => {
      throw epipe;
    });
    expect(() =>
      dest.write({
        level: 'info',
        message: 'test',
        args: [],
        timestamp: new Date(),
      }),
    ).not.toThrow();
    jest.restoreAllMocks();
  });

  it('re-throws non-EPIPE errors from console writes', () => {
    const dest = new ConsoleOutputDestination();
    const boom = new Error('something else');
    jest.spyOn(console, 'info').mockImplementation(() => {
      throw boom;
    });
    expect(() =>
      dest.write({
        level: 'info',
        message: 'test',
        args: [],
        timestamp: new Date(),
      }),
    ).toThrow('something else');
    jest.restoreAllMocks();
  });
});

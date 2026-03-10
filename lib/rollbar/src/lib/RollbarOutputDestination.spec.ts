import type { LogEntry } from '@legacy-sports/logging';
import { RollbarOutputDestination } from './RollbarOutputDestination';

function makeEntry(
  level: LogEntry['level'],
  message: string,
  args: LogEntry['args'] = [],
): LogEntry {
  return { level, message, args, timestamp: new Date() };
}

describe('RollbarOutputDestination', () => {
  describe('shouldLog', () => {
    it('returns true for error', () => {
      const dest = new RollbarOutputDestination(jest.fn());
      expect(dest.shouldLog('error')).toBe(true);
    });

    it('returns true for fatal', () => {
      const dest = new RollbarOutputDestination(jest.fn());
      expect(dest.shouldLog('fatal')).toBe(true);
    });

    it('returns false for info', () => {
      const dest = new RollbarOutputDestination(jest.fn());
      expect(dest.shouldLog('info')).toBe(false);
    });

    it('returns false for warn', () => {
      const dest = new RollbarOutputDestination(jest.fn());
      expect(dest.shouldLog('warn')).toBe(false);
    });

    it('returns false for debug', () => {
      const dest = new RollbarOutputDestination(jest.fn());
      expect(dest.shouldLog('debug')).toBe(false);
    });
  });

  describe('write', () => {
    it('calls captureError with the first Error arg', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);
      const err = new Error('boom');
      dest.write(makeEntry('error', 'something failed', [err]));

      expect(captureError).toHaveBeenCalledTimes(1);
      const [calledError, calledContext] = captureError.mock.calls[0] as [
        Error,
        Record<string, unknown>,
      ];
      expect(calledError).toBe(err);
      expect(calledContext['logLevel']).toBe('error');
      expect(calledContext['logMessage']).toBe('something failed');
    });

    it('synthesises an Error from message when no Error arg is present', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);
      dest.write(makeEntry('fatal', 'no error object here', ['extra-info']));

      expect(captureError).toHaveBeenCalledTimes(1);
      const [calledError, calledContext] = captureError.mock.calls[0] as [
        Error,
        Record<string, unknown>,
      ];
      expect(calledError).toBeInstanceOf(Error);
      expect(calledError.message).toBe('no error object here');
      expect(calledContext['logArgs']).toEqual(['extra-info']);
    });

    it('includes non-Error args in logArgs context', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);
      const err = new Error('oops');
      dest.write(makeEntry('error', 'ctx test', [err, { userId: 42 }, 'note']));

      const [, context] = captureError.mock.calls[0] as [
        Error,
        Record<string, unknown>,
      ];
      expect(context['logArgs']).toEqual([{ userId: 42 }, 'note']);
    });

    it('does NOT include logArgs when all args are Error instances', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);
      dest.write(makeEntry('error', 'multi-error', [new Error('a')]));

      const [, context] = captureError.mock.calls[0] as [
        Error,
        Record<string, unknown>,
      ];
      expect(context['logArgs']).toBeUndefined();
    });

    it('suppresses re-entrant calls to prevent infinite loops', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);

      // Simulate captureError itself triggering another write() call
      captureError.mockImplementation(() => {
        dest.write(makeEntry('error', 'inner error'));
      });

      dest.write(makeEntry('error', 'outer error', [new Error('outer')]));

      // captureError should only have been called once (inner call suppressed)
      expect(captureError).toHaveBeenCalledTimes(1);
    });

    it('resets the re-entrancy guard after write completes', () => {
      const captureError = jest.fn();
      const dest = new RollbarOutputDestination(captureError);

      dest.write(makeEntry('error', 'first', [new Error('first')]));
      dest.write(makeEntry('fatal', 'second', [new Error('second')]));

      expect(captureError).toHaveBeenCalledTimes(2);
    });
  });
});

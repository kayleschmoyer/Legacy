import { EventEmitter } from 'node:events';
import {
  type ErrorHandlerProcess,
  FATAL_EXIT_GRACE_MS,
  installGlobalErrorHandlers,
  toRejectionError,
} from './global-error-handlers';
import type { ILogger } from './types';

function makeLogger(): { logger: ILogger; error: jest.Mock } {
  const error = jest.fn();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error,
    fatal: jest.fn(),
  } as unknown as ILogger;
  return { logger, error };
}

type FakeProcess = ErrorHandlerProcess & EventEmitter & { exit: jest.Mock };

function makeProcess(env: NodeJS.ProcessEnv = {}): FakeProcess {
  const proc = new EventEmitter() as FakeProcess;
  proc.env = env;
  proc.exitCode = undefined;
  proc.exit = jest.fn();
  return proc;
}

describe('installGlobalErrorHandlers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs an uncaught exception and sets a non-zero exit code', () => {
    const { logger, error } = makeLogger();
    const proc = makeProcess();
    installGlobalErrorHandlers(logger, { proc });

    const crash = new Error("Cannot find module '@legacy-sports/pfa-client'");
    proc.emit('uncaughtException', crash);

    expect(error).toHaveBeenCalledWith('Uncaught Exception', crash);
    expect(proc.exitCode).toBe(1);
  });

  it('logs an unhandled rejection and sets a non-zero exit code', () => {
    const { logger, error } = makeLogger();
    const proc = makeProcess();
    installGlobalErrorHandlers(logger, { proc });

    const reason = new Error('boom');
    proc.emit('unhandledRejection', reason);

    expect(error).toHaveBeenCalledWith('Promise rejected', reason);
    expect(proc.exitCode).toBe(1);
  });

  it('forces exit(1) after the grace period outside Lambda', () => {
    const { logger } = makeLogger();
    const proc = makeProcess();
    installGlobalErrorHandlers(logger, { proc });

    proc.emit('uncaughtException', new Error('boom'));
    expect(proc.exit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(FATAL_EXIT_GRACE_MS - 1);
    expect(proc.exit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(proc.exit).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('schedules a single forced exit when several errors fire', () => {
    const { logger, error } = makeLogger();
    const proc = makeProcess();
    installGlobalErrorHandlers(logger, { proc, graceMs: 10 });

    proc.emit('uncaughtException', new Error('first'));
    proc.emit('unhandledRejection', 'second');
    jest.advanceTimersByTime(10);

    expect(error).toHaveBeenCalledTimes(2);
    expect(proc.exit).toHaveBeenCalledTimes(1);
  });

  it('sets the exit code but never calls exit() inside Lambda', () => {
    const { logger, error } = makeLogger();
    const proc = makeProcess({ AWS_LAMBDA_FUNCTION_NAME: 'graphql' });
    installGlobalErrorHandlers(logger, { proc });

    proc.emit('uncaughtException', new Error('handler crash'));
    proc.emit('unhandledRejection', new Error('async crash'));
    jest.runAllTimers();

    expect(error).toHaveBeenCalledTimes(2);
    expect(proc.exitCode).toBe(1);
    expect(proc.exit).not.toHaveBeenCalled();
  });

  it('returns a disposer that detaches both listeners', () => {
    const { logger } = makeLogger();
    const proc = makeProcess();
    const dispose = installGlobalErrorHandlers(logger, { proc });

    expect(proc.listenerCount('uncaughtException')).toBe(1);
    expect(proc.listenerCount('unhandledRejection')).toBe(1);

    dispose();

    expect(proc.listenerCount('uncaughtException')).toBe(0);
    expect(proc.listenerCount('unhandledRejection')).toBe(0);
  });
});

describe('toRejectionError', () => {
  it('returns Error reasons unchanged', () => {
    const err = new Error('x');
    expect(toRejectionError(err)).toBe(err);
  });

  it.each([
    ['a string', 'nope', 'nope'],
    ['a number', 42, '42'],
    ['a boolean', false, 'false'],
    ['an object', { code: 'E1' }, '{"code":"E1"}'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['a symbol', Symbol('s'), '[Unknown rejection reason]'],
  ])('wraps %s in an Error', (_label, reason, message) => {
    const result = toRejectionError(reason);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe(message);
  });
});

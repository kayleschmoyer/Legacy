import { EventEmitter } from 'node:events';
import { routeProcessWarnings, type WarningEmitter } from './process-warnings';
import type { ILogger } from './types';

function makeLogger(): { logger: ILogger; warn: jest.Mock; error: jest.Mock } {
  const warn = jest.fn();
  const error = jest.fn();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error,
    fatal: jest.fn(),
  } as unknown as ILogger;
  return { logger, warn, error };
}

function makeProcess(): WarningEmitter & EventEmitter {
  return new EventEmitter() as WarningEmitter & EventEmitter;
}

describe('routeProcessWarnings', () => {
  it('logs emitted process warnings at WARN with name, message, and the error', () => {
    const { logger, warn, error } = makeLogger();
    const proc = makeProcess();
    routeProcessWarnings(logger, proc);

    const warning = new Error(
      'The AWS SDK for JavaScript (v3) will require node >=22',
    );
    warning.name = 'NodeVersionSupportWarning';
    proc.emit('warning', warning);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'NodeVersionSupportWarning: The AWS SDK for JavaScript (v3) will require node >=22',
      warning,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("removes Node's default 'warning' listener so warnings are not also printed to stderr", () => {
    const { logger, warn } = makeLogger();
    const proc = makeProcess();
    const defaultPrinter = jest.fn();
    proc.on('warning', defaultPrinter);

    routeProcessWarnings(logger, proc);
    proc.emit('warning', new Error('once'));

    expect(defaultPrinter).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(proc.listenerCount('warning')).toBe(1);
  });

  it('returns a disposer that detaches the routing listener', () => {
    const { logger, warn } = makeLogger();
    const proc = makeProcess();
    const dispose = routeProcessWarnings(logger, proc);

    dispose();
    proc.emit('warning', new Error('after dispose'));

    expect(warn).not.toHaveBeenCalled();
    expect(proc.listenerCount('warning')).toBe(0);
  });
});

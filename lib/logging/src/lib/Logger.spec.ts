import { Logger } from './Logger';
import type { LogEntry, OutputDestination } from './types';

function makeRecorder(): OutputDestination & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    },
  };
}

describe('Logger destination management', () => {
  it('writes to all configured destinations', () => {
    const a = makeRecorder();
    const b = makeRecorder();
    const logger = new Logger({
      outputDestinations: [a, b],
      minimumLevel: 'debug',
    });

    logger.info('hi');

    expect(a.entries).toHaveLength(1);
    expect(b.entries).toHaveLength(1);
    expect(a.entries[0].message).toBe('hi');
  });

  it('addDestination registers a new destination at runtime', () => {
    const a = makeRecorder();
    const logger = new Logger({
      outputDestinations: [a],
      minimumLevel: 'debug',
    });

    const b = makeRecorder();
    logger.addDestination(b);
    logger.info('after-add');

    expect(b.entries).toHaveLength(1);
    expect(logger.getDestinations()).toContain(b);
  });

  it('removeDestination stops writes to that destination only', () => {
    const a = makeRecorder();
    const b = makeRecorder();
    const logger = new Logger({
      outputDestinations: [a, b],
      minimumLevel: 'debug',
    });

    logger.removeDestination(b);
    logger.info('after-remove');

    expect(a.entries).toHaveLength(1);
    expect(b.entries).toHaveLength(0);
    expect(logger.getDestinations()).not.toContain(b);
  });

  it('clearDestinations removes all destinations', () => {
    const a = makeRecorder();
    const logger = new Logger({
      outputDestinations: [a],
      minimumLevel: 'debug',
    });

    logger.clearDestinations();
    logger.info('after-clear');

    expect(a.entries).toHaveLength(0);
    expect(logger.getDestinations()).toEqual([]);
  });

  it('a thrown write does not block other destinations', () => {
    const broken: OutputDestination = {
      write() {
        throw new Error('boom');
      },
    };
    const good = makeRecorder();
    const logger = new Logger({
      outputDestinations: [broken, good],
      minimumLevel: 'debug',
    });

    const originalErr = console.error;
    console.error = jest.fn();
    try {
      logger.info('still-writes');
    } finally {
      console.error = originalErr;
    }

    expect(good.entries).toHaveLength(1);
  });
});

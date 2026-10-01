import {
  getPgErrorCode,
  isTransientPgError,
  withTransientDbRetry,
} from './transient-db-retry';

function drizzleError(code: string): Error {
  return Object.assign(new Error('Failed query: ...'), {
    cause: Object.assign(new Error('driver error'), { code }),
  });
}

const noDelay = (): Promise<void> => Promise.resolve();

describe('getPgErrorCode', () => {
  it('reads the SQLSTATE from a Drizzle-wrapped error cause', () => {
    expect(getPgErrorCode(drizzleError('40P01'))).toBe('40P01');
  });

  it('reads the SQLSTATE from a driver error thrown directly', () => {
    expect(
      getPgErrorCode(Object.assign(new Error('x'), { code: '40001' })),
    ).toBe('40001');
  });

  it('returns undefined for non-errors and code-less errors', () => {
    expect(getPgErrorCode(undefined)).toBeUndefined();
    expect(getPgErrorCode('boom')).toBeUndefined();
    expect(getPgErrorCode(new Error('plain'))).toBeUndefined();
  });
});

describe('isTransientPgError', () => {
  it.each(['40P01', '40001'])('treats %s as transient', (code) => {
    expect(isTransientPgError(drizzleError(code))).toBe(true);
  });

  it.each(['23503', '23505', '42P01'])('treats %s as non-transient', (code) => {
    expect(isTransientPgError(drizzleError(code))).toBe(false);
  });
});

describe('withTransientDbRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    await expect(withTransientDbRetry(op, { delay: noDelay })).resolves.toBe(
      'ok',
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries a transient error and succeeds', async () => {
    const onRetry = jest.fn();
    const op = jest
      .fn()
      .mockRejectedValueOnce(drizzleError('40P01'))
      .mockResolvedValue('ok');

    await expect(
      withTransientDbRetry(op, { delay: noDelay, onRetry }),
    ).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('rethrows the last transient error after maxAttempts', async () => {
    const error = drizzleError('40001');
    const op = jest.fn().mockRejectedValue(error);

    await expect(
      withTransientDbRetry(op, { maxAttempts: 3, delay: noDelay }),
    ).rejects.toBe(error);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('rethrows a non-transient error immediately', async () => {
    const error = drizzleError('23503');
    const op = jest.fn().mockRejectedValue(error);

    await expect(withTransientDbRetry(op, { delay: noDelay })).rejects.toBe(
      error,
    );
    expect(op).toHaveBeenCalledTimes(1);
  });
});

/**
 * Unit tests for league-delete resilience helpers (LS-8100).
 *
 * The production `deleteAllLeagues` failure was undiagnosable because Drizzle
 * wraps the postgres.js driver error in `error.cause` and the resolver only
 * kept `error.message`. These tests pin that `describeDbError` recovers the
 * driver fields, that transient (deadlock / lock-timeout) errors are retried,
 * and that non-transient errors are rethrown unchanged.
 */
import {
  describeDbError,
  formatDbError,
  isRetryablePgError,
  RETRYABLE_PG_CODES,
  withTransientRetry,
} from './delete-resilience';

/** Build a Drizzle-style wrapper error whose `.cause` is the driver error. */
function drizzleError(cause: Record<string, unknown>): Error {
  const err = new Error(
    'Failed query: delete from "leagues" where "leagues"."id" in ($1)\nparams: 1',
  );
  (err as { cause?: unknown }).cause = cause;
  return err;
}

describe('describeDbError', () => {
  it('recovers code/constraint/table/detail from a Drizzle-wrapped cause', () => {
    const err = drizzleError({
      code: '23503',
      constraint_name: 'draft_teams_teams_id_league_id_fk',
      table_name: 'draft_teams',
      detail: 'Key (team_id)=(1) is still referenced.',
    });
    expect(describeDbError(err)).toEqual({
      message: expect.stringContaining('Failed query'),
      code: '23503',
      constraint: 'draft_teams_teams_id_league_id_fk',
      table: 'draft_teams',
      detail: 'Key (team_id)=(1) is still referenced.',
    });
  });

  it('reads fields off the error itself when thrown without a cause', () => {
    const err = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    const detail = describeDbError(err);
    expect(detail.code).toBe('40P01');
    expect(detail.message).toBe('deadlock detected');
  });

  it('supports the constraint/table field aliases', () => {
    const err = drizzleError({
      code: '23503',
      constraint: 'fk_x',
      table: 't_x',
    });
    const detail = describeDbError(err);
    expect(detail.constraint).toBe('fk_x');
    expect(detail.table).toBe('t_x');
  });

  it('handles non-Error input without throwing', () => {
    expect(describeDbError('boom')).toEqual({
      message: 'boom',
      code: undefined,
      detail: undefined,
      constraint: undefined,
      table: undefined,
    });
  });

  it('omits empty-string fields', () => {
    const detail = describeDbError(drizzleError({ code: '', detail: '' }));
    expect(detail.code).toBeUndefined();
    expect(detail.detail).toBeUndefined();
  });
});

describe('isRetryablePgError', () => {
  it.each([...RETRYABLE_PG_CODES])('treats %s as retryable', (code) => {
    expect(isRetryablePgError(drizzleError({ code }))).toBe(true);
  });

  it('does not retry a foreign-key violation (23503)', () => {
    expect(isRetryablePgError(drizzleError({ code: '23503' }))).toBe(false);
  });

  it('does not retry an error with no SQLSTATE', () => {
    expect(isRetryablePgError(new Error('nope'))).toBe(false);
  });

  it('treats a pg-pool connection-timeout error as retryable (LS-8477)', () => {
    expect(
      isRetryablePgError(new Error('timeout exceeded when trying to connect')),
    ).toBe(true);
  });
});

describe('formatDbError', () => {
  it('renders all present fields in a single line', () => {
    const line = formatDbError({
      message: 'delete failed',
      code: '40P01',
      constraint: 'fk',
      table: 'teams',
      detail: 'd',
    });
    expect(line).toBe(
      'delete failed [code 40P01] [constraint fk] [table teams] [detail d]',
    );
  });

  it('renders just the message when no driver fields exist', () => {
    expect(formatDbError({ message: 'plain' })).toBe('plain');
  });
});

describe('withTransientRetry', () => {
  const noDelay = (): Promise<void> => Promise.resolve();

  it('returns the result on first success without retrying', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    await expect(withTransientRetry(op, { delay: noDelay })).resolves.toBe(
      'ok',
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries a transient error then succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(drizzleError({ code: '40P01' }))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();
    await expect(
      withTransientRetry(op, { delay: noDelay, onRetry }),
    ).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ code: '40P01' }),
    );
  });

  it('rethrows the last error after exhausting attempts', async () => {
    const op = jest.fn().mockRejectedValue(drizzleError({ code: '40P01' }));
    await expect(
      withTransientRetry(op, { maxAttempts: 3, delay: noDelay }),
    ).rejects.toThrow('Failed query');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-transient error', async () => {
    const op = jest.fn().mockRejectedValue(drizzleError({ code: '23503' }));
    await expect(
      withTransientRetry(op, { delay: noDelay }),
    ).rejects.toBeDefined();
    expect(op).toHaveBeenCalledTimes(1);
  });
});

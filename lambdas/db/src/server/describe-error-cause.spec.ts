import { describeErrorCause, MAX_CAUSE_DEPTH } from './describe-error-cause';

/** `new Error(msg, { cause })` without depending on the ES2022 lib typing. */
function withCause(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}

/** Minimal stand-in for `pg`'s DatabaseError shape. */
function pgError(fields: Record<string, string>): Error {
  const err = new Error(fields.message ?? 'pg failure');
  err.name = 'DatabaseError';
  return Object.assign(err, fields);
}

describe('describeErrorCause', () => {
  it('returns undefined for errors without a cause', () => {
    expect(describeErrorCause(new Error('plain'))).toBeUndefined();
    expect(describeErrorCause(null)).toBeUndefined();
    expect(describeErrorCause('string error')).toBeUndefined();
  });

  it('lifts the pg code/detail/constraint off a Drizzle "Failed query" wrapper', () => {
    const cause = pgError({
      message:
        'insert or update on table "drafts" violates foreign key constraint "drafts_league_id_fkey"',
      code: '23503',
      detail: 'Key (league_id)=(13918) is not present in table "leagues".',
      constraint: 'drafts_league_id_fkey',
      table: 'drafts',
      schema: 'public',
      severity: 'ERROR',
    });
    const wrapper = withCause(
      'Failed query: insert into "drafts" (...) values ($1, $2)',
      cause,
    );

    expect(describeErrorCause(wrapper)).toEqual({
      name: 'DatabaseError',
      message: cause.message,
      code: '23503',
      detail: 'Key (league_id)=(13918) is not present in table "leagues".',
      constraint: 'drafts_league_id_fkey',
      table: 'drafts',
      schema: 'public',
      severity: 'ERROR',
    });
  });

  it('omits pg fields that are absent or empty', () => {
    const wrapper = withCause(
      'Failed query',
      pgError({ message: 'timeout', code: '57014', detail: '' }),
    );
    expect(describeErrorCause(wrapper)).toEqual({
      name: 'DatabaseError',
      message: 'timeout',
      code: '57014',
    });
  });

  it('describes non-Error causes by their string form', () => {
    expect(describeErrorCause(withCause('x', 'ECONNRESET'))).toEqual({
      message: 'ECONNRESET',
    });
  });

  it('describes a message-less object cause as a JSON snapshot', () => {
    expect(describeErrorCause(withCause('x', { code: 'ECONNRESET' }))).toEqual({
      message: '{"code":"ECONNRESET"}',
      code: 'ECONNRESET',
    });
  });

  it('follows a nested cause chain up to MAX_CAUSE_DEPTH and no further', () => {
    let innermost: Error = new Error('level-too-deep');
    for (let i = MAX_CAUSE_DEPTH; i >= 1; i--) {
      innermost = withCause(`level-${i}`, innermost);
    }
    const top = withCause('top', innermost);

    const described = describeErrorCause(top);
    expect(described?.message).toBe('level-1');
    expect(described?.cause?.message).toBe('level-2');
    expect(described?.cause?.cause?.message).toBe('level-3');
    // The fourth hop ('level-too-deep') is beyond the depth bound.
    expect(described?.cause?.cause?.cause).toBeUndefined();
  });

  it('does not loop on a self-referential cause', () => {
    const err = new Error('loop');
    (err as { cause?: unknown }).cause = err;
    expect(describeErrorCause(err)).toBeUndefined();
  });
});

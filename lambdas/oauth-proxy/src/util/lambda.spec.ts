import type { APIGatewayEvent } from 'aws-lambda';

const debug: jest.Mock = jest.fn();
const info: jest.Mock = jest.fn();
const warn: jest.Mock = jest.fn();
const error: jest.Mock = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { debug, info, warn, error },
}));

import {
  describeErrorCause,
  getRequestBaseUrl,
  parseEventBody,
  sanitizeHeaders,
} from './lambda';

function makeEvent(
  body: string | null,
  headers: APIGatewayEvent['headers'] = {},
): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    path: '/oauth/login',
    headers,
    multiValueHeaders: {},
    body,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: '/oauth/login',
    isBase64Encoded: false,
  };
}

describe('getRequestBaseUrl', () => {
  function makeContextEvent(domainName: string, stage: string) {
    return {
      ...makeEvent(null),
      requestContext: {
        domainName,
        stage,
      } as APIGatewayEvent['requestContext'],
    };
  }

  it('includes the stage on the default execute-api domain', () => {
    const event = makeContextEvent(
      'abc123.execute-api.us-east-1.amazonaws.com',
      'dev',
    );
    expect(getRequestBaseUrl(event)).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
    );
  });

  it('omits the stage on a custom domain (stage is mapped at the root)', () => {
    const event = makeContextEvent('api.legacy-fantasy.com', 'dev');
    expect(getRequestBaseUrl(event)).toBe('https://api.legacy-fantasy.com');
  });
});

describe('parseEventBody', () => {
  beforeEach(() => {
    debug.mockClear();
    info.mockClear();
    warn.mockClear();
    error.mockClear();
  });

  it('logs only httpMethod and path — never the full event, body, or headers', () => {
    const password = 'hunter2-secret-NEVER-LOG';
    const cookie = 'ls_jwt=eyJhbGciOiJIUzI1NiJ9.SUPER_SECRET';
    const event = makeEvent(JSON.stringify({ email: 'a@b.com', password }), {
      Cookie: cookie,
      Authorization: 'Bearer super-secret-token',
    });

    parseEventBody(event);

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('Processing event', {
      httpMethod: 'POST',
      path: '/oauth/login',
    });

    // Hardened invariant: the password, cookie, and authorization values
    // must not appear in any logger call argument.
    const allCalls = [debug, info, warn, error].flatMap(
      (m) => m.mock.calls as unknown[],
    );
    const serialized = JSON.stringify(allCalls);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(cookie);
    expect(serialized).not.toContain('super-secret-token');
  });

  it('throws when body is missing', () => {
    expect(() => parseEventBody(makeEvent(null))).toThrow(
      'Could not retrieve event body',
    );
  });

  it('returns parsed body unchanged when no schema is supplied', () => {
    const parsed = parseEventBody<{ a: number }>(
      makeEvent(JSON.stringify({ a: 1 })),
    );
    expect(parsed).toEqual({ a: 1 });
  });
});

describe('sanitizeHeaders', () => {
  it('keeps allowlisted headers (case-insensitive, lowercased on output)', () => {
    const result = sanitizeHeaders({
      'User-Agent': 'jest',
      'X-Forwarded-For': '1.2.3.4',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual({
      'user-agent': 'jest',
      'x-forwarded-for': '1.2.3.4',
      'content-type': 'application/json',
    });
  });

  it('strips Cookie, Authorization, and any other unrecognized header', () => {
    const result = sanitizeHeaders({
      Cookie: 'ls_jwt=secret',
      Authorization: 'Bearer secret',
      'Set-Cookie': 'ls_csrf=secret',
      'X-Api-Key': 'k',
      'User-Agent': 'jest',
    });
    expect(result).toEqual({ 'user-agent': 'jest' });
    expect(Object.keys(result)).not.toEqual(
      expect.arrayContaining(['cookie', 'authorization', 'set-cookie']),
    );
  });

  it('handles null and undefined header maps without throwing', () => {
    expect(sanitizeHeaders(null)).toEqual({});
    expect(sanitizeHeaders(undefined)).toEqual({});
  });

  it('skips entries with undefined values', () => {
    const result = sanitizeHeaders({
      'User-Agent': undefined,
      'X-Forwarded-For': '1.2.3.4',
    });
    expect(result).toEqual({ 'x-forwarded-for': '1.2.3.4' });
  });
});

describe('describeErrorCause', () => {
  it('extracts the Postgres fields from a wrapped DrizzleQueryError cause', () => {
    // Mirrors the real shape: a DrizzleQueryError whose `message` is only the
    // SQL, with the originating node-postgres error attached as `cause`.
    const pgError = Object.assign(new Error('Connection terminated'), {
      code: '08006',
      severity: 'FATAL',
      routine: 'pqReadData',
      detail: 'server closed the connection unexpectedly',
    });
    const drizzleError = Object.assign(
      new Error('Failed query: select ... from "app_internal"."users"'),
      { cause: pgError },
    );

    const result = describeErrorCause(drizzleError);
    expect(result).toMatchObject({
      causeName: 'Error',
      causeMessage: 'Connection terminated',
      pgCode: '08006',
      pgSeverity: 'FATAL',
      pgRoutine: 'pqReadData',
      pgDetail: 'server closed the connection unexpectedly',
    });
    // The originating error's stack is always surfaced for diagnosability.
    expect(result['causeStack']).toEqual(expect.stringContaining('Error'));
  });

  it('surfaces the SQLSTATE + message of a failing users query (LS-8008 bar)', () => {
    // Acceptance bar: when a `users` query fails, the SQLSTATE and message are
    // present in the log line. undefined_column (42703) is the schema-drift
    // shape the original incident could not see.
    const pgError = Object.assign(
      new Error('column "canonical_email" does not exist'),
      { code: '42703', severity: 'ERROR', column: 'canonical_email' },
    );
    const drizzleError = Object.assign(
      new Error(
        'Failed query: select "id" from "app_internal"."users" where "canonical_email" = $1',
      ),
      { cause: pgError },
    );

    expect(describeErrorCause(drizzleError)).toMatchObject({
      causeMessage: 'column "canonical_email" does not exist',
      pgCode: '42703',
      pgColumn: 'canonical_email',
    });
  });

  it('extracts pg fields when the error is thrown directly (no cause wrapper)', () => {
    // The production shape that defeated the LS-7935 cause-only reader:
    // `cause` is undefined because the pg error is the top-level error itself.
    const pgError = Object.assign(new Error('statement timeout'), {
      code: '57014',
      severity: 'ERROR',
    });

    expect(describeErrorCause(pgError)).toMatchObject({
      causeName: 'Error',
      causeMessage: 'statement timeout',
      pgCode: '57014',
      pgSeverity: 'ERROR',
    });
  });

  it('unwraps a nested cause chain to reach the deepest pg error', () => {
    const pgError = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    const middle = Object.assign(new Error('tx failed'), { cause: pgError });
    const top = Object.assign(new Error('Failed query: ...'), {
      cause: middle,
    });

    expect(describeErrorCause(top)).toMatchObject({
      causeMessage: 'deadlock detected',
      pgCode: '40P01',
    });
  });

  it('still surfaces message + stack when no pg fields exist anywhere', () => {
    // Genuinely opaque error: no SQLSTATE on any level. The bar drops to
    // "at least the message and a stack are visible".
    const result = describeErrorCause(new Error('boom'));
    expect(result).toMatchObject({
      causeName: 'Error',
      causeMessage: 'boom',
    });
    expect(result['causeStack']).toEqual(expect.stringContaining('boom'));
    expect(result['pgCode']).toBeUndefined();
  });

  it('does not loop forever on a circular cause chain', () => {
    const a = new Error('a');
    const b = Object.assign(new Error('b'), { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    // Walking from `a`: a -> b -> (a already seen, stop). No pg code on either,
    // so it falls back to the innermost reached error (`b`) without looping.
    expect(describeErrorCause(a)).toMatchObject({ causeMessage: 'b' });
  });

  it('stringifies a primitive non-Error throw', () => {
    expect(describeErrorCause('not an error')).toEqual({
      cause: 'not an error',
    });
  });

  it('JSON-stringifies an object non-Error throw (no "[object Object]")', () => {
    expect(describeErrorCause({ reason: 'pool gone' })).toEqual({
      cause: '{"reason":"pool gone"}',
    });
  });
});

import type { APIGatewayEvent } from 'aws-lambda';

const debug: jest.Mock = jest.fn();
const info: jest.Mock = jest.fn();
const warn: jest.Mock = jest.fn();
const error: jest.Mock = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { debug, info, warn, error },
}));

import { parseEventBody, sanitizeHeaders } from './lambda';

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

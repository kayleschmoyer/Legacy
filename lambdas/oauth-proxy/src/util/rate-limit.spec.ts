import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  _resetRateLimitForTests,
  checkRateLimit,
  getClientIp,
  withRateLimit,
} from './rate-limit';

function makeEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  const base = {
    headers: { 'X-Forwarded-For': '1.2.3.4' },
    requestContext: {
      identity: { sourceIp: '9.9.9.9' },
    } as APIGatewayEvent['requestContext'],
  };
  return { ...base, ...overrides } as APIGatewayEvent;
}

const ok: APIGatewayProxyResult = { statusCode: 200, body: 'ok' };

describe('checkRateLimit', () => {
  beforeEach(() => _resetRateLimitForTests());

  it('allows requests up to the limit and blocks the next one', () => {
    const opts = { route: 'r', limit: 3, windowMs: 60_000 };
    expect(checkRateLimit('ip', opts).allowed).toBe(true);
    expect(checkRateLimit('ip', opts).allowed).toBe(true);
    expect(checkRateLimit('ip', opts).allowed).toBe(true);
    const blocked = checkRateLimit('ip', opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates buckets per identifier and per route', () => {
    const opts = { route: 'r1', limit: 1, windowMs: 60_000 };
    expect(checkRateLimit('a', opts).allowed).toBe(true);
    expect(checkRateLimit('a', opts).allowed).toBe(false);
    // different IP
    expect(checkRateLimit('b', opts).allowed).toBe(true);
    // different route
    expect(
      checkRateLimit('a', { route: 'r2', limit: 1, windowMs: 60_000 }).allowed,
    ).toBe(true);
  });

  it('resets after the window elapses', () => {
    const opts = { route: 'r', limit: 1, windowMs: 50 };
    expect(checkRateLimit('ip', opts).allowed).toBe(true);
    expect(checkRateLimit('ip', opts).allowed).toBe(false);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 100);
    try {
      expect(checkRateLimit('ip', opts).allowed).toBe(true);
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('getClientIp', () => {
  it('prefers the first X-Forwarded-For hop', () => {
    expect(
      getClientIp(
        makeEvent({ headers: { 'X-Forwarded-For': '5.5.5.5, 6.6.6.6' } }),
      ),
    ).toBe('5.5.5.5');
  });

  it('falls back to lowercased header', () => {
    expect(
      getClientIp(
        makeEvent({
          headers: { 'x-forwarded-for': '7.7.7.7' },
        }),
      ),
    ).toBe('7.7.7.7');
  });

  it('falls back to requestContext sourceIp', () => {
    expect(
      getClientIp(
        makeEvent({
          headers: {},
          requestContext: {
            identity: { sourceIp: '8.8.8.8' },
          } as APIGatewayEvent['requestContext'],
        }),
      ),
    ).toBe('8.8.8.8');
  });

  it('returns null when nothing is available', () => {
    expect(
      getClientIp({ headers: {}, requestContext: {} } as APIGatewayEvent),
    ).toBeNull();
  });
});

describe('withRateLimit', () => {
  beforeEach(() => _resetRateLimitForTests());

  it('invokes the handler when under the limit', async () => {
    const handler = jest.fn().mockResolvedValue(ok);
    const result = await withRateLimit(
      makeEvent(),
      { route: 'auth', limit: 5, windowMs: 60_000 },
      handler,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });

  it('returns 429 with Retry-After once the bucket is exhausted', async () => {
    const handler = jest.fn().mockResolvedValue(ok);
    const opts = { route: 'auth', limit: 2, windowMs: 60_000 };
    await withRateLimit(makeEvent(), opts, handler);
    await withRateLimit(makeEvent(), opts, handler);
    const blocked = await withRateLimit(makeEvent(), opts, handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers?.['Retry-After']).toBeDefined();
    expect((JSON.parse(blocked.body) as { error: string }).error).toBe(
      'rate_limited',
    );
  });

  it('treats different IPs as separate buckets', async () => {
    const handler = jest.fn().mockResolvedValue(ok);
    const opts = { route: 'auth', limit: 1, windowMs: 60_000 };
    await withRateLimit(
      makeEvent({ headers: { 'X-Forwarded-For': '1.1.1.1' } }),
      opts,
      handler,
    );
    const second = await withRateLimit(
      makeEvent({ headers: { 'X-Forwarded-For': '2.2.2.2' } }),
      opts,
      handler,
    );
    expect(handler).toHaveBeenCalledTimes(2);
    expect(second.statusCode).toBe(200);
  });

  it('fails open when no client IP is available', async () => {
    const handler = jest.fn().mockResolvedValue(ok);
    const result = await withRateLimit(
      { headers: {}, requestContext: {} } as APIGatewayEvent,
      { route: 'auth', limit: 1, windowMs: 60_000 },
      handler,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });
});

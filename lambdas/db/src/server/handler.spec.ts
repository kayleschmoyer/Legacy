/**
 * LS-10065 — CORS: rejected unrecognized origin recurs every time a new dev
 * localhost port shows up (LS-4546, LS-9160, LS-8342 each just added one more
 * exact-match port). getCorsHeaders() now allows any localhost/127.0.0.1
 * origin regardless of port when CORS_ALLOW_ANY_LOCALHOST_PORT is enabled
 * (wired to "true" for the dev environment only in
 * terraform/main/lambda-graphql.tf), while staying exact-match everywhere
 * else so production/staging origin handling is unchanged.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Stable across jest.resetModules() so tests can assert on it.
const mockCaptureWarning = jest.fn();

jest.mock('@legacy-sports/rollbar', () => ({
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  captureWarning: mockCaptureWarning,
}));

function eventWithOrigin(origin: string | undefined): APIGatewayProxyEvent {
  return {
    headers: origin === undefined ? {} : { Origin: origin },
  } as unknown as APIGatewayProxyEvent;
}

describe('getCorsHeaders', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_ANY_LOCALHOST_PORT;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('reflects an exact-match allowed origin regardless of CORS_ALLOW_ANY_LOCALHOST_PORT', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders(
      eventWithOrigin('https://legacy-fantasy.com'),
    );
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
  });

  it('rejects an unrecognized origin when CORS_ALLOW_ANY_LOCALHOST_PORT is unset (prod/staging behavior)', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders(eventWithOrigin('http://localhost:4394'));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('allows any localhost port when CORS_ALLOW_ANY_LOCALHOST_PORT=true (dev)', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    process.env.CORS_ALLOW_ANY_LOCALHOST_PORT = 'true';
    const { getCorsHeaders } = require('./handler');
    // Any port works, including one never seen before / not on any allowlist.
    const headers = getCorsHeaders(eventWithOrigin('http://localhost:4394'));
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'http://localhost:4394',
    );
  });

  it('allows any 127.0.0.1 port when CORS_ALLOW_ANY_LOCALHOST_PORT=true (dev)', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    process.env.CORS_ALLOW_ANY_LOCALHOST_PORT = 'true';
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders(eventWithOrigin('http://127.0.0.1:4280'));
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'http://127.0.0.1:4280',
    );
  });

  it('still rejects an unrelated origin even when CORS_ALLOW_ANY_LOCALHOST_PORT=true', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    process.env.CORS_ALLOW_ANY_LOCALHOST_PORT = 'true';
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders(
      eventWithOrigin('https://api.legacy-fantasy.com'),
    );
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  // LS-10373 — Rollbar #215 recurred with Origin https://api.legacy-fantasy.com
  // (the API's own host). Same-origin needs no CORS headers and is not a
  // rejection worth a warning; a genuinely foreign origin still is.
  it('does not report a same-origin request (Origin equals Host) as a rejection', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    mockCaptureWarning.mockClear();
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders({
      headers: {
        Origin: 'https://api.legacy-fantasy.com',
        Host: 'api.legacy-fantasy.com',
      },
    });
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('still reports a foreign origin when the Host differs', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    mockCaptureWarning.mockClear();
    const { getCorsHeaders } = require('./handler');
    getCorsHeaders({
      headers: {
        Origin: 'https://evil.example',
        Host: 'api.legacy-fantasy.com',
      },
    });
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
  });

  it('omits Access-Control-Allow-Origin when no Origin header is present', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://legacy-fantasy.com';
    const { getCorsHeaders } = require('./handler');
    const headers = getCorsHeaders(eventWithOrigin(undefined));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

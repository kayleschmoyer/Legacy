/**
 * Unit tests for the OAuth proxy Lambda entrypoint.
 * Focused on CORS header correctness: the Lambda must never return
 * Access-Control-Allow-Origin: * when credentials are involved.
 */
import type { APIGatewayEvent, Context } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Module mocks (must be at top level before any imports)
// ---------------------------------------------------------------------------

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn().mockReturnValue(null),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  // withRollbar: return the wrapped fn unchanged so we test real handler logic
  withRollbar: jest.fn(
    <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  ),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getVersionInfo: jest.fn().mockReturnValue({
    service: 'oauth-proxy',
    version: '0.0.0',
    commitSha: 'test',
  }),
  formatVersionInfo: jest.fn().mockReturnValue('oauth-proxy@0.0.0'),
}));

// Prevent handler paths that need Google/DB/JWT from running in CORS tests
jest.mock('./handlers/Google', () => ({
  handleGoogleAuth: jest.fn(),
  handleGoogleAuthorize: jest.fn(),
  handleGoogleCallback: jest.fn(),
  handleGoogleRefresh: jest.fn(),
  handleSecureGoogleAuth: jest.fn(),
}));
jest.mock('./handlers/Local', () => ({
  handleLogin: jest.fn(),
  handleRegister: jest.fn(),
}));
jest.mock('./handlers/Verify', () => ({
  handleVerify: jest.fn(),
}));
jest.mock('./handlers/RefreshJwt', () => ({
  handleRefreshJwt: jest.fn(),
}));
jest.mock('./handlers/Logout', () => ({
  handleLogout: jest.fn(),
}));
jest.mock('./handlers/DeviceFlow', () => ({
  handleDeviceAuthorize: jest.fn(),
  handleDeviceCompleteLocal: jest.fn(),
  handleDeviceToken: jest.fn(),
  handleDeviceVerify: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptionsEvent(origin: string): APIGatewayEvent {
  return {
    httpMethod: 'OPTIONS',
    path: '/oauth/google',
    headers: { origin },
    multiValueHeaders: {},
    body: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: '/oauth/google',
    isBase64Encoded: false,
  };
}

function makeGetEvent(path: string, origin?: string): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path,
    headers: origin ? { origin } : {},
    multiValueHeaders: {},
    body: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: path,
    isBase64Encoded: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OAuth proxy CORS headers', () => {
  let handler: (
    event: APIGatewayEvent,
    ctx: Context,
  ) => Promise<{ headers?: Record<string, string | boolean | number> }>;

  beforeAll(async () => {
    // Import after mocks are registered so all jest.mock() stubs are active
    const mod = await import('./index');
    handler = mod.handler as typeof handler;
  });

  beforeEach(() => {
    delete process.env['CORS_ALLOWED_ORIGINS'];
  });

  afterEach(() => {
    delete process.env['CORS_ALLOWED_ORIGINS'];
  });

  it('OPTIONS with an allowed origin reflects that exact origin (not wildcard)', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await handler(
      makeOptionsEvent('https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('OPTIONS with an unknown origin omits Access-Control-Allow-Origin (never returns *)', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await handler(
      makeOptionsEvent('https://evil.attacker.example'),
      {} as Context,
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('OPTIONS always sets Access-Control-Allow-Credentials: true', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await handler(
      makeOptionsEvent('https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(result.headers?.['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('OPTIONS with allowed origin includes Vary: Origin to prevent caching ambiguity', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await handler(
      makeOptionsEvent('https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(result.headers?.['Vary']).toBe('Origin');
  });

  it('defaults to allowing https://legacy-fantasy.com when CORS_ALLOWED_ORIGINS is unset', async () => {
    // No env var set — should use the hardcoded default
    const result = await handler(
      makeOptionsEvent('https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
  });

  it('supports multiple allowed origins via comma-separated CORS_ALLOWED_ORIGINS', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] =
      'https://legacy-fantasy.com,http://localhost:4200';
    const resultProd = await handler(
      makeOptionsEvent('https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(resultProd.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );

    const resultLocal = await handler(
      makeOptionsEvent('http://localhost:4200'),
      {} as Context,
    );
    expect(resultLocal.headers?.['Access-Control-Allow-Origin']).toBe(
      'http://localhost:4200',
    );
  });

  it('GET /oauth/health with allowed origin reflects that origin in CORS headers', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await handler(
      makeGetEvent('/oauth/health', 'https://legacy-fantasy.com'),
      {} as Context,
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
    expect(result.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

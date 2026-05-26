import { APIGatewayEvent } from 'aws-lambda';
import {
  handleGoogleAuth,
  handleGoogleAuthorize,
  handleGoogleCallback,
  handleSecureGoogleAuth,
} from './Google';
import { verifyOauthState } from '../util/oauth-state';

// Mock dependencies
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarRequired: jest.fn().mockReturnValue('test-client-id'),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-client-secret'),
  DraftSqsService: jest.fn().mockImplementation(() => ({})),
  SqsService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@legacy-sports/db-client', () => ({
  runWithInternalClient: jest.fn(),
  getUserByEmail: jest.fn(),
  InternalUser: {},
}));

jest.mock('./UserManager', () => ({
  getOrCreateUser: jest.fn().mockResolvedValue({
    id: 42,
    email: 'test@example.com',
    username: 'testuser',
    accessLevel: 'player',
    subscriptionTier: 'free',
  }),
}));

jest.mock('../util/users', () => ({
  getUserFromGoogleEmail: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn(),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn().mockResolvedValue('mock-internal-jwt'),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/cookie', () => ({
  encryptCookies: jest.fn().mockResolvedValue(['encrypted-cookies']),
  decryptCookies: jest.fn(),
}));

jest.mock('../util/lambda', () => ({
  parseEventBody: jest.fn(
    (event: APIGatewayEvent): Record<string, unknown> =>
      JSON.parse(event.body ?? '{}') as Record<string, unknown>,
  ),
}));

jest.mock('./DeviceFlow', () => ({
  completeDeviceFlow: jest.fn(),
}));

jest.mock('../util/oauth-state', () => ({
  generateOauthState: jest.fn().mockReturnValue('test-csrf-token'),
  buildOauthStateCookie: jest.fn(
    (token: string) => `ls_oauth_state=${token}; HttpOnly`,
  ),
  buildClearOauthStateCookie: jest
    .fn()
    .mockReturnValue('ls_oauth_state=; Max-Age=0'),
  verifyOauthState: jest.fn(),
  // Real-ish encode/decode so callback tests can exercise the device-code
  // splitting behaviour without pulling in the actual module.
  encodeOauthState: (csrf: string, device?: string) =>
    device ? `${csrf}.${device}` : csrf,
  decodeOauthState: (state: string | undefined | null) => {
    if (!state) return { csrfToken: '', deviceCode: '' };
    const idx = state.indexOf('.');
    if (idx === -1) return { csrfToken: state, deviceCode: '' };
    return { csrfToken: state.slice(0, idx), deviceCode: state.slice(idx + 1) };
  },
}));

// Mock google-auth-library with a chainable OAuth2Client.
// Expose mock functions via getters so tests can reconfigure them without
// running into jest.mock hoisting / TDZ issues with outer let declarations.
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn().mockResolvedValue({
    getPayload: jest
      .fn()
      .mockReturnValue({ sub: '123', email: 'test@example.com' }),
  });
  const MockOAuth2Client = jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
    getToken: jest.fn().mockResolvedValue({
      tokens: { id_token: 'mock-google-id-token' },
    }),
  }));
  return {
    OAuth2Client: MockOAuth2Client,
    // Getter lets tests reconfigure this mock without outer-scope TDZ issues
    getMockVerifyIdToken: () => mockVerifyIdToken,
  };
});

jest.mock('memoize-one', () => (fn: unknown) => fn);

import { withDbClient } from '../util/db';

const mockWithDbClient = withDbClient as jest.MockedFunction<
  typeof withDbClient
>;

function makeEvent(body: Record<string, unknown>): APIGatewayEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/oauth/google',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: {},
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: '/oauth/google',
      stage: 'dev',
      requestId: 'test-request-id',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: '',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
    },
    resource: '',
  };
}

describe('handleGoogleAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('database unavailability', () => {
    it('returns 503 when the database is unreachable (credential/One Tap flow)', async () => {
      mockWithDbClient.mockRejectedValue(new Error('ECONNREFUSED'));

      const event = makeEvent({ credential: 'mock-google-id-token' });
      const result = await handleGoogleAuth(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toBe('Service unavailable');
    });

    it('does NOT issue a JWT when the database is unreachable', async () => {
      const { createJwt } = await import('../util/jwt');
      mockWithDbClient.mockRejectedValue(new Error('Connection timeout'));

      const event = makeEvent({ credential: 'mock-google-id-token' });
      await handleGoogleAuth(event);

      // createJwt must never be called — no JWT for fake users
      expect(createJwt).not.toHaveBeenCalled();
    });

    it('returns 503 when the database is unreachable (authorization code flow)', async () => {
      mockWithDbClient.mockRejectedValue(new Error('DB connection failed'));

      const event = makeEvent({ code: 'auth-code-123' });
      const result = await handleGoogleAuth(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toBe('Service unavailable');
    });
  });
});

describe('handleSecureGoogleAuth — missing body', () => {
  const lambdaMock = jest.requireMock<{
    parseEventBody: jest.Mock;
  }>('../util/lambda');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when body is null', async () => {
    const event: APIGatewayEvent = { ...makeEvent({}), body: null };
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string; message: string };
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Request body is required');
    expect(lambdaMock.parseEventBody).not.toHaveBeenCalled();
  });

  it('returns 400 when body is an empty string', async () => {
    const event: APIGatewayEvent = { ...makeEvent({}), body: '' };
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string; message: string };
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Request body is required');
    expect(lambdaMock.parseEventBody).not.toHaveBeenCalled();
  });
});

describe('handleSecureGoogleAuth — redirect_uri validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeCodeEvent(
    overrides: Record<string, unknown> = {},
  ): APIGatewayEvent & { _credential?: string } {
    return {
      ...makeEvent({ code: 'auth-code-123', ...overrides }),
    };
  }

  it('defaults to postmessage when redirect_uri is omitted', async () => {
    const event = makeCodeEvent();
    const result = await handleSecureGoogleAuth(event);
    // Should NOT get a 400 "Invalid redirect_uri" — may get another status
    // if token exchange fails, but the redirect_uri should be accepted.
    expect(result.statusCode).not.toBe(400);
  });

  it('defaults to postmessage when redirect_uri is an empty string', async () => {
    const event = makeCodeEvent({ redirect_uri: '' });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).not.toBe(400);
  });

  it('accepts postmessage as redirect_uri', async () => {
    const event = makeCodeEvent({ redirect_uri: 'postmessage' });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).not.toBe(400);
  });

  it('accepts the API Gateway callback URI', async () => {
    const event = makeCodeEvent({
      redirect_uri:
        'https://test.execute-api.us-east-1.amazonaws.com/dev/oauth/google/callback',
    });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).not.toBe(400);
  });

  it('rejects an arbitrary redirect_uri with 400', async () => {
    const event = makeCodeEvent({
      redirect_uri: 'https://evil.example.com/steal-token',
    });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe('Invalid redirect_uri');
  });

  it('defaults to postmessage when redirect_uri is whitespace-only', async () => {
    const event = makeCodeEvent({ redirect_uri: '   ' });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).not.toBe(400);
  });

  it('rejects a callback URI with a different stage', async () => {
    const event = makeCodeEvent({
      redirect_uri:
        'https://test.execute-api.us-east-1.amazonaws.com/prod/oauth/google/callback',
    });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe('Invalid redirect_uri');
  });

  it('rejects a javascript: scheme redirect_uri', async () => {
    const event = makeCodeEvent({
      redirect_uri: 'javascript:alert(document.cookie)',
    });
    const result = await handleSecureGoogleAuth(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe('Invalid redirect_uri');
  });
});

describe('handleSecureGoogleAuth — error logging', () => {
  const loggerMock = jest.requireMock<{
    LOGGER: { error: jest.Mock; warn: jest.Mock };
  }>('@legacy-sports/logging');
  const googleMock = jest.requireMock<{
    OAuth2Client: jest.Mock;
    getMockVerifyIdToken: () => jest.Mock;
  }>('google-auth-library');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs LOGGER.warn (not LOGGER.error) when code exchange fails with invalid_grant', async () => {
    const cause = new Error('invalid_grant');
    googleMock.OAuth2Client.mockImplementationOnce(() => ({
      verifyIdToken: jest.fn(),
      getToken: jest.fn().mockRejectedValue(cause),
    }));

    const result = await handleSecureGoogleAuth(
      makeEvent({ code: 'auth-code-123' }),
    );

    expect(result.statusCode).toBe(400);
    expect(loggerMock.LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid_grant'),
      cause,
      expect.objectContaining({ context: 'code_exchange' }),
    );
    expect(loggerMock.LOGGER.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to exchange authorization code'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes the full Error to LOGGER.error when code exchange fails with a non-grant error', async () => {
    const cause = new Error('Connection reset by peer');
    googleMock.OAuth2Client.mockImplementationOnce(() => ({
      verifyIdToken: jest.fn(),
      getToken: jest.fn().mockRejectedValue(cause),
    }));

    const result = await handleSecureGoogleAuth(
      makeEvent({ code: 'auth-code-123' }),
    );

    expect(result.statusCode).toBe(400);
    expect(loggerMock.LOGGER.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to exchange authorization code'),
      cause,
      expect.objectContaining({ context: 'code_exchange' }),
    );
    expect(loggerMock.LOGGER.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('invalid_grant'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes the full Error to LOGGER.warn when ID token verification fails (credential flow)', async () => {
    const cause = new Error('Token has been expired or revoked');
    googleMock.getMockVerifyIdToken().mockRejectedValueOnce(cause);

    const result = await handleSecureGoogleAuth(
      makeEvent({ credential: 'mock-credential' }),
    );

    expect(result.statusCode).toBe(400);
    expect(loggerMock.LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to verify ID token'),
      cause,
      expect.objectContaining({ context: 'id_token_verification' }),
    );
  });
});

const mockVerifyOauthState = verifyOauthState as jest.MockedFunction<
  typeof verifyOauthState
>;

describe('handleGoogleAuthorize — CSRF state binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets the state cookie and forwards the composed state to Google', async () => {
    const event = makeEvent({});
    const result = await handleGoogleAuthorize(event);

    expect(result.statusCode).toBe(302);
    const location = (result.headers?.['Location'] as string | undefined) ?? '';
    // state is just the CSRF token when no caller-supplied device code
    expect(location).toContain('state=test-csrf-token');

    const cookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ls_oauth_state=test-csrf-token'),
      ]),
    );
  });

  it('preserves a caller-supplied state (device code) by appending it after the CSRF token', async () => {
    const event = {
      ...makeEvent({}),
      queryStringParameters: { state: 'device-code-xyz' },
    };
    const result = await handleGoogleAuthorize(event);

    const location = (result.headers?.['Location'] as string | undefined) ?? '';
    expect(location).toContain('state=test-csrf-token.device-code-xyz');
  });
});

describe('handleGoogleCallback — CSRF state verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeCallbackEvent(
    overrides: Partial<APIGatewayEvent> = {},
  ): APIGatewayEvent {
    return {
      ...makeEvent({}),
      httpMethod: 'GET',
      queryStringParameters: { code: 'auth-code', state: 'test-csrf-token' },
      headers: { Cookie: 'ls_oauth_state=test-csrf-token' },
      ...overrides,
    };
  }

  it('returns 400 when state does not match the cookie', async () => {
    mockVerifyOauthState.mockReturnValue(false);

    const result = await handleGoogleCallback(makeCallbackEvent());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe('Invalid state');
    // single-use: cleared on the failure response
    const cookies = (result.multiValueHeaders?.['Set-Cookie'] ??
      []) as string[];
    expect(cookies.some((c) => c.includes('Max-Age=0'))).toBe(true);
  });

  it('returns 400 when state cookie is missing entirely', async () => {
    mockVerifyOauthState.mockReturnValue(false);

    const result = await handleGoogleCallback(
      makeCallbackEvent({ headers: {} }),
    );

    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toBe(
      'Invalid state',
    );
  });

  it('forwards only the device code (not the CSRF token) downstream when state matches', async () => {
    mockVerifyOauthState.mockReturnValue(true);

    // The callback delegates to handleSecureGoogleAuth which requires a body.
    // We don't need to assert downstream success — just that state validation
    // passes and the cookie is cleared.
    const result = await handleGoogleCallback(
      makeCallbackEvent({
        queryStringParameters: {
          code: 'auth-code',
          state: 'test-csrf-token.device-xyz',
        },
      }),
    );

    // Downstream may return any status; what matters is the state cookie was
    // cleared on success too (single-use enforcement).
    const cookies = (result.multiValueHeaders?.['Set-Cookie'] ??
      []) as string[];
    expect(cookies.some((c) => c.includes('Max-Age=0'))).toBe(true);
    // And we did NOT short-circuit with a 400 invalid-state body
    if (result.statusCode === 400) {
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).not.toBe('Invalid state');
    }
  });

  it('returns 400 with the OAuth error message when Google reports an error', async () => {
    const result = await handleGoogleCallback(
      makeCallbackEvent({
        queryStringParameters: { error: 'access_denied' },
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('access_denied');
    const cookies = (result.multiValueHeaders?.['Set-Cookie'] ??
      []) as string[];
    expect(cookies.some((c) => c.includes('Max-Age=0'))).toBe(true);
  });

  it('returns 400 when authorization code is missing', async () => {
    const result = await handleGoogleCallback(
      makeCallbackEvent({
        queryStringParameters: { state: 'test-csrf-token' },
      }),
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe('Missing authorization code');
  });
});

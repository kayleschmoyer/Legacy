import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import {
  MCP_AUTH_ERROR_CODE,
  authenticateMcpRequest,
  buildAuthErrorResponse,
  createLocalJWKSet,
  isFunctionUrlInvocation,
  verifyBearerToken,
  type AuthConfig,
  type JSONWebKeySet,
} from './mcp-bearer-auth';

const API_GW_DOMAIN = 'abc123.execute-api.us-east-1.amazonaws.com';
const FUNC_URL_DOMAIN = 'xyz789.lambda-url.us-east-1.on.aws';

function gatewayEvent(headers: Record<string, string | undefined> = {}) {
  return {
    requestContext: { domainName: API_GW_DOMAIN },
    headers,
  };
}

function functionUrlEvent(headers: Record<string, string | undefined> = {}) {
  return {
    requestContext: { domainName: FUNC_URL_DOMAIN },
    headers,
  };
}

const ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test';
const AUDIENCE = 'test-client-id';
const CONFIG: AuthConfig = { issuer: ISSUER, audience: AUDIENCE };

async function buildKeySet(): Promise<{
  privateKey: SigningKey;
  jwks: JSONWebKeySet;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { privateKey, jwks: { keys: [jwk] } };
}

async function signToken(
  privateKey: SigningKey,
  overrides: {
    issuer?: string;
    audience?: string;
    expSecondsFromNow?: number;
  } = {},
): Promise<string> {
  const exp =
    Math.floor(Date.now() / 1000) + (overrides.expSecondsFromNow ?? 3600);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

function parseBody(body: string | undefined) {
  return JSON.parse(body ?? '{}') as {
    jsonrpc: string;
    id: null;
    error: { code: number; message: string };
  };
}

describe('verifyBearerToken', () => {
  it('returns null for a valid token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey);
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('reports missing Authorization header', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken({}, CONFIG, createLocalJWKSet(jwks));
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/Authorization header missing/);
    expect(result?.message).toMatch(/scripts\/mcp-auth\.mjs/);
  });

  it('reports non-Bearer scheme', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken(
      { authorization: 'Basic abc==' },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/Bearer <token>/);
  });

  it('reports a malformed token', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken(
      { authorization: 'Bearer not-a-jwt' },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/token malformed|token rejected/);
  });

  it('reports an expired token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { expSecondsFromNow: -60 });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token expired/);
  });

  it('reports a wrong-audience token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { audience: 'other-client' });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token claim invalid/);
  });

  it('reports a wrong-issuer token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      issuer: 'https://example.com/other',
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token claim invalid/);
  });

  it('reports a wrong-signer token', async () => {
    const { jwks } = await buildKeySet();
    const { privateKey: otherKey } = await buildKeySet();
    const token = await signToken(otherKey);
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token signature invalid|token rejected/);
  });
});

describe('buildAuthErrorResponse', () => {
  it('returns a 200 with a JSON-RPC error envelope', () => {
    const response = buildAuthErrorResponse({
      code: MCP_AUTH_ERROR_CODE,
      message: 'boom',
    });
    // narrow APIGatewayProxyResultV2 (which can be string | object) to the structured form
    if (typeof response === 'string') {
      throw new Error('expected structured response, got string');
    }
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    const body = parseBody(response.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBeNull();
    expect(body.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(body.error.message).toBe('boom');
  });
});

describe('isFunctionUrlInvocation', () => {
  it.each([
    ['xyz789.lambda-url.us-east-1.on.aws', true],
    ['abc.lambda-url.eu-west-2.on.aws', true],
    ['abc123.execute-api.us-east-1.amazonaws.com', false],
    ['localhost', false],
    ['', false],
  ])('domain %s → %s', (domainName, expected) => {
    expect(
      isFunctionUrlInvocation({ requestContext: { domainName } as never }),
    ).toBe(expected);
  });
});

describe('authenticateMcpRequest', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns a JSON-RPC error envelope when MCP_COGNITO_ISSUER is missing', async () => {
    delete process.env['MCP_COGNITO_ISSUER'];
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest(gatewayEvent() as never);
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body ?? '{}') as {
      error: { code: number; message: string };
    };
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/MCP_COGNITO_ISSUER/);
    expect(parsed.error.message).toMatch(/scripts\/mcp-auth\.mjs/);
  });

  it('returns a JSON-RPC error envelope when MCP_COGNITO_AUDIENCE is missing', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    delete process.env['MCP_COGNITO_AUDIENCE'];
    const result = await authenticateMcpRequest(gatewayEvent() as never);
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    const parsed = JSON.parse(result.body ?? '{}') as {
      error: { code: number; message: string };
    };
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/MCP_COGNITO_AUDIENCE/);
  });

  it('skips bearer validation for Function URL invocations (SigV4 already authenticated)', async () => {
    // Intentionally leave Cognito env vars unset — the helper must not even
    // try to read them when the request came in via the Function URL.
    delete process.env['MCP_COGNITO_ISSUER'];
    delete process.env['MCP_COGNITO_AUDIENCE'];
    const result = await authenticateMcpRequest(
      functionUrlEvent({
        authorization: 'AWS4-HMAC-SHA256 Credential=…',
      }) as never,
    );
    expect(result).toBeNull();
  });

  it('rejects gateway requests with no bearer token', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest(gatewayEvent() as never);
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body ?? '{}') as {
      error: { code: number; message: string };
    };
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/Authorization header missing/);
  });
});

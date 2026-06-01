import { exportJWK, generateKeyPair, SignJWT } from 'jose';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import {
  type AuthConfig,
  authenticateMcpRequest,
  buildAuthErrorResponse,
  buildProtectedResourceMetadata,
  createLocalJWKSet,
  handleOAuthMetadataRequest,
  type JSONWebKeySet,
  MCP_AUTH_ERROR_CODE,
  MCP_SCOPE,
  OAUTH_PROTECTED_RESOURCE_PATH,
  verifyBearerToken,
} from './index';

const API_GW_DOMAIN = 'abc123.execute-api.us-east-1.amazonaws.com';

function gatewayEvent(headers: Record<string, string | undefined> = {}) {
  return {
    requestContext: { domainName: API_GW_DOMAIN },
    headers,
  };
}

const ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test';
const AUDIENCE = 'test-client-id';
// This server's own scope under test; the github server requires `mcp/github`.
const SCOPE = MCP_SCOPE.github;
const OTHER_SCOPE = MCP_SCOPE.jira;

const MACHINE_CONFIG: AuthConfig = {
  issuer: ISSUER,
  requiredScope: SCOPE,
  mode: 'machine',
};
const LEGACY_CONFIG: AuthConfig = {
  issuer: ISSUER,
  legacyAudience: AUDIENCE,
  requiredScope: SCOPE,
  mode: 'legacy',
};
const DUAL_CONFIG: AuthConfig = {
  issuer: ISSUER,
  legacyAudience: AUDIENCE,
  requiredScope: SCOPE,
  mode: 'dual',
};

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
    /** Set the `aud` claim (legacy ID token shape). Omit for a machine token. */
    audience?: string;
    /** Set the space-delimited `scope` claim (machine access token shape). */
    scope?: string;
    expSecondsFromNow?: number;
    /** Extra claims to merge (e.g. a user access token's token_use/username). */
    extraClaims?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const exp =
    Math.floor(Date.now() / 1000) + (overrides.expSecondsFromNow ?? 3600);
  const claims: Record<string, unknown> = {
    // Spread extraClaims first so the explicit `scope` argument always wins,
    // even if a caller accidentally passes `extraClaims.scope`.
    ...(overrides.extraClaims ?? {}),
    ...(overrides.scope !== undefined ? { scope: overrides.scope } : {}),
  };
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(exp);
  if (overrides.audience !== undefined) {
    builder = builder.setAudience(overrides.audience);
  }
  return builder.sign(privateKey);
}

function parseBody(body: string | undefined) {
  return JSON.parse(body ?? '{}') as {
    jsonrpc: string;
    id: null;
    error: { code: number; message: string };
  };
}

describe('verifyBearerToken — machine token (client_credentials)', () => {
  it('accepts a token carrying this server’s own scope', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { scope: SCOPE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('accepts a token whose scope list includes this server’s scope', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      scope: `openid ${SCOPE} ${OTHER_SCOPE}`,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('rejects a token bearing only another server’s scope', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { scope: OTHER_SCOPE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/not authorized for this server/);
    expect(result?.message).toContain(SCOPE);
  });

  it('rejects a token with no scope claim', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey);
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/not authorized for this server/);
  });

  it('rejects a legacy ID token (correct aud, no scope) in machine mode', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { audience: AUDIENCE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/not authorized for this server/);
  });
});

describe('verifyBearerToken — user authorization-code access token (claude.ai connector)', () => {
  // claude.ai's custom remote MCP connector completes a Cognito
  // authorization-code + PKCE flow and sends the resulting *access token* as
  // the bearer (not the ID token). That token carries `token_use: "access"`, a
  // `username`/`sub` for the human user, and a space-delimited `scope` claim
  // including `openid` plus the resource-server scopes the connector requested.
  // Acceptance is grant-agnostic — it must pass on scope alone (LS-5151).
  const USER_TOKEN_CLAIMS = {
    token_use: 'access',
    username: 'dev@example.com',
    client_id: 'connector-client-id',
  };

  it('accepts a user access token carrying this server’s scope (correct scope)', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      scope: `openid ${SCOPE}`,
      extraClaims: USER_TOKEN_CLAIMS,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('rejects a user access token bearing only another server’s scope (wrong scope)', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      scope: `openid ${OTHER_SCOPE}`,
      extraClaims: USER_TOKEN_CLAIMS,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/not authorized for this server/);
    expect(result?.message).toContain(SCOPE);
  });

  it('accepts a user access token in machine-only mode (no legacy aud needed)', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      scope: `openid ${SCOPE}`,
      extraClaims: USER_TOKEN_CLAIMS,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      MACHINE_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });
});

describe('verifyBearerToken — legacy ID token', () => {
  it('accepts a token whose aud matches the legacy client id', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { audience: AUDIENCE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      LEGACY_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('rejects a wrong-audience token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { audience: 'other-client' });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      LEGACY_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/audience not accepted/);
  });

  it('rejects a machine token (scope only, no aud) in legacy mode', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { scope: SCOPE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      LEGACY_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/audience not accepted/);
  });
});

describe('verifyBearerToken — dual mode (migration)', () => {
  it('accepts a machine token with the correct scope', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { scope: SCOPE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('accepts a legacy ID token with the correct aud', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, { audience: AUDIENCE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });

  it('rejects a token with neither the scope nor a matching aud', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      audience: 'other-client',
      scope: OTHER_SCOPE,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/not authorized for this server/);
  });
});

describe('verifyBearerToken — cryptographic / header failures', () => {
  it('reports a missing Authorization header', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken(
      {},
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/Authorization header missing/);
    expect(result?.message).toMatch(/scripts\/mcp-auth\.mjs/);
  });

  it('reports a non-Bearer scheme', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken(
      { authorization: 'Basic abc==' },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/Bearer <token>/);
  });

  it('reports a malformed token', async () => {
    const { jwks } = await buildKeySet();
    const result = await verifyBearerToken(
      { authorization: 'Bearer not-a-jwt' },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(result?.message).toMatch(/token malformed|token rejected/);
  });

  it('reports an expired token (even with the correct scope)', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      scope: SCOPE,
      expSecondsFromNow: -60,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token expired/);
  });

  it('reports a wrong-issuer token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await signToken(privateKey, {
      issuer: 'https://example.com/other',
      scope: SCOPE,
    });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result?.message).toMatch(/token claim invalid/);
  });

  it('reports a wrong-signer token', async () => {
    const { jwks } = await buildKeySet();
    const { privateKey: otherKey } = await buildKeySet();
    const token = await signToken(otherKey, { scope: SCOPE });
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      DUAL_CONFIG,
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
    // narrow APIGatewayProxyResultV2 (string | object) to the structured form
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

describe('authenticateMcpRequest', () => {
  const ORIGINAL_ENV = { ...process.env };
  const OPTIONS = { requiredScope: SCOPE };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns a JSON-RPC error envelope when MCP_COGNITO_ISSUER is missing', async () => {
    delete process.env['MCP_COGNITO_ISSUER'];
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest(
      gatewayEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    expect(result.statusCode).toBe(200);
    const parsed = parseBody(result.body);
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/MCP_COGNITO_ISSUER/);
    expect(parsed.error.message).toMatch(/scripts\/mcp-auth\.mjs/);
  });

  it('returns an error when MCP_COGNITO_AUDIENCE is missing and legacy is enabled', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    delete process.env['MCP_COGNITO_AUDIENCE'];
    // default mode is `dual`, which accepts legacy and therefore needs audience
    const result = await authenticateMcpRequest(
      gatewayEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    const parsed = parseBody(result.body);
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/MCP_COGNITO_AUDIENCE/);
  });

  it('does NOT require MCP_COGNITO_AUDIENCE in machine-only mode', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    delete process.env['MCP_COGNITO_AUDIENCE'];
    process.env['MCP_AUTH_MODE'] = 'machine';
    // No token presented → still rejected, but for a missing header rather
    // than a misconfigured-audience error.
    const result = await authenticateMcpRequest(
      gatewayEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    const parsed = parseBody(result.body);
    expect(parsed.error.message).toMatch(/Authorization header missing/);
    expect(parsed.error.message).not.toMatch(/MCP_COGNITO_AUDIENCE/);
  });

  it('returns an error for an unknown MCP_AUTH_MODE', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    process.env['MCP_AUTH_MODE'] = 'bogus';
    const result = await authenticateMcpRequest(
      gatewayEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    const parsed = parseBody(result.body);
    expect(parsed.error.message).toMatch(/MCP_AUTH_MODE/);
  });

  it('challenges gateway requests with no bearer token (401 + WWW-Authenticate)', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest(
      gatewayEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected structured auth error response');
    }
    // Token-level failures return a spec-compliant 401 challenge (Track B),
    // while the body stays a JSON-RPC error envelope (LS-4941 behavior).
    expect(result.statusCode).toBe(401);
    expect((result.headers ?? {})['WWW-Authenticate']).toContain(
      'resource_metadata=',
    );
    const parsed = parseBody(result.body);
    expect(parsed.error.code).toBe(MCP_AUTH_ERROR_CODE);
    expect(parsed.error.message).toMatch(/Authorization header missing/);
  });
});

describe('OAuth 2.0 Authorization surface (Track B)', () => {
  const ORIGINAL_ENV = { ...process.env };
  const OPTIONS = { requiredScope: SCOPE };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function metadataEvent(path = OAUTH_PROTECTED_RESOURCE_PATH, method = 'GET') {
    return {
      rawPath: path,
      requestContext: { domainName: API_GW_DOMAIN, http: { method } },
    };
  }

  it('serves well-formed Protected Resource Metadata', () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = handleOAuthMetadataRequest(
      metadataEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected a metadata response');
    }
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? '{}') as {
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported: string[];
    };
    expect(body.resource).toBe(`https://${API_GW_DOMAIN}`);
    expect(body.authorization_servers).toEqual([ISSUER]);
    expect(body.bearer_methods_supported).toContain('header');
  });

  it('advertises the mcp/* scope from MCP_OAUTH_SCOPES so the connector requests it', () => {
    // The claude.ai connector reads scopes_supported during consent; advertising
    // `openid mcp/github` is what makes the issued access token carry the scope
    // the bearer-auth check requires (LS-5151).
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    process.env['MCP_OAUTH_SCOPES'] = `openid ${SCOPE}`;
    const result = handleOAuthMetadataRequest(
      metadataEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected a metadata response');
    }
    const body = JSON.parse(result.body ?? '{}') as {
      scopes_supported: string[];
    };
    expect(body.scopes_supported).toEqual(['openid', SCOPE]);
  });

  it('returns null for non-metadata paths (falls through to MCP handling)', () => {
    const result = handleOAuthMetadataRequest(
      metadataEvent('/mcp') as never,
      OPTIONS,
    );
    expect(result).toBeNull();
  });

  it('rejects a non-GET metadata request with 405', () => {
    const result = handleOAuthMetadataRequest(
      metadataEvent(OAUTH_PROTECTED_RESOURCE_PATH, 'POST') as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected a 405 response');
    }
    expect(result.statusCode).toBe(405);
  });

  it('returns 500 for metadata when the server is misconfigured', () => {
    delete process.env['MCP_COGNITO_ISSUER'];
    const result = handleOAuthMetadataRequest(
      metadataEvent() as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected a 500 response');
    }
    expect(result.statusCode).toBe(500);
  });

  it('metadata builder points at the Cognito issuer', () => {
    const metadata = buildProtectedResourceMetadata(
      { requestContext: { domainName: API_GW_DOMAIN } } as never,
      DUAL_CONFIG,
    );
    expect(metadata.authorization_servers).toEqual([ISSUER]);
  });

  it('challenges an invalid token with 401 + resource_metadata URL', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest(
      gatewayEvent({ authorization: 'Bearer not-a-jwt' }) as never,
      OPTIONS,
    );
    if (result === null || typeof result === 'string') {
      throw new Error('expected a challenge response');
    }
    expect(result.statusCode).toBe(401);
    expect((result.headers ?? {})['WWW-Authenticate']).toContain(
      `resource_metadata="https://${API_GW_DOMAIN}${OAUTH_PROTECTED_RESOURCE_PATH}"`,
    );
  });
});

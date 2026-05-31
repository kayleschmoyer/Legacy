// Contract tests for the MCP OAuth 2.0 Authorization surface (AC-B1):
// metadata is well-formed, a missing/invalid token yields a 401 +
// WWW-Authenticate challenge, and a valid token is accepted. The deep
// per-error-shape coverage lives in the github-server copy of this module
// (mcp-bearer-auth.spec.ts); this file verifies the jira-server copy exposes
// the same contract.
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import {
  OAUTH_PROTECTED_RESOURCE_PATH,
  authenticateMcpRequest,
  buildProtectedResourceMetadata,
  createLocalJWKSet,
  handleOAuthMetadataRequest,
  verifyBearerToken,
  type AuthConfig,
  type JSONWebKeySet,
} from './mcp-bearer-auth.js';

const API_GW_DOMAIN = 'abc123.execute-api.us-east-1.amazonaws.com';
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

function metadataEvent(path = OAUTH_PROTECTED_RESOURCE_PATH, method = 'GET') {
  return {
    rawPath: path,
    requestContext: { domainName: API_GW_DOMAIN, http: { method } },
  };
}

describe('jira-server OAuth contract', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('serves well-formed Protected Resource Metadata', () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = handleOAuthMetadataRequest(metadataEvent() as never);
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

  it('metadata builder points at the Cognito issuer', () => {
    const metadata = buildProtectedResourceMetadata(
      { requestContext: { domainName: API_GW_DOMAIN } } as never,
      CONFIG,
    );
    expect(metadata.authorization_servers).toEqual([ISSUER]);
  });

  it('challenges a missing token with 401 + WWW-Authenticate', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest({
      requestContext: { domainName: API_GW_DOMAIN },
      headers: {},
    } as never);
    if (result === null || typeof result === 'string') {
      throw new Error('expected a challenge response');
    }
    expect(result.statusCode).toBe(401);
    expect((result.headers ?? {})['WWW-Authenticate']).toContain(
      `resource_metadata="https://${API_GW_DOMAIN}${OAUTH_PROTECTED_RESOURCE_PATH}"`,
    );
  });

  it('challenges an invalid token with 401', async () => {
    process.env['MCP_COGNITO_ISSUER'] = ISSUER;
    process.env['MCP_COGNITO_AUDIENCE'] = AUDIENCE;
    const result = await authenticateMcpRequest({
      requestContext: { domainName: API_GW_DOMAIN },
      headers: { authorization: 'Bearer not-a-jwt' },
    } as never);
    if (result === null || typeof result === 'string') {
      throw new Error('expected a challenge response');
    }
    expect(result.statusCode).toBe(401);
  });

  it('accepts a valid Cognito token', async () => {
    const { privateKey, jwks } = await buildKeySet();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(privateKey);
    const result = await verifyBearerToken(
      { authorization: `Bearer ${token}` },
      CONFIG,
      createLocalJWKSet(jwks),
    );
    expect(result).toBeNull();
  });
});

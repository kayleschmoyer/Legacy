// Bearer-token validation for the HTTP MCP server Lambdas.
//
// Why this lives in the Lambda instead of the API Gateway JWT authorizer:
// API Gateway's built-in JWT authorizer responds to invalid/expired tokens
// with `HTTP 401 {"message":"Unauthorized"}`. Claude Code's MCP transport
// (StreamableHTTPClientTransport) Zod-validates the body as a JSON-RPC
// envelope and throws `ZodError: expected string, received undefined`,
// giving the agent no actionable hint that the token expired (LS-4941,
// follow-up to LS-4874). Doing validation here lets us return a
// well-formed JSON-RPC error the client can surface verbatim.
//
// This file is intentionally duplicated across the three URL MCP servers
// (github, jira, ci) — they have no shared workspace package today and the
// 80-line auth helper isn't worth the lockfile / nx-graph churn to factor
// out. Keep the three copies in sync when editing.

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
  type JSONWebKeySet,
} from 'jose';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

/** JSON-RPC error code reserved for MCP auth failure (server-defined range). */
export const MCP_AUTH_ERROR_CODE = -32001;

const RECOVERY_HINT =
  "Run 'node scripts/mcp-auth.mjs' to refresh MCP_AUTH_TOKEN in .env.local, then restart your Claude Code session.";

export interface AuthConfig {
  issuer: string;
  audience: string;
}

export interface AuthFailure {
  code: number;
  message: string;
}

/**
 * Build the API Gateway response carrying a JSON-RPC error envelope.
 *
 * The HTTP status is 200 — not 401 — because the MCP client only parses
 * a JSON-RPC body on 2xx responses. A 4xx with a JSON-RPC body still
 * trips the Zod parser the same way the raw API Gateway 401 did.
 */
export function buildAuthErrorResponse(
  failure: AuthFailure,
): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: failure.code, message: failure.message },
    }),
  };
}

function failure(reason: string): AuthFailure {
  return {
    code: MCP_AUTH_ERROR_CODE,
    message: `MCP authentication failed: ${reason}. ${RECOVERY_HINT}`,
  };
}

function readBearer(
  headers: Record<string, string | undefined> | undefined,
): { token: string } | AuthFailure {
  if (!headers) return failure('Authorization header missing');
  // API Gateway HTTP API v2 lower-cases all header names, but be defensive.
  const raw = headers['authorization'] ?? headers['Authorization'] ?? undefined;
  if (!raw) return failure('Authorization header missing');
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) {
    return failure("Authorization header must be 'Bearer <token>'");
  }
  return { token: match[1].trim() };
}

function classifyVerifyError(err: unknown): AuthFailure {
  if (err instanceof joseErrors.JWTExpired) return failure('token expired');
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    return failure(`token claim invalid (${err.claim})`);
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    return failure('token signature invalid');
  }
  if (
    err instanceof joseErrors.JWSInvalid ||
    err instanceof joseErrors.JWTInvalid
  ) {
    return failure('token malformed');
  }
  if (err instanceof joseErrors.JOSEError) {
    return failure(`token rejected (${err.code})`);
  }
  return failure('token verification failed');
}

/**
 * Verify a token against a pre-built JWKS getter. Exposed for tests that
 * inject a local JWKS via `createLocalJWKSet`.
 */
export async function verifyBearerToken(
  headers: Record<string, string | undefined> | undefined,
  config: AuthConfig,
  jwks: JWTVerifyGetKey,
): Promise<AuthFailure | null> {
  const parsed = readBearer(headers);
  if ('code' in parsed) return parsed;
  try {
    await jwtVerify(parsed.token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });
    return null;
  } catch (err) {
    return classifyVerifyError(err);
  }
}

let cachedJwks: JWTVerifyGetKey | null = null;
let cachedJwksIssuer: string | null = null;

function getRemoteJwks(issuer: string): JWTVerifyGetKey {
  if (cachedJwks && cachedJwksIssuer === issuer) return cachedJwks;
  const trimmed = issuer.replace(/\/+$/, '');
  cachedJwks = createRemoteJWKSet(new URL(`${trimmed}/.well-known/jwks.json`));
  cachedJwksIssuer = issuer;
  return cachedJwks;
}

function readConfigFromEnv(): AuthConfig | AuthFailure {
  const issuer = process.env['MCP_COGNITO_ISSUER'];
  const audience = process.env['MCP_COGNITO_AUDIENCE'];
  if (!issuer)
    return failure(
      'MCP server misconfigured: MCP_COGNITO_ISSUER env var not set',
    );
  if (!audience)
    return failure(
      'MCP server misconfigured: MCP_COGNITO_AUDIENCE env var not set',
    );
  return { issuer, audience };
}

/**
 * True when the Lambda was invoked via its Function URL rather than the
 * Cognito-fronted API Gateway. Function URLs are configured with
 * `authorization_type = "AWS_IAM"`, so SigV4 has already been validated by
 * Lambda's invoke surface — there is no Cognito bearer token to verify, and
 * adding one would break cloud agents (GitHub Actions / Claude Code on the
 * web) that call the Function URL directly with SigV4-signed requests.
 *
 * Lambda Function URLs always have a domain matching
 * `<id>.lambda-url.<region>.on.aws`; API Gateway HTTP APIs use
 * `<id>.execute-api.<region>.amazonaws.com`. We use this discriminator
 * instead of inspecting the Authorization header because anyone who can
 * reach the Lambda Function URL has already been authenticated by IAM —
 * relying on a header value the caller fully controls would be unsafe.
 */
export function isFunctionUrlInvocation(
  event: Pick<APIGatewayProxyEventV2, 'requestContext'>,
): boolean {
  const domain = event.requestContext?.domainName ?? '';
  return /\.lambda-url\.[^.]+\.on\.aws$/.test(domain);
}

/**
 * Authenticate an incoming Lambda request. Returns `null` when the request
 * is permitted (valid Cognito bearer, OR Function URL invocation already
 * authenticated by SigV4); otherwise returns a well-formed JSON-RPC error
 * response the handler should return immediately without invoking any tools.
 */
export async function authenticateMcpRequest(
  event: Pick<APIGatewayProxyEventV2, 'requestContext' | 'headers'>,
): Promise<APIGatewayProxyResultV2 | null> {
  if (isFunctionUrlInvocation(event)) return null;
  const config = readConfigFromEnv();
  if ('code' in config) {
    // Missing MCP_COGNITO_ISSUER / MCP_COGNITO_AUDIENCE — surface as a
    // JSON-RPC envelope so the client gets the same actionable error shape
    // as a bad token, rather than the Lambda runtime turning a thrown
    // Error into an opaque 5xx the MCP transport can't parse.
    return buildAuthErrorResponse(config);
  }
  const jwks = getRemoteJwks(config.issuer);
  const result = await verifyBearerToken(event.headers, config, jwks);
  return result ? buildAuthErrorResponse(result) : null;
}

// Re-exported for test ergonomics so spec files don't need a second import.
export { createLocalJWKSet };
export type { JSONWebKeySet };

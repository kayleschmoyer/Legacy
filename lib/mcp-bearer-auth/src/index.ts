// Bearer-token validation for the HTTP MCP server Lambdas (github / jira / ci).
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
// This module is the single shared source for all three URL MCP servers
// (github, jira, ci). It previously existed as three byte-identical copies
// under tools/mcp/{github,jira,ci}-server/src/mcp-bearer-auth.ts; they were
// consolidated here (LS-5091, RFC AC-X1/GAP-3). Each server imports it via
// the `@legacy-sports/mcp-bearer-auth` path alias and passes its own
// per-server scope.

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeJwt,
  errors as joseErrors,
  type JSONWebKeySet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

/** JSON-RPC error code reserved for MCP auth failure (server-defined range). */
export const MCP_AUTH_ERROR_CODE = -32001;

/**
 * The per-server resource-server scopes an access token must carry to reach
 * each server. Authorization is scope-based and grant-agnostic: the scope can
 * be carried by a machine `client_credentials` token (headless agents) OR by a
 * user authorization-code access token (the claude.ai custom remote MCP
 * connector — LS-5151, which sends the access token, not the ID token). Fixed
 * by the RFC (LS-5088); a token bearing only another server's scope is
 * rejected.
 */
export const MCP_SCOPE = {
  github: 'mcp/github',
  jira: 'mcp/jira',
  ci: 'mcp/ci',
  db: 'mcp/db',
  rollbar: 'mcp/rollbar',
} as const;

const RECOVERY_HINT =
  "Run 'node scripts/mcp-auth.mjs' to refresh the MCP credential in .env.local, then restart your Claude Code session.";

/**
 * Which token shapes the server accepts. Controlled per-environment via the
 * `MCP_AUTH_MODE` env var so we can flip with zero downtime (RFC Phase 1/2):
 *   - `legacy`  — only the user ID token (`aud` = legacy public client id).
 *   - `machine` — only a scoped access token (carries this server's `mcp/*`
 *                 scope). Named for the machine `client_credentials` grant it
 *                 was introduced for, but the check is grant-agnostic: a user
 *                 authorization-code access token (claude.ai connector,
 *                 LS-5151) carrying the same scope is accepted identically.
 *   - `dual`    — accept either (the migration default).
 */
export type AuthMode = 'legacy' | 'machine' | 'dual';

export interface AuthConfig {
  issuer: string;
  /**
   * Legacy public-client id that a user ID token's `aud` must match. Required
   * when legacy acceptance is enabled (`legacy` or `dual` mode).
   */
  legacyAudience?: string;
  /** This server's own resource-server scope, e.g. `mcp/github`. */
  requiredScope: string;
  /** Which token shapes to accept. */
  mode: AuthMode;
}

export interface AuthFailure {
  code: number;
  message: string;
}

export interface AuthenticateOptions {
  /** This server's own resource-server scope, e.g. `MCP_SCOPE.github`. */
  requiredScope: string;
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
 * Scopes carried by a Cognito `client_credentials` access token. Cognito
 * emits them as a space-delimited `scope` string; we also tolerate the
 * `scp` array form used by some OIDC providers for defensiveness.
 */
function tokenScopes(payload: JWTPayload): string[] {
  const scope = payload['scope'];
  if (typeof scope === 'string') return scope.split(' ').filter(Boolean);
  const scp: unknown = payload['scp'];
  if (Array.isArray(scp)) {
    return scp.filter((s: unknown): s is string => typeof s === 'string');
  }
  return [];
}

function audienceMatches(payload: JWTPayload, audience: string): boolean {
  const aud = payload.aud;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return false;
}

function notAuthorizedReason(config: AuthConfig): string {
  switch (config.mode) {
    case 'machine':
      return `token not authorized for this server (requires scope '${config.requiredScope}')`;
    case 'legacy':
      return 'token audience not accepted for this server';
    case 'dual':
      return `token not authorized for this server (requires scope '${config.requiredScope}' or a valid legacy audience)`;
  }
}

/**
 * Verify a token against a pre-built JWKS getter. Exposed for tests that
 * inject a local JWKS via `createLocalJWKSet`.
 *
 * The signature, issuer, and `exp` are always verified. Authorization then
 * depends on `config.mode`:
 *   - a token is accepted when its `scope`/`scp` claim contains
 *     `requiredScope`. Only the scope claim is inspected (not `token_use` or
 *     the grant type), so any Cognito token bearing the scope qualifies —
 *     whether minted by the machine `client_credentials` grant or by a user
 *     authorization-code flow (the claude.ai connector access token, LS-5151);
 *   - a legacy user ID token is accepted when its `aud` matches
 *     `legacyAudience`.
 * A token that verifies cryptographically but carries only another server's
 * scope (and no matching legacy audience) is rejected.
 */
export async function verifyBearerToken(
  headers: Record<string, string | undefined> | undefined,
  config: AuthConfig,
  jwks: JWTVerifyGetKey,
): Promise<AuthFailure | null> {
  const result = await verifyBearerTokenIdentity(headers, config, jwks);
  return 'code' in result ? result : null;
}

/**
 * Who a verified bearer belongs to. `user` tokens come from an interactive
 * Cognito sign-in (the claude.ai connector's authorization-code access token,
 * or a legacy ID token); `machine` tokens come from the `client_credentials`
 * grant and carry no person at all (Cognito sets `sub` to the client id).
 */
export interface McpCallerIdentity {
  kind: 'user' | 'machine';
  /** The raw bearer, for calls made on the caller's behalf (e.g. `/oauth2/userInfo`). */
  token: string;
  sub?: string;
  username?: string;
  /** Present on legacy ID tokens only — Cognito access tokens never carry it. */
  email?: string;
  clientId?: string;
  tokenUse?: string;
  scopes: string[];
  expiresAt?: number;
}

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function callerIdentity(payload: JWTPayload, token: string): McpCallerIdentity {
  const tokenUse = stringClaim(payload, 'token_use');
  const clientId = stringClaim(payload, 'client_id');
  const username =
    stringClaim(payload, 'username') ??
    stringClaim(payload, 'cognito:username');
  const isUser =
    tokenUse === 'id' ||
    (username !== undefined &&
      payload.sub !== undefined &&
      payload.sub !== clientId);
  return {
    kind: isUser ? 'user' : 'machine',
    token,
    sub: payload.sub,
    username,
    email: stringClaim(payload, 'email'),
    clientId,
    tokenUse,
    scopes: tokenScopes(payload),
    expiresAt: payload.exp,
  };
}

/**
 * Same verification as {@link verifyBearerToken}, but returns the caller's
 * identity on success instead of `null`.
 */
export async function verifyBearerTokenIdentity(
  headers: Record<string, string | undefined> | undefined,
  config: AuthConfig,
  jwks: JWTVerifyGetKey,
): Promise<AuthFailure | McpCallerIdentity> {
  const parsed = readBearer(headers);
  if ('code' in parsed) return parsed;

  let payload: JWTPayload;
  try {
    // No `audience` option here: machine access tokens carry no `aud`, so we
    // verify signature/issuer/exp first and check audience/scope by mode below.
    ({ payload } = await jwtVerify(parsed.token, jwks, {
      issuer: config.issuer,
    }));
  } catch (err) {
    return classifyVerifyError(err);
  }

  const acceptMachine = config.mode === 'machine' || config.mode === 'dual';
  const acceptLegacy = config.mode === 'legacy' || config.mode === 'dual';

  if (acceptMachine && tokenScopes(payload).includes(config.requiredScope)) {
    return callerIdentity(payload, parsed.token);
  }
  if (
    acceptLegacy &&
    config.legacyAudience !== undefined &&
    audienceMatches(payload, config.legacyAudience)
  ) {
    return callerIdentity(payload, parsed.token);
  }

  return failure(notAuthorizedReason(config));
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

function parseAuthMode(raw: string | undefined): AuthMode | AuthFailure {
  if (raw === undefined || raw === '') return 'dual';
  if (raw === 'legacy' || raw === 'machine' || raw === 'dual') return raw;
  return failure(
    `MCP server misconfigured: MCP_AUTH_MODE must be 'legacy', 'machine', or 'dual' (got '${raw}')`,
  );
}

function readConfigFromEnv(requiredScope: string): AuthConfig | AuthFailure {
  const issuer = process.env['MCP_COGNITO_ISSUER'];
  if (!issuer) {
    return failure(
      'MCP server misconfigured: MCP_COGNITO_ISSUER env var not set',
    );
  }
  const mode = parseAuthMode(process.env['MCP_AUTH_MODE']);
  if (typeof mode !== 'string') return mode;

  const legacyAudience = process.env['MCP_COGNITO_AUDIENCE'];
  const acceptLegacy = mode === 'legacy' || mode === 'dual';
  if (acceptLegacy && !legacyAudience) {
    return failure(
      'MCP server misconfigured: MCP_COGNITO_AUDIENCE env var not set',
    );
  }
  return { issuer, legacyAudience, requiredScope, mode };
}

/**
 * Non-secret claims extracted (unverified) from the presented token, for the
 * structured auth-event log line only. Never includes the token itself or any
 * signature material.
 */
interface TokenLogClaims {
  iat?: number;
  exp?: number;
  auth_time?: unknown;
  client_id?: unknown;
  token_use?: unknown;
  scope?: unknown;
  jti?: unknown;
  origin_jti?: unknown;
}

/** Exported for tests only — production callers go through `authenticateMcpRequest`. */
export function tokenLogClaims(
  headers: Record<string, string | undefined> | undefined,
): TokenLogClaims | null {
  const parsed = readBearer(headers);
  if ('code' in parsed) return null;
  try {
    // Unverified decode — acceptable here because the claims feed a diagnostic
    // log line only, never an authorization decision.
    const payload = decodeJwt(parsed.token);
    return {
      iat: payload.iat,
      exp: payload.exp,
      auth_time: payload['auth_time'],
      client_id: payload['client_id'],
      token_use: payload['token_use'],
      scope: payload['scope'],
      jti: payload.jti,
      origin_jti: payload['origin_jti'],
    };
  } catch {
    return null;
  }
}

/**
 * One structured line per authenticated request, written to stderr so it lands
 * in the Lambda's CloudWatch log group. This is the only server-side evidence
 * of connector token lifecycle: Cognito's /oauth2/token endpoint is not
 * CloudTrail-logged, the user pool has no log delivery configured, and the MCP
 * API Gateways have no access logs — without this line a mid-session 401 is
 * forensically invisible (LS-8696). `tokenAgeSeconds` distinguishes a stale
 * never-refreshed token from a freshly-minted-but-rejected one, and `iat`
 * advancing across a session proves claude.ai's refresh flow is working.
 */
function logAuthEvent(
  outcome: 'accepted' | 'rejected',
  requiredScope: string,
  reason: string | null,
  claims: TokenLogClaims | null,
): void {
  const now = Math.floor(Date.now() / 1000);
  process.stderr.write(
    `[mcp-bearer-auth] ${JSON.stringify({
      event: 'mcp-auth',
      outcome,
      requiredScope,
      ...(reason === null ? {} : { reason }),
      claims,
      tokenAgeSeconds:
        typeof claims?.iat === 'number' ? now - claims.iat : null,
      expiresInSeconds:
        typeof claims?.exp === 'number' ? claims.exp - now : null,
    })}\n`,
  );
}

/**
 * Authenticate an incoming Lambda request. Returns `null` when the request
 * carries a valid Cognito bearer for this server; otherwise returns a
 * well-formed JSON-RPC error response the handler should return immediately
 * without invoking any tools.
 *
 * `options.requiredScope` is the calling server's own scope (e.g.
 * `MCP_SCOPE.github`); it is what a machine token must carry to be accepted.
 *
 * All callers now reach the Lambda through the Cognito-fronted API Gateway and
 * present a short-lived machine-grant bearer (RFC AC-A6/A7, GAP-9 — local +
 * Copilot unified on the machine credential). The legacy AWS_IAM Lambda
 * Function URL / SigV4 bypass was retired in LS-5093.
 */
export async function authenticateMcpRequest(
  event: Pick<APIGatewayProxyEventV2, 'requestContext' | 'headers'>,
  options: AuthenticateOptions,
): Promise<APIGatewayProxyResultV2 | null> {
  const result = await authenticateMcpRequestWithIdentity(event, options);
  return result.ok ? null : result.response;
}

export type McpAuthResult =
  | { ok: true; identity: McpCallerIdentity }
  | { ok: false; response: APIGatewayProxyResultV2 };

/**
 * {@link authenticateMcpRequest}, but on success also returns who the caller
 * is, so a server can attribute actions to the person behind the token.
 */
export async function authenticateMcpRequestWithIdentity(
  event: Pick<APIGatewayProxyEventV2, 'requestContext' | 'headers'>,
  options: AuthenticateOptions,
): Promise<McpAuthResult> {
  const config = readConfigFromEnv(options.requiredScope);
  if ('code' in config) {
    // Missing/invalid MCP_COGNITO_* / MCP_AUTH_MODE config — surface as a
    // JSON-RPC envelope so the client gets the same actionable error shape
    // as a bad token, rather than the Lambda runtime turning a thrown
    // Error into an opaque 5xx the MCP transport can't parse.
    logAuthEvent('rejected', options.requiredScope, config.message, null);
    return { ok: false, response: buildAuthErrorResponse(config) };
  }
  const jwks = getRemoteJwks(config.issuer);
  const result = await verifyBearerTokenIdentity(event.headers, config, jwks);
  const rejected = 'code' in result;
  logAuthEvent(
    rejected ? 'rejected' : 'accepted',
    options.requiredScope,
    rejected ? result.message : null,
    tokenLogClaims(event.headers),
  );
  if (!rejected) return { ok: true, identity: result };
  // Missing/invalid token → spec-compliant 401 challenge so an OAuth client
  // (Claude Code web) can discover the Cognito authorization server. The
  // challenge body remains a well-formed JSON-RPC error envelope.
  const resourceMetadataUrl = `${resourceIdentifier(
    event.requestContext?.domainName,
  )}${OAUTH_PROTECTED_RESOURCE_PATH}`;
  return {
    ok: false,
    response: buildAuthChallengeResponse(result, resourceMetadataUrl),
  };
}

// ── OAuth 2.0 Authorization (MCP Authorization spec, Track B) ────────────────
//
// Claude Code on the web registers MCP servers through its connector UI, which
// only accepts OAuth — there is no static-bearer field (claude-ai-mcp#112). To
// be reachable there, the Lambda must implement the MCP Authorization spec:
//   1. serve OAuth 2.0 Protected Resource Metadata (RFC 9728) at a well-known
//      path, advertising the Cognito authorization server, and
//   2. answer an unauthenticated/invalid request with a 401 carrying a
//      `WWW-Authenticate` challenge that points back at that metadata, so an
//      OAuth-capable client can discover the auth server and start consent.
// The token validation itself is unchanged — a valid Cognito token still
// passes through the same `jwtVerify` path used for the static-bearer flow.

/** RFC 9728 well-known path for OAuth 2.0 Protected Resource Metadata. */
export const OAUTH_PROTECTED_RESOURCE_PATH =
  '/.well-known/oauth-protected-resource';

/** OAuth 2.0 Protected Resource Metadata document (RFC 9728). */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

/**
 * Scopes advertised in the metadata document. Defaults to `openid` (the only
 * scope the current Cognito client issues); overridable via `MCP_OAUTH_SCOPES`
 * (whitespace/comma separated) once per-server `mcp/*` scopes exist (Track A).
 */
function readScopesFromEnv(): string[] {
  const raw = process.env['MCP_OAUTH_SCOPES'];
  if (!raw) return ['openid'];
  const scopes = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : ['openid'];
}

/** Canonical resource identifier for this MCP server (its public origin). */
function resourceIdentifier(domainName: string | undefined): string {
  return `https://${domainName ?? 'localhost'}`;
}

/** Build the Protected Resource Metadata document for the requesting host. */
export function buildProtectedResourceMetadata(
  event: Pick<APIGatewayProxyEventV2, 'requestContext'>,
  config: AuthConfig,
): ProtectedResourceMetadata {
  return {
    resource: resourceIdentifier(event.requestContext?.domainName),
    authorization_servers: [config.issuer.replace(/\/+$/, '')],
    scopes_supported: readScopesFromEnv(),
    bearer_methods_supported: ['header'],
  };
}

function buildJsonResponse(
  statusCode: number,
  payload: unknown,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Serve Protected Resource Metadata when the request targets the RFC 9728
 * well-known path; return `null` otherwise so the caller falls through to
 * normal MCP handling. This endpoint is intentionally public — it is the
 * document a client reads *before* it has any token. `options.requiredScope`
 * is the calling server's own scope (used only to read the shared config).
 */
export function handleOAuthMetadataRequest(
  event: Pick<APIGatewayProxyEventV2, 'requestContext' | 'rawPath'>,
  options: AuthenticateOptions,
): APIGatewayProxyResultV2 | null {
  const path = event.rawPath ?? '';
  if (!path.endsWith(OAUTH_PROTECTED_RESOURCE_PATH)) return null;
  const method = event.requestContext?.http?.method ?? 'GET';
  if (method !== 'GET') {
    return buildJsonResponse(405, { error: 'method_not_allowed' });
  }
  const config = readConfigFromEnv(options.requiredScope);
  if ('code' in config) {
    // Server misconfigured (issuer/audience unset). Don't emit a half-formed
    // metadata doc pointing clients at an empty authorization server.
    return buildJsonResponse(500, {
      error: 'server_error',
      error_description: config.message,
    });
  }
  return buildJsonResponse(200, buildProtectedResourceMetadata(event, config));
}

/**
 * Strip characters that would break the `WWW-Authenticate` header grammar:
 * a double quote terminates an auth-param value early and CR/LF would enable
 * header injection.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n"]+/g, ' ').trim();
}

/**
 * Build the spec-compliant 401 challenge (RFC 6750 + RFC 9728). The
 * `WWW-Authenticate` header advertises the protected-resource metadata URL so
 * an OAuth-capable client (Claude Code web) can discover the Cognito
 * authorization server and begin consent. The body retains a well-formed
 * JSON-RPC error envelope so clients that surface the body still get the
 * actionable recovery hint (preserving the LS-4941 behavior — the original
 * problem was API Gateway returning a non-JSON-RPC body, not the status code).
 */
export function buildAuthChallengeResponse(
  failure: AuthFailure,
  resourceMetadataUrl: string,
): APIGatewayProxyResultV2 {
  const challenge = [
    'error="invalid_token"',
    `error_description="${sanitizeHeaderValue(failure.message)}"`,
    // The URL derives from the request's `domainName`; sanitize it too so a
    // crafted host can never inject into the WWW-Authenticate grammar.
    `resource_metadata="${sanitizeHeaderValue(resourceMetadataUrl)}"`,
  ].join(', ');
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer ${challenge}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: failure.code, message: failure.message },
    }),
  };
}

// ── Transport-level error handling ────────────────────────────────────────
//
// The MCP Lambda handlers (github / jira / ci / db-admin / rollbar) each
// build a WebStandardStreamableHTTPServerTransport, connect their MCP
// server to it, and call `transport.handleRequest(request)`. None of that
// was wrapped in a try/catch: any exception escaping it (a transient
// SecretsManager/GitHub API blip during `server.connect`, an SDK bug, or
// any other unhandled error) propagated out of the Lambda handler entirely.
// API Gateway/the Lambda Function URL then returns its own generic
// `{"message":"Internal Server Error"}` with zero diagnostic detail — the
// exact opaque 500 reported against ci_get_logs/get_job_logs (LS-9583),
// which forced a raw `gh` CLI fallback because the real failure reason was
// never surfaced. `runMcpTransport` is the shared fix: it mirrors the
// JSON-RPC-envelope pattern `authenticateMcpRequest` already uses so a
// transport-level failure gives the client the same actionable, parseable
// error shape as an auth failure, instead of an opaque platform 500.

/** JSON-RPC error code for an unhandled MCP transport/tool-execution failure. */
export const MCP_TRANSPORT_ERROR_CODE = -32603;

/** Hard cap on the sanitized error message returned to the client. */
const MAX_TRANSPORT_ERROR_MESSAGE_LEN = 500;

/**
 * Redact obvious credential material from an error message before it goes
 * into a client-facing response, and cap its length. Mirrors the
 * `sanitizeErrorBody` pattern already used for upstream GitHub API error
 * bodies (`tools/mcp/ci-server/src/http-retry.ts`) — an unhandled exception
 * here can originate from a token-exchange or Secrets Manager call, so the
 * same bearer/PAT-shaped patterns are worth stripping even though this path
 * only ever reaches a caller that already holds a valid MCP bearer for this
 * server (LS-9583 code review).
 */
export function sanitizeTransportErrorMessage(
  message: string,
  maxLen = MAX_TRANSPORT_ERROR_MESSAGE_LEN,
): string {
  let sanitized = message
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic ***')
    .replace(/token\s+[A-Za-z0-9_\-.]+/gi, 'token ***')
    .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_***')
    .replace(/gho_[A-Za-z0-9_]+/g, 'gho_***')
    .replace(/ghs_[A-Za-z0-9_]+/g, 'ghs_***')
    .replace(/ghu_[A-Za-z0-9_]+/g, 'ghu_***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

/**
 * Run the connect+handleRequest sequence for an MCP Lambda, converting any
 * thrown error into a well-formed JSON-RPC 500 response instead of letting
 * it crash the Lambda invocation. `run` should perform `server.connect(transport)`
 * followed by `transport.handleRequest(request)` and return its `Response`;
 * `close` should close the MCP server. `close` always runs (even on error),
 * mirroring the previous per-server `finally` cleanup.
 *
 * The full, unredacted error is always written to stderr (→ CloudWatch) for
 * operator diagnosis; only the sanitized/capped message goes back to the
 * client, since a caller reaching this path has already passed bearer auth
 * but the underlying error could still originate from a credential exchange
 * (e.g. a Secrets Manager or token-endpoint failure) and echo raw secret
 * material otherwise.
 */
export async function runMcpTransport(
  run: () => Promise<Response>,
  close: () => Promise<void>,
): Promise<APIGatewayProxyResultV2> {
  try {
    const response = await run();
    const responseBody = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { statusCode: response.status, headers, body: responseBody };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp-transport] unhandled error: ${message}\n`);
    return buildJsonResponse(500, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: MCP_TRANSPORT_ERROR_CODE,
        message: `MCP server error: ${sanitizeTransportErrorMessage(message)}`,
      },
    });
  } finally {
    await close().catch(() => undefined);
  }
}

// Re-exported for test ergonomics so spec files don't need a second import.
export { createLocalJWKSet };
export type { JSONWebKeySet };

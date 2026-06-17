/**
 * Caller-identity extraction for `db_migrate` audit logging (LS-8119, AC4).
 *
 * `db_migrate` is effectively a remote DDL endpoint, so every invocation is
 * audited with the calling Cognito principal. By the time a tool runs, the
 * bearer has already been cryptographically verified by
 * `authenticateMcpRequest` (signature + issuer + exp + scope). This module only
 * needs the principal *claims* for the audit line, so it decodes the JWT
 * payload without re-verifying — decoding a token the gateway already accepted
 * is safe and avoids a second JWKS round-trip.
 */

/** The Cognito principal that called a tool, as recorded in the audit log. */
export interface McpCaller {
  /** `client_id` claim (the machine/app client), or null if absent. */
  clientId: string | null;
  /** `sub` claim (subject), or null if absent. */
  sub: string | null;
}

const ANONYMOUS: McpCaller = { clientId: null, sub: null };

/** Base64url-decode the JWT payload segment into its claim object. */
function decodePayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length < 2) return null;
  try {
    const json = Buffer.from(segments[1], 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function claimString(
  claims: Record<string, unknown>,
  key: string,
): string | null {
  const value = claims[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Extract the caller principal from an `Authorization: Bearer <jwt>` header.
 *
 * Returns an anonymous caller (`{ clientId: null, sub: null }`) when the header
 * is missing or malformed — the audit log still records the attempt; it never
 * throws, so a logging concern can never block a migration.
 */
export function extractCallerFromAuthHeader(
  authHeader: string | undefined,
): McpCaller {
  if (!authHeader) return ANONYMOUS;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return ANONYMOUS;

  const claims = decodePayload(match[1].trim());
  if (!claims) return ANONYMOUS;

  return {
    clientId: claimString(claims, 'client_id'),
    sub: claimString(claims, 'sub'),
  };
}

/**
 * Pull the caller from API Gateway request headers. API Gateway HTTP API v2
 * lower-cases header names, but we read both casings defensively (mirrors
 * `@legacy-sports/mcp-bearer-auth`).
 */
export function extractCaller(
  headers: Record<string, string | undefined> | undefined,
): McpCaller {
  if (!headers) return ANONYMOUS;
  return extractCallerFromAuthHeader(
    headers['authorization'] ?? headers['Authorization'],
  );
}

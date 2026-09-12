import { LOGGER } from '@legacy-sports/logging/server';

/**
 * The person (or machine client) behind the bearer token of a hosted MCP
 * request. Only the hosted Lambda has one — the local stdio server passes no
 * caller and keeps its single-user env/`/myself` fallbacks.
 */
export interface AssigneeCaller {
  kind: 'user' | 'machine';
  token: string;
  sub?: string;
  /** Already known from the token itself (legacy ID tokens). */
  email?: string;
}

/** Process-lifetime cache of Cognito `sub` -> email. */
const emailBySub = new Map<string, string>();

/** Reset the sub->email cache (for testing). */
export function _resetCallerEmailCache(): void {
  emailBySub.clear();
}

/**
 * Resolve a user caller's email. Cognito access tokens never carry an
 * `email` claim, so ask Cognito's `/oauth2/userInfo` with the caller's own
 * bearer — the connector token carries `openid`, which is all that endpoint
 * needs, and no IAM permission is involved. Returns undefined for machine
 * callers and on any lookup failure.
 */
export async function resolveCallerEmail(
  caller: AssigneeCaller,
): Promise<string | undefined> {
  if (caller.kind !== 'user') return undefined;
  if (caller.email) return caller.email;
  if (caller.sub) {
    const cached = emailBySub.get(caller.sub);
    if (cached) return cached;
  }

  const domain = process.env['MCP_COGNITO_DOMAIN']?.replace(/\/+$/, '');
  if (!domain) {
    LOGGER.warn('MCP_COGNITO_DOMAIN not set; cannot resolve caller email');
    return undefined;
  }

  try {
    const response = await fetch(`${domain}/oauth2/userInfo`, {
      headers: { Authorization: `Bearer ${caller.token}` },
    });
    if (!response.ok) {
      LOGGER.warn('Cognito userInfo lookup failed', {
        status: response.status,
        sub: caller.sub,
      });
      return undefined;
    }
    const body = (await response.json()) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email : undefined;
    if (email && caller.sub) emailBySub.set(caller.sub, email);
    return email;
  } catch (err) {
    LOGGER.warn('Cognito userInfo lookup threw', {
      sub: caller.sub,
      error: err instanceof Error ? err : String(err),
    });
    return undefined;
  }
}

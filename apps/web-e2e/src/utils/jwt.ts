import { createHmac } from 'crypto';

/**
 * Shared signing secret for hermetic E2E tests — intentionally public.
 *
 * The hermetic test suite mocks every network call with `route.fulfill()`,
 * so no real backend ever validates these tokens. The production JWT signing
 * key is intentionally NOT used here — keeping it out of the CI runner's
 * environment prevents accidental exposure via logs, dependencies, or
 * exfiltration.
 *
 * Exported as a single constant so every E2E auth helper (global-setup,
 * fixtures, individual specs) imports the same value and cannot drift.
 *
 * Matches `apps/cli/src/commands/generateJwt.ts` for local dev parity.
 */
export const E2E_SIGNING_SECRET =
  'dev-jwt-secret-key-not-for-production-use-only';

// ---------------------------------------------------------------------------
// Minimal HS256 JWT signer — uses Node.js built-in `crypto` only.
//
// The hermetic E2E suite mocks all network traffic with `route.fulfill()`, so
// no Lambda ever receives or verifies these tokens. Their payloads are only
// decoded (never verified) by client-side React code to populate
// cookies/localStorage. We therefore don't need the full `jsonwebtoken`
// package — a standard HMAC-SHA256 signature is sufficient.
// ---------------------------------------------------------------------------

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function parseExpiresIn(expiresIn: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(expiresIn);
  if (!match) throw new Error(`Invalid expiresIn value: "${expiresIn}"`);
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return n; // bare number treated as seconds
  }
}

/**
 * Sign an HS256 JWT for use in E2E test fixtures.
 *
 * Uses only Node.js built-in `crypto` — no external JWT library needed.
 * Hermetic tests never hit a real backend, so the signature is never
 * validated; this is sufficient to produce a syntactically valid JWT.
 *
 * @param payload    JWT claims. `iat` defaults to the current time but can be
 *                   overridden by including it in `payload`.
 * @param secret     Signing secret.
 * @param expiresIn  Optional expiry string (e.g. '1h', '24h', '30m').
 *                   Ignored when `payload.exp` is already set.
 */
export function signE2EJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn?: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: Record<string, unknown> = {
    iat: now,
    ...payload,
  };
  if (expiresIn !== undefined && fullPayload.exp === undefined) {
    fullPayload.exp = now + parseExpiresIn(expiresIn);
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;
  const signature = base64UrlEncode(
    createHmac('sha256', secret).update(data).digest(),
  );
  return `${data}.${signature}`;
}

/**
 * JWT generation utility for E2E tests.
 *
 * Signs JWTs using the Node.js built-in `crypto` module and the hardcoded
 * `E2E_SIGNING_SECRET`. No CLI subprocess is spawned — this is fast,
 * synchronous, and works identically in CI and local environments.
 */
export class E2EJwtUtil {
  /**
   * Generate a JWT for E2E testing
   */
  static generateJwt(options: {
    email: string;
    expiration?: string;
    accessLevel?: 'none' | 'admin';
    id?: number;
  }): string {
    const { email, expiration = '1h', accessLevel = 'none', id = 1 } = options;

    return signE2EJwt(
      {
        id,
        email,
        username: email.split('@')[0],
        accessLevel,
      },
      E2E_SIGNING_SECRET,
      expiration,
    );
  }

  /**
   * Common test user configurations
   */
  static readonly TEST_USERS = {
    ADMIN: { email: 'admin@test.com', accessLevel: 'admin' as const },
    REGULAR_USER: { email: 'user@test.com', accessLevel: 'none' as const },
    LEAGUE_CREATOR: { email: 'creator@test.com', accessLevel: 'none' as const },
    PARTICIPANT: {
      email: 'participant@test.com',
      accessLevel: 'none' as const,
    },
  };

  /**
   * Generate JWTs for all common test scenarios
   */
  static generateTestJwts(expiration = '1h') {
    return {
      admin: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.ADMIN,
        expiration,
      }),
      regularUser: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.REGULAR_USER,
        expiration,
      }),
      leagueCreator: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.LEAGUE_CREATOR,
        expiration,
      }),
      participant: E2EJwtUtil.generateJwt({
        ...E2EJwtUtil.TEST_USERS.PARTICIPANT,
        expiration,
      }),
    };
  }

  /**
   * Validate JWT format (basic check)
   */
  static isValidJwtFormat(jwt: string): boolean {
    const jwtRegex = /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    return jwtRegex.test(jwt);
  }

  /**
   * Decode JWT payload for testing (without verification)
   */
  static decodeJwtPayload(jwt: string): Record<string, unknown> {
    const [, payload] = jwt.split('.');
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }
}

/**
 * Decode a JWT and throw immediately if it is expired (or will expire within
 * the given buffer).  Integration-test fixtures call this so that developers
 * get a clear "refresh your token" message instead of cryptic 401 failures.
 *
 * @param jwt     The raw JWT string.
 * @param source  Human-readable label for the error message (e.g.
 *                "INTEGRATION_JWT env var", "~/.legacy-sports/auth.json").
 * @param bufferSeconds  Fail early if the token expires within this many
 *                       seconds (default 60).
 */
/**
 * Error thrown when an auth token is expired or about to expire.
 * Use `err instanceof JwtExpiredError` to distinguish from other errors.
 */
export class JwtExpiredError extends Error {
  override readonly name = 'JwtExpiredError';
  constructor(message: string) {
    super(message);
  }
}

export function assertJwtNotExpired(
  jwt: string,
  source: string,
  bufferSeconds = 60,
): void {
  if (!E2EJwtUtil.isValidJwtFormat(jwt)) {
    throw new JwtExpiredError(
      `Auth token from ${source} is not a valid JWT (expected 3 base64url segments). ` +
        'Refresh your token before running integration tests:\n' +
        '  • Local: run  ./ls-cli.ps1 auth login\n' +
        '  • CI:    set  INTEGRATION_JWT_COMMISSIONER / INTEGRATION_JWT  env var to a fresh token',
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = E2EJwtUtil.decodeJwtPayload(jwt);
  } catch {
    throw new JwtExpiredError(
      `Auth token from ${source} has a malformed payload (base64/JSON decode failed). ` +
        'Refresh your token before running integration tests:\n' +
        '  • Local: run  ./ls-cli.ps1 auth login\n' +
        '  • CI:    set  INTEGRATION_JWT_COMMISSIONER / INTEGRATION_JWT  env var to a fresh token',
    );
  }

  const exp = payload.exp;
  if (exp === undefined) return; // no expiry claim — nothing to check

  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new JwtExpiredError(
      `Auth token from ${source} has a malformed 'exp' claim (expected number, got ${typeof exp}). ` +
        'Refresh your token before running integration tests.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (exp <= now + bufferSeconds) {
    const expiredAgo = now - exp;
    const detail =
      expiredAgo > 0
        ? `expired ${expiredAgo}s ago`
        : `expires in ${exp - now}s (within ${bufferSeconds}s buffer)`;

    throw new JwtExpiredError(
      `Auth token from ${source} is expired or about to expire (${detail}). ` +
        'Refresh your token before running integration tests:\n' +
        '  • Local: run  ./ls-cli.ps1 auth login\n' +
        '  • CI:    set  INTEGRATION_JWT_COMMISSIONER / INTEGRATION_JWT  env var to a fresh token',
    );
  }
}

/**
 * Convenience functions for common use cases
 */
export const E2EAuth = {
  generateAdminJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({ ...E2EJwtUtil.TEST_USERS.ADMIN, expiration }),

  generateUserJwt: (expiration?: string) =>
    E2EJwtUtil.generateJwt({
      ...E2EJwtUtil.TEST_USERS.REGULAR_USER,
      expiration,
    }),
};

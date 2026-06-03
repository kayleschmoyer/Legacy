/**
 * Test user authentication utility for integration tests.
 *
 * Registers (or logs in) test users against the live OAuth proxy's local auth
 * endpoints, returning JWTs that contain real database user IDs. This avoids
 * the hardcoded `id: 1` problem in E2EJwtUtil and ensures integration tests
 * operate with real user records.
 *
 * Usage:
 *   const jwt = await getTestUserJwt({ email: 'mgr1@test.ls', password: 'test-pass-1' });
 *
 * For per-spec unique identities (avoids Cognito 429s when multiple specs
 * share a persona — LS-4940), use `getSpecUserJwt(persona, specSlug)` with
 * `specSlug = specSlugFromTestInfo(testInfo)`.
 */
import type { TestInfo } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Predefined test users for integration tests.
 *
 * Credentials are read from environment variables so they can be managed as
 * GitHub Actions secrets (E2E_COMMISSIONER_EMAIL, E2E_COMMISSIONER_PASSWORD,
 * etc.) rather than being committed to source control.  There are no fallback
 * values — the environment variables must be set before running integration
 * tests (locally via a `.env.e2e` file loaded by Playwright's `envFile` config
 * option, or in CI via repository secrets).
 */
export const TEST_USERS = {
  COMMISSIONER: {
    email: process.env['E2E_COMMISSIONER_EMAIL'] ?? '',
    password: process.env['E2E_COMMISSIONER_PASSWORD'] ?? '',
  },
  MANAGER_1: {
    email: process.env['E2E_MANAGER_1_EMAIL'] ?? '',
    password: process.env['E2E_MANAGER_1_PASSWORD'] ?? '',
  },
  MANAGER_2: {
    email: process.env['E2E_MANAGER_2_EMAIL'] ?? '',
    password: process.env['E2E_MANAGER_2_PASSWORD'] ?? '',
  },
  MANAGER_3: {
    email: process.env['E2E_MANAGER_3_EMAIL'] ?? '',
    password: process.env['E2E_MANAGER_3_PASSWORD'] ?? '',
  },
} as const;

interface TestUserCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  jwt: string;
}

/** In-process cache so we don't re-register for every fixture invocation. */
const jwtCache = new Map<string, string>();

/**
 * Cross-process JWT cache (LS-5149). Playwright spawns a fresh worker process
 * per spec file, defeating the in-process `jwtCache` Map. Without a shared
 * cache, 9 touched specs × 4 users = 36+ auth requests per run, easily
 * exceeding the oauth-proxy's `AUTH_RATE_LIMIT = { limit: 5, windowMs: 60_000 }`
 * per IP and producing 429s that cascade as Phase 2 "managers join" failures.
 *
 * The file lives in the OS tempdir (purged per CI job) and is gitignored on
 * the off-chance it ever escapes /tmp.
 */
const JWT_DISK_CACHE_PATH = path.join(
  os.tmpdir(),
  'legacy-sports-integration-jwts.json',
);

/** Decode a JWT's `exp` claim (seconds since epoch). Returns undefined on parse error. */
function decodeJwtExp(jwt: string): number | undefined {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as { exp?: number };
    return decoded.exp;
  } catch {
    return undefined;
  }
}

/** 60s safety margin before the JWT's actual expiry. */
const JWT_EXPIRY_SAFETY_MS = 60_000;

function isJwtFresh(jwt: string): boolean {
  const exp = decodeJwtExp(jwt);
  if (!exp) return false;
  return exp * 1000 - JWT_EXPIRY_SAFETY_MS > Date.now();
}

interface DiskCacheEntry {
  jwt: string;
}

function readDiskCache(): Record<string, DiskCacheEntry> {
  try {
    if (!fs.existsSync(JWT_DISK_CACHE_PATH)) return {};
    const raw = fs.readFileSync(JWT_DISK_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, DiskCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDiskCache(email: string, jwt: string): void {
  try {
    const current = readDiskCache();
    current[email] = { jwt };
    fs.writeFileSync(JWT_DISK_CACHE_PATH, JSON.stringify(current), 'utf-8');
  } catch {
    // Best-effort: a write failure just means the next worker re-auths.
  }
}

function resolveOAuthBaseUrl(): string {
  return process.env.OAUTH_PROXY_URL || 'https://api.legacy-fantasy.com/oauth';
}

/**
 * Obtain a JWT for a test user by logging in (or registering) against the
 * live OAuth proxy. The JWT contains a real auto-incremented database user ID.
 *
 * - Tries `POST /oauth/login` first — prevents accidentally creating a user
 *   with wrong credentials if the test user already exists (the common case
 *   in CI, where test users are provisioned ahead of time).
 * - Falls back to `POST /oauth/register` only if login fails (first-time
 *   provisioning on a fresh environment). `/oauth/register` no longer
 *   returns a JWT (LS-2549 — uniform response to prevent account
 *   enumeration), so a second `POST /oauth/login` is issued after a
 *   successful register to obtain the JWT.
 */
export async function getTestUserJwt(
  creds: TestUserCredentials,
): Promise<string> {
  const cached = jwtCache.get(creds.email);
  if (cached) return cached;

  // Cold path: try the cross-process disk cache before re-authenticating.
  // Playwright spawns a fresh worker process per spec file, so the in-process
  // Map above is hot for the worker's own files only — the disk cache shares
  // the JWT across workers and prevents oauth-proxy 429s (LS-5149).
  const onDisk = readDiskCache()[creds.email];
  if (onDisk?.jwt && isJwtFresh(onDisk.jwt)) {
    jwtCache.set(creds.email, onDisk.jwt);
    return onDisk.jwt;
  }

  const oauthUrl = resolveOAuthBaseUrl();
  const jwt = await registerOrLogin(oauthUrl, creds);
  jwtCache.set(creds.email, jwt);
  writeDiskCache(creds.email, jwt);
  return jwt;
}

/** Plain timer sleep for rate-limit backoff — no Playwright coupling. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() wrapper that retries on HTTP 429 (rate limited) with exponential
 * backoff. All other status codes are returned immediately.
 *
 * Backoff schedule (maxAttempts=7): no wait → 1 s → 2 s → 4 s → 8 s → 16 s → 32 s,
 * total ~63 s — enough to outlast the OAuth proxy's 60 s rate-limit window
 * (5 requests / minute per IP per route, see
 * `lambdas/oauth-proxy/src/index.ts`'s `AUTH_RATE_LIMIT`). Per-spec unique
 * emails (LS-4940) avoid per-identity contention; this retry covers the
 * per-IP throttle so back-to-back integration runs from the same host don't
 * fail when the auth-route bucket fills.
 */
async function fetchWithRateLimitRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 7,
): Promise<Response> {
  let last!: Response;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetch(url, options);
    if (last.status !== 429 || attempt === maxAttempts) return last;
    await sleep(1_000 * Math.pow(2, attempt - 1));
  }
  return last;
}

async function registerOrLogin(
  oauthUrl: string,
  creds: TestUserCredentials,
): Promise<string> {
  if (!creds.email || !creds.password) {
    throw new Error(
      'Test user credentials are empty. Set E2E_COMMISSIONER_EMAIL / ' +
        'E2E_COMMISSIONER_PASSWORD (and E2E_MANAGER_*) env vars, or create ' +
        'a .env.e2e file.',
    );
  }

  // Try login first — avoids accidentally creating a user with wrong credentials.
  // Retries up to 4 times on 429 with exponential backoff (handles parallel
  // nightly runs all authenticating at the same time).
  const loginRes = await fetchWithRateLimitRetry(`${oauthUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
    }),
  });

  if (loginRes.ok) {
    const data = (await loginRes.json()) as AuthResponse;
    return data.jwt;
  }

  // Capture login failure details before attempting register, so if both
  // attempts fail we can surface why login failed (wrong password, disabled
  // user, etc.) — which is the common case in CI.
  const loginStatus = loginRes.status;
  const loginErrorText = await loginRes.text().catch(() => 'unknown');

  // Login failed — try register (user may not exist yet). The register
  // endpoint returns a uniform 200 with no JWT regardless of whether the
  // email was new or already existed (LS-2549), so we must always
  // follow up with a second login to obtain the JWT.
  const registerRes = await fetchWithRateLimitRetry(`${oauthUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      confirmPassword: creds.password,
    }),
  });

  if (!registerRes.ok) {
    const registerErrorText = await registerRes.text().catch(() => 'unknown');
    throw new Error(
      `Failed to authenticate test user ${creds.email}: ` +
        `login failed with ${loginStatus} ${loginErrorText}, ` +
        `then register failed with ${registerRes.status} ${registerErrorText}`,
    );
  }

  // Register succeeded — log in to obtain a JWT.
  const postRegisterLoginRes = await fetchWithRateLimitRetry(
    `${oauthUrl}/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: creds.email,
        password: creds.password,
      }),
    },
  );

  if (postRegisterLoginRes.ok) {
    const data = (await postRegisterLoginRes.json()) as AuthResponse;
    return data.jwt;
  }

  const postLoginErrorText = await postRegisterLoginRes
    .text()
    .catch(() => 'unknown');
  throw new Error(
    `Failed to authenticate test user ${creds.email}: ` +
      `initial login failed with ${loginStatus} ${loginErrorText}, ` +
      `register succeeded, but post-register login failed with ` +
      `${postRegisterLoginRes.status} ${postLoginErrorText}`,
  );
}

/** Clear the JWT cache (useful between test suites if needed). */
export function clearTestUserCache(): void {
  jwtCache.clear();
  try {
    if (fs.existsSync(JWT_DISK_CACHE_PATH)) {
      fs.unlinkSync(JWT_DISK_CACHE_PATH);
    }
  } catch {
    // Best-effort: a stale cache file is harmless — expired JWTs fall through.
  }
}

// ---------------------------------------------------------------------------
// Per-spec unique test users (LS-4940)
//
// Multiple integration specs that share a fixed persona email (commissioner@,
// manager2@, ...) collide on Cognito login during nightly shard fan-out and
// hit `429 Too many requests`. The fix is one Cognito identity per spec file:
// the spec slug is derived from the test's file path, so the same spec uses
// the same identity across runs (per-test afterAll cleanup still works) but
// different specs never share a login.
// ---------------------------------------------------------------------------

export type Persona = 'COMMISSIONER' | 'MANAGER_1' | 'MANAGER_2' | 'MANAGER_3';

const PERSONA_PREFIX: Record<Persona, string> = {
  COMMISSIONER: 'commissioner',
  MANAGER_1: 'manager1',
  MANAGER_2: 'manager2',
  MANAGER_3: 'manager3',
};

/**
 * Derive a stable, unique test-user email per spec file. Format:
 *   `<persona>-<8charHash>@test.legacysports.dev`
 *
 * The 8-char hex hash is derived from the spec slug (deterministic across
 * runs). Hashing is needed because the underlying `users.username` column is
 * `varchar(50)` and the raw spec slug (e.g. `league-activity-feed-ui`) pushes
 * `commissioner-<slug>@test.legacysports.dev` past the limit.
 *
 * The domain matches `ALLOWED_TEST_EMAIL_PATTERNS` in global-setup.ts so the
 * cleanup safety guard still recognises these as test users.
 */
export function specUserEmail(persona: Persona, specSlug: string): string {
  const hash = createHash('sha256').update(specSlug).digest('hex').slice(0, 8);
  return `${PERSONA_PREFIX[persona]}-${hash}@test.legacysports.dev`;
}

/**
 * Stable slug from a Playwright TestInfo (file basename, no extension).
 * Example: `league-activity-feed-ui.integration.spec.ts` → `league-activity-feed-ui`.
 *
 * The slug feeds into `specUserEmail`'s hash — it is never embedded directly
 * in the email, so length here is unconstrained.
 */
export function specSlugFromTestInfo(testInfo: TestInfo): string {
  const base = testInfo.file.split(/[\\/]/).pop() ?? 'unknown';
  return base
    .replace(/\.integration\.spec\.ts$/, '')
    .replace(/\.spec\.ts$/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase();
}

/**
 * Get a JWT for a per-spec unique test user (LS-4940). The user is
 * auto-registered on first use by the OAuth proxy; the same spec file
 * deterministically reuses the same identity across runs so per-test
 * afterAll cleanup remains coherent.
 *
 * The password is shared with the base persona credentials
 * (E2E_COMMISSIONER_PASSWORD / E2E_MANAGER_N_PASSWORD) — same secret, new
 * email per spec.
 */
export async function getSpecUserJwt(
  persona: Persona,
  specSlug: string,
): Promise<string> {
  const base = TEST_USERS[persona];
  if (!base.password) {
    throw new Error(
      `Test user password missing for ${persona} — set E2E_${persona}_PASSWORD ` +
        `(or the matching manager env var) in your .env.e2e / CI secrets.`,
    );
  }
  return getTestUserJwt({
    email: specUserEmail(persona, specSlug),
    password: base.password,
  });
}

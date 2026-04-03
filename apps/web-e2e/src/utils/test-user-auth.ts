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
 */

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

function resolveOAuthBaseUrl(): string {
  return (
    process.env.VITE_OAUTH_PROXY_URL ||
    process.env.OAUTH_PROXY_URL ||
    'https://api.legacy-fantasy.com/oauth'
  );
}

/**
 * Obtain a JWT for a test user by registering or logging in against the live
 * OAuth proxy. The JWT contains a real auto-incremented database user ID.
 *
 * - Tries `POST /oauth/register` first (creates user if it doesn't exist)
 * - Falls back to `POST /oauth/login` if the user is already registered
 */
export async function getTestUserJwt(
  creds: TestUserCredentials,
): Promise<string> {
  const cached = jwtCache.get(creds.email);
  if (cached) return cached;

  const oauthUrl = resolveOAuthBaseUrl();
  const jwt = await registerOrLogin(oauthUrl, creds);
  jwtCache.set(creds.email, jwt);
  return jwt;
}

async function registerOrLogin(
  oauthUrl: string,
  creds: TestUserCredentials,
): Promise<string> {
  // Try register first
  const registerRes = await fetch(`${oauthUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      confirmPassword: creds.password,
    }),
  });

  if (registerRes.ok) {
    const data = (await registerRes.json()) as AuthResponse;
    return data.jwt;
  }

  // If registration failed (user already exists), try login
  const loginRes = await fetch(`${oauthUrl}/login`, {
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

  const errorText = await loginRes.text().catch(() => 'unknown');
  throw new Error(
    `Failed to authenticate test user ${creds.email}: ${loginRes.status} ${errorText}`,
  );
}

/** Clear the JWT cache (useful between test suites if needed). */
export function clearTestUserCache(): void {
  jwtCache.clear();
}

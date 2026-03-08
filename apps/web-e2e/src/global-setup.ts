import type { FullConfig } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Playwright global setup for E2E authentication.
 *
 * Two modes:
 *   CI  – Signs a JWT directly using the JWT_SECRET env var (no external service needed).
 *   Local – Uses the OAuth device flow so the developer authenticates with their real
 *           Google account. The resulting token is cached in `.auth/token-cache.json`
 *           so you only need to re-authenticate when the token expires.
 *
 * The generated JWT is saved as a Playwright `storageState` file (.auth/state.json)
 * which is automatically loaded into every browser context via the Playwright config.
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'state.json');
const TOKEN_CACHE_PATH = path.join(AUTH_DIR, 'token-cache.json');

/** Dev-only fallback secret — matches apps/cli/src/commands/generateJwt.ts */
const DEV_JWT_SECRET = 'dev-jwt-secret-key-not-for-production-use-only';

interface TokenCache {
  jwt: string;
  email: string;
  expiresAt: number; // epoch ms
}

interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  jwt: string;
  user: {
    id: number;
    email: string;
    username: string;
    accessLevel: string;
  };
  refreshToken?: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function globalSetup(config: FullConfig) {
  console.log('[E2E Auth] Running global auth setup…');

  const jwt = await resolveAuthToken();
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';

  writeStorageState(baseURL, jwt);

  console.log('[E2E Auth] ✅ storageState written to .auth/state.json');
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

async function resolveAuthToken(): Promise<string> {
  // CI mode — sign a JWT locally using JWT_SECRET
  if (process.env.CI || process.env.E2E_AUTH_MODE === 'ci') {
    console.log('[E2E Auth] CI mode — signing JWT with JWT_SECRET');
    return signJwtLocally();
  }

  // Local mode — device flow with caching
  console.log('[E2E Auth] Local mode — using device flow (cached if valid)');
  return resolveLocalToken();
}

// ---------------------------------------------------------------------------
// CI: direct JWT signing
// ---------------------------------------------------------------------------

function signJwtLocally(): string {
  const secret = process.env.JWT_SECRET || DEV_JWT_SECRET;

  if (secret === DEV_JWT_SECRET) {
    console.warn(
      '[E2E Auth] ⚠️  Using dev fallback JWT secret. Set JWT_SECRET for production-like tokens.',
    );
  }

  return sign(
    {
      id: 1,
      email: 'e2e-test@legacysports.dev',
      username: 'e2e-test',
      accessLevel: 'admin',
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    { algorithm: 'HS256', expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Local: device-flow with caching
// ---------------------------------------------------------------------------

async function resolveLocalToken(): Promise<string> {
  const cached = loadCachedToken();
  if (cached) {
    console.log(`[E2E Auth] Using cached token for ${cached.email}`);
    return cached.jwt;
  }

  console.log('[E2E Auth] No valid cached token — starting device flow…');
  return runDeviceFlow();
}

function loadCachedToken(): TokenCache | null {
  try {
    if (!fs.existsSync(TOKEN_CACHE_PATH)) return null;

    const raw = fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8');
    const cache = JSON.parse(raw) as TokenCache;

    // Check expiration with a 5-minute buffer
    if (cache.expiresAt - 5 * 60 * 1000 < Date.now()) {
      console.log('[E2E Auth] Cached token expired — will re-authenticate');
      return null;
    }

    // Basic JWT format sanity check
    if (!cache.jwt || cache.jwt.split('.').length !== 3) return null;

    return cache;
  } catch {
    return null;
  }
}

function cacheToken(jwt: string, email: string, expiresInSeconds: number) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const cache: TokenCache = {
    jwt,
    email,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2), {
    mode: 0o600, // owner-only
  });
}

// ---------------------------------------------------------------------------
// Device flow
// ---------------------------------------------------------------------------

async function runDeviceFlow(): Promise<string> {
  const oauthUrl = resolveOAuthUrl();

  // Step 1 — request device authorization
  const authResponse = await fetch(`${oauthUrl}/device/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_type: 'cli',
      device_name: `E2E-${process.env.COMPUTERNAME || 'test'}`,
    }),
  });

  if (!authResponse.ok) {
    throw new Error(
      `Device auth request failed (${authResponse.status}): ${await authResponse.text()}`,
    );
  }

  const deviceAuth = (await authResponse.json()) as DeviceAuthResponse;

  // Step 2 — prompt user to authorize
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🔐  E2E Authentication Required                    ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Code: ${deviceAuth.user_code.padEnd(46)}║`);
  console.log(
    `║  URL:  ${deviceAuth.verification_uri_complete.substring(0, 46).padEnd(46)}║`,
  );
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Try to open the browser automatically (Windows / macOS / Linux)
  openBrowser(deviceAuth.verification_uri_complete);

  // Step 3 — poll for token
  const pollIntervalMs = (deviceAuth.interval || 5) * 1000;
  const deadline = Date.now() + deviceAuth.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    const tokenResponse = await fetch(`${oauthUrl}/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceAuth.device_code }),
    });

    if (tokenResponse.status === 200) {
      const data = (await tokenResponse.json()) as DeviceTokenResponse;

      // Cache for future runs — assume 24h if not specified
      cacheToken(data.jwt, data.user.email, 24 * 60 * 60);

      console.log(
        `[E2E Auth] ✅ Authenticated as ${data.user.email} (${data.user.accessLevel})`,
      );
      return data.jwt;
    }

    // 428 = authorization_pending — keep polling
    if (tokenResponse.status === 428) continue;

    // Anything else is an error
    const errorBody = await tokenResponse.text().catch(() => 'unknown');
    throw new Error(
      `Device flow token request failed (${tokenResponse.status}): ${errorBody}`,
    );
  }

  throw new Error(
    'Device flow timed out — user did not complete authorization in time.',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveOAuthUrl(): string {
  return (
    process.env.VITE_OAUTH_PROXY_URL ||
    process.env.OAUTH_PROXY_URL ||
    'https://api.legacysports.dev/oauth'
  );
}

function openBrowser(url: string) {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    // Silently ignore — the URL is printed for manual copy-paste
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStorageState(origin: string, jwt: string) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const storageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          {
            name: 'auth_jwt',
            value: jwt,
          },
        ],
      },
    ],
  };

  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));
}

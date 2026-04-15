import type { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { E2EJwtUtil } from './utils/jwt';

/**
 * Playwright global setup for E2E authentication.
 *
 * Two modes:
 *   CI    – Signs a JWT with a hardcoded dev-only secret (E2E_SIGNING_SECRET).
 *           The hermetic E2E tests mock every network call with
 *           `route.fulfill()` — there is no backend in CI — so the signature
 *           is never validated. The JWT payload is only used for client-side
 *           storage state (cookie + localStorage user profile). The
 *           production JWT signing key is intentionally NOT used here.
 *   Local – Uses the OAuth device flow so the developer authenticates with
 *           their real Google account. The resulting token is cached in
 *           `.auth/token-cache.json` so you only need to re-authenticate
 *           when the token expires.
 *
 * The generated JWT is saved as a Playwright `storageState` file (.auth/state.json)
 * which is automatically loaded into every browser context via the Playwright config.
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'state.json');
const TOKEN_CACHE_PATH = path.join(AUTH_DIR, 'token-cache.json');

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
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4280';

  writeStorageState(baseURL, jwt);

  console.log('[E2E Auth] ✅ storageState written to .auth/state.json');
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

async function resolveAuthToken(): Promise<string> {
  // CI mode — sign a JWT locally with the hardcoded hermetic-test secret.
  // No real backend validates this; the signature only needs to produce a
  // syntactically valid JWT for Playwright storageState.
  if (process.env.CI || process.env.E2E_AUTH_MODE === 'ci') {
    console.log('[E2E Auth] CI mode — signing hermetic JWT');
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
  return E2EJwtUtil.generateJwt({
    id: 1,
    email: 'e2e-test@legacysports.dev',
    accessLevel: 'admin',
    expiration: '24h',
  });
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

/** Single source of truth for the hermetic CSRF token in global-setup storageState. */
const E2E_CSRF_TOKEN = 'e2e-csrf-token';

function writeStorageState(origin: string, jwt: string) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Decode user profile from the JWT payload for the frontend's cached profile
  const payload = JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString(),
  ) as {
    id?: number;
    email?: string;
    username?: string;
    accessLevel?: string;
    exp?: number;
  };

  const userProfile = {
    id: payload.id ?? 1,
    email: payload.email ?? 'user@test.com',
    username: payload.username ?? 'testuser',
    accessLevel: payload.accessLevel ?? 'none',
  };

  const expiry = payload.exp ?? Math.floor(Date.now() / 1000) + 3600;
  const url = new URL(origin);

  const storageState = {
    cookies: [
      {
        name: 'ls_jwt',
        value: jwt,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: false, // E2E uses http://localhost
        sameSite: 'Lax' as const,
        expires: expiry,
      },
      {
        name: 'ls_csrf',
        value: E2E_CSRF_TOKEN,
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
        expires: expiry,
      },
    ],
    origins: [
      {
        origin,
        localStorage: [
          {
            name: 'ls_user_profile',
            value: JSON.stringify(userProfile),
          },
          {
            name: 'ls_token_expiry',
            value: String(expiry),
          },
          {
            // getCsrfToken() checks ls_csrf_token in localStorage first (before
            // document.cookie). Pre-seeding this key ensures the CSRF header is
            // always sent correctly without falling back to cookie parsing.
            name: 'ls_csrf_token',
            value: E2E_CSRF_TOKEN,
          },
        ],
      },
    ],
  };

  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));
}

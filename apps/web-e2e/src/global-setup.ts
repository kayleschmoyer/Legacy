import type { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { E2EJwtUtil } from './utils/jwt';
// Type-only import resolves to the sibling scripts/e2e-auth.d.ts — the
// runtime is .mjs (loaded dynamically below) but the type surface is fully
// declared, so the cast in resolveAuthToken() is type-safe, not `any`.
type E2EAuthModule = typeof import('../../../scripts/e2e-auth');

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
 *           their real Google account. The resulting token is cached at a
 *           machine-wide, user-scoped path (~/.legacy-sports/e2e-token.json)
 *           so every worktree on the same machine reuses one cached JWT
 *           until it expires (LS-4679). Mint or refresh the token without
 *           launching Playwright via `make e2e-auth`.
 *
 * The generated JWT is saved as a Playwright `storageState` file (.auth/state.json)
 * which is automatically loaded into every browser context via the Playwright config.
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'state.json');

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

  // Local mode — device flow with machine-wide caching. Device-flow + cache
  // primitives live in scripts/e2e-auth.mjs so the standalone `make e2e-auth`
  // CLI and Playwright share one implementation. Types come from the sibling
  // scripts/e2e-auth.d.ts so this import is fully type-checked (LS-4679).
  console.log('[E2E Auth] Local mode — using device flow (cached if valid)');
  const sharedModulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'e2e-auth.mjs',
  );
  const mod = (await import(
    /* webpackIgnore: true */ sharedModulePath
  )) as E2EAuthModule;
  return mod.resolveLocalToken();
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
// Helpers
// ---------------------------------------------------------------------------

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

  // Fixed far-future expiry (2100-01-01) so the storage state JWT is
  // deterministic across runs and never expires mid-suite. Tests should
  // not depend on wall-clock time — see apps/web-e2e/src/mocks/time.ts.
  const FAR_FUTURE_EPOCH_SEC = 4_102_444_800;
  const expiry = payload.exp ?? FAR_FUTURE_EPOCH_SEC;
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

import { SecureStorageProvider } from '@legacy-sports/shared-components';

import { Secret } from '../AuthHooks';

/**
 * Test-only session-injection harness (LS-8454, AC4).
 *
 * Native auth is a secure-store JWT: on cold start the `(app)` route group calls
 * `useCurrentUserInfo()` -> `getJwt()` -> `SecureStorageProvider.getItem(INTERNAL_JWT)`
 * and redirects to `/login` when nothing is stored. To drive the real session
 * lifecycle in automated tests we need a build path where auth is *real* — i.e.
 * NOT `EXPO_PUBLIC_BYPASS_AUTH`, which short-circuits `useCurrentUserInfo()` to a
 * fake `LOCAL_USER` and never touches secure storage or the guard's real
 * `getJwt` path. This module is that seam: it writes/clears a genuine secure-store
 * JWT so the guard, `getJwt`, and the biometric gate all exercise production code.
 *
 * Consumers:
 *  - Unit specs today: `sessionLifecycle.spec.tsx`, `BiometricAuth.spec.ts`.
 *  - The future `AppiumNativeDriver` (LS-8447) + emulator CI job (LS-8450), which
 *    call `injectTestSession` over a dev-only build seam to reach an authenticated
 *    state without a full OAuth round-trip. The build-path design and the emulator
 *    biometric-simulation approach are documented in
 *    `apps/app-e2e/SESSION-LIFECYCLE-E2E.md`.
 *
 * Safety: injecting a forged session must be impossible in a shipped build, so
 * every entry point throws when `NODE_ENV === 'production'` — the same guard
 * `useCurrentUserInfo()` applies to `EXPO_PUBLIC_BYPASS_AUTH`. Nothing in the app
 * runtime imports this module, so it is never bundled into a production build.
 */

function assertNotProduction(operation: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Test session-injection (${operation}) must never run in a production ` +
        'build. This harness is for automated tests and dev-only E2E builds.',
    );
  }
}

/** Claims embedded in a test JWT. Mirrors the fields `getJwt` decodes. */
export interface TestSessionClaims {
  id: number;
  username: string;
  email?: string | null;
  isAdmin?: boolean;
  about?: string | null;
  subscriptionTier?: 'free' | 'premium';
}

export interface BuildTestJwtOptions {
  /**
   * Milliseconds until the token expires, measured from now. Defaults to one
   * hour. Pass a negative value to build an already-expired token (used to
   * assert that the biometric gate and `getStoredJwtIfValid` reject stale
   * sessions).
   */
  expiresInMs?: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Build a decodable (unsigned) JWT for tests and dev-only E2E builds. The
 * signature segment is a placeholder: native auth intentionally does not verify
 * JWT signatures on-device (the server re-validates every API call), so a
 * decode-only token is sufficient to model a persisted session. Never call this
 * from production code — see `assertNotProduction`.
 */
export function buildTestJwt(
  claims: TestSessionClaims,
  options: BuildTestJwtOptions = {},
): string {
  const { expiresInMs = ONE_HOUR_MS } = options;
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      ...claims,
      exp: Math.floor((Date.now() + expiresInMs) / 1000),
    }),
  );
  return `${header}.${payload}.test-signature`;
}

/**
 * Persist a session JWT into secure storage — the real-auth equivalent of a
 * completed OAuth login. After this resolves, a fresh app launch reads the token
 * via `getJwt` and lands authenticated (no `/login` redirect).
 */
export async function injectTestSession(jwt: string): Promise<void> {
  assertNotProduction('injectTestSession');
  await SecureStorageProvider.setItem(Secret.INTERNAL_JWT, jwt);
}

/**
 * Clear the persisted session — the storage half of a logout. After this
 * resolves, a fresh app launch finds no token and redirects to `/login`. Removes
 * both secrets `resetToken` clears so the harness stays in sync with the real
 * logout path.
 */
export async function clearTestSession(): Promise<void> {
  assertNotProduction('clearTestSession');
  await SecureStorageProvider.removeItem(Secret.INTERNAL_JWT);
  await SecureStorageProvider.removeItem(Secret.GOOGLE_JWT);
}

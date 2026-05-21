/**
 * Type declarations for scripts/e2e-auth.mjs.
 *
 * Allows TypeScript callers (apps/web-e2e/src/global-setup.ts) to import the
 * device-flow + cache primitives with full type safety. Keeps the runtime in
 * .mjs (no tsx required for the standalone `make e2e-auth` CLI) while still
 * giving the Playwright global-setup a typed view of its exports.
 */

export interface TokenCache {
  jwt: string;
  email: string;
  /** epoch ms */
  expiresAt: number;
}

export const CACHE_DIR: string;
export const CACHE_PATH: string;

export function loadCachedToken(): TokenCache | null;
export function cacheToken(
  jwt: string,
  email: string,
  expiresInSeconds: number,
): void;
export function resolveOAuthUrl(): string;

/** Runs the OAuth device flow. Resolves to a JWT; throws on failure or timeout. */
export function runDeviceFlow(): Promise<string>;

/** Returns a cached JWT if fresh, else drives the device flow. */
export function resolveLocalToken(): Promise<string>;

#!/usr/bin/env node
/**
 * scripts/e2e-auth.mjs
 *
 * Standalone CLI for the web-e2e OAuth device flow. Mints (or refreshes) a
 * real Google-backed JWT and caches it at a machine-wide, user-scoped path so
 * every worktree on the same machine reuses the same cached token.
 *
 * Cache path:
 *   ~/.legacy-sports/e2e-token.json                       (Unix/macOS)
 *   %USERPROFILE%\.legacy-sports\e2e-token.json           (Windows)
 *
 * File mode is 0o600 (owner-only). Tokens are considered expired 5 minutes
 * before their actual expiry to leave headroom for slow Playwright startup.
 *
 * Usage:
 *   node scripts/e2e-auth.mjs        # reuse cache if valid, else device flow
 *   make e2e-auth                    # same, via Make
 *
 * Exit code 0 on success (already authenticated OR device flow completed),
 * non-zero on failure.
 *
 * Modeled on scripts/mcp-auth.mjs. The device-flow + cache primitives are
 * also exported and imported by apps/web-e2e/src/global-setup.ts so the
 * Playwright suite and the CLI share one implementation. Types for those
 * exports live in scripts/e2e-auth.d.ts so the TS import in global-setup.ts
 * is type-safe (LS-4679).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {object} TokenCache
 * @property {string} jwt
 * @property {string} email
 * @property {number} expiresAt  epoch ms
 */

/**
 * @typedef {object} DeviceAuthResponse
 * @property {string} device_code
 * @property {string} user_code
 * @property {string} verification_uri
 * @property {string} verification_uri_complete
 * @property {number} expires_in
 * @property {number} interval
 */

/**
 * @typedef {object} DeviceTokenUser
 * @property {number} id
 * @property {string} email
 * @property {string} username
 * @property {string} accessLevel
 */

/**
 * @typedef {object} DeviceTokenResponse
 * @property {string} jwt
 * @property {DeviceTokenUser} user
 * @property {string} [refreshToken]
 */

// ── LOGGER ────────────────────────────────────────────────────────────────────
// Local LOGGER stub. The project rule (AGENTS.md) is to use LOGGER from
// @legacy-sports/logging, but this is a standalone build-time script run via
// `node scripts/e2e-auth.mjs` — it cannot import workspace packages. Matches
// the stub used by scripts/mcp-auth.mjs so log shape stays consistent across
// build-time scripts. `error` accepts a trailing Error instance (printed with
// its stack) so call sites that pass an Error directly match the contract of
// `@legacy-sports/logging`'s LOGGER.error(message, err).
const LOGGER = {
  /** @param {...unknown} args */
  info: (...args) => process.stdout.write(args.join(' ') + '\n'),
  /** @param {...unknown} args */
  warn: (...args) => process.stderr.write(args.join(' ') + '\n'),
  /**
   * @param {string} message
   * @param {unknown} [err]
   */
  error: (message, err) => {
    const tail =
      err instanceof Error
        ? `\n${err.stack ?? err.message}`
        : err !== undefined
          ? ` ${String(err)}`
          : '';
    process.stderr.write(`${message}${tail}\n`);
  },
};

// ── Cache path ────────────────────────────────────────────────────────────────

export const CACHE_DIR = path.join(os.homedir(), '.legacy-sports');
export const CACHE_PATH = path.join(CACHE_DIR, 'e2e-token.json');

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ── Cache read/write ──────────────────────────────────────────────────────────

/** @returns {TokenCache | null} */
export function loadCachedToken() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;

    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const cache = /** @type {TokenCache} */ (JSON.parse(raw));

    if (cache.expiresAt - EXPIRY_BUFFER_MS < Date.now()) return null;
    if (!cache.jwt || cache.jwt.split('.').length !== 3) return null;

    return cache;
  } catch {
    return null;
  }
}

/**
 * @param {string} jwt
 * @param {string} email
 * @param {number} expiresInSeconds
 */
export function cacheToken(jwt, email, expiresInSeconds) {
  /** @type {TokenCache} */
  const cache = {
    jwt,
    email,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    // Cache write failures are non-fatal — the caller already has a valid
    // JWT in memory and Playwright can proceed for this run. Subsequent runs
    // will re-do the device flow.
    LOGGER.warn(
      `[E2E Auth] Failed to write token cache at ${CACHE_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Device flow ───────────────────────────────────────────────────────────────

/** @returns {string} */
export function resolveOAuthUrl() {
  return (
    process.env.VITE_OAUTH_PROXY_URL ||
    process.env.OAUTH_PROXY_URL ||
    'https://api.legacysports.dev/oauth'
  );
}

/**
 * Opens the device-flow verification URL in the user's browser.
 *
 * Hardened against command injection: rejects any URL that does not match
 * `https://<host>/<path>` with a safe character set, and uses spawnSync with
 * an argv array (no shell) so URL contents are never re-parsed by a shell.
 * Failures are silently swallowed — the URL is also printed to stdout for
 * manual copy-paste.
 *
 * @param {string} url
 */
function openBrowser(url) {
  // Defense in depth: only allow plain https URLs to be passed to the OS
  // opener. The device-flow URL comes from a trusted OAuth proxy, but the
  // URL field is still controlled-input-shaped, so we validate before
  // handing it off to any spawn.
  if (!/^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(url)) {
    return;
  }

  try {
    const platform = process.platform;
    if (platform === 'win32') {
      // `cmd /c start "" <url>` — argv form (shell:false). cmd parses its
      // own argv into a command line; the empty quoted string is `start`'s
      // window-title argument. windowsVerbatimArguments avoids Node's
      // back-tick-escape pass that would otherwise mangle the URL.
      spawnSync('cmd', ['/c', 'start', '""', url], {
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      });
    } else {
      const opener = platform === 'darwin' ? 'open' : 'xdg-open';
      spawnSync(opener, [url], { stdio: 'ignore' });
    }
  } catch {
    // Silently ignore — the URL is printed for manual copy-paste.
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the OAuth device flow end-to-end:
 *   1. POST /device/authorize → user_code + verification_uri
 *   2. Print code + URL, attempt to open browser
 *   3. Poll /device/token until user completes the handshake
 *   4. Cache the resulting JWT (24h default TTL)
 *
 * Returns the JWT string on success; throws on failure.
 *
 * @returns {Promise<string>}
 */
export async function runDeviceFlow() {
  const oauthUrl = resolveOAuthUrl();

  const authResponse = await fetch(`${oauthUrl}/device/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_type: 'cli',
      device_name: `E2E-${process.env.COMPUTERNAME || os.hostname() || 'test'}`,
    }),
  });

  if (!authResponse.ok) {
    throw new Error(
      `Device auth request failed (${authResponse.status}): ${await authResponse.text()}`,
    );
  }

  const deviceAuth = /** @type {DeviceAuthResponse} */ (
    await authResponse.json()
  );

  LOGGER.info('');
  LOGGER.info('╔══════════════════════════════════════════════════════╗');
  LOGGER.info('║  🔐  E2E Authentication Required                    ║');
  LOGGER.info('╠══════════════════════════════════════════════════════╣');
  LOGGER.info(`║  Code: ${String(deviceAuth.user_code).padEnd(46)}║`);
  LOGGER.info(
    `║  URL:  ${String(deviceAuth.verification_uri_complete).substring(0, 46).padEnd(46)}║`,
  );
  LOGGER.info('╚══════════════════════════════════════════════════════╝');
  LOGGER.info('');

  openBrowser(deviceAuth.verification_uri_complete);

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
      const data = /** @type {DeviceTokenResponse} */ (
        await tokenResponse.json()
      );
      cacheToken(data.jwt, data.user.email, 24 * 60 * 60);
      LOGGER.info(
        `[E2E Auth] ✅ Authenticated as ${data.user.email} (${data.user.accessLevel})`,
      );
      return data.jwt;
    }

    if (tokenResponse.status === 428) continue;

    const errorBody = await tokenResponse.text().catch(() => 'unknown');
    throw new Error(
      `Device flow token request failed (${tokenResponse.status}): ${errorBody}`,
    );
  }

  throw new Error(
    'Device flow timed out — user did not complete authorization in time.',
  );
}

/**
 * Returns a valid JWT. Uses the cache if fresh; otherwise drives the device
 * flow. This is the same entry point used by Playwright's global-setup.
 *
 * @returns {Promise<string>}
 */
export async function resolveLocalToken() {
  const cached = loadCachedToken();
  if (cached) {
    LOGGER.info(`[E2E Auth] Using cached token for ${cached.email}`);
    return cached.jwt;
  }

  LOGGER.info('[E2E Auth] No valid cached token — starting device flow…');
  return runDeviceFlow();
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const cached = loadCachedToken();
  if (cached) {
    LOGGER.info(`already authenticated as ${cached.email}`);
    LOGGER.info(`cache: ${CACHE_PATH}`);
    return;
  }

  LOGGER.info('No valid cached token — starting device flow…');
  LOGGER.info(`cache: ${CACHE_PATH}`);
  await runDeviceFlow();
}

// Only invoke main() when executed directly (not when imported as a module).
const invokedDirectly =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (invokedDirectly) {
  main().catch((err) => {
    LOGGER.error(
      '[E2E Auth] failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    process.exit(1);
  });
}

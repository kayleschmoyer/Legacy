import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { state } from '../state.js';
import { jsonResult } from '../format.js';
import { launchChromium } from '../launch-chromium.js';
import type { ToolResult } from '../types.js';

export interface DevLoginParams {
  identity?: 'e2e-cached';
  url?: string;
  port?: number;
}

export const CACHE_PATH = path.join(
  os.homedir(),
  '.legacy-sports',
  'e2e-token.json',
);
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface TokenCache {
  jwt: string;
  email: string;
  expiresAt: number;
}

/** Mirrors scripts/e2e-auth.mjs's loadCachedToken — same cache file, same validity rules. */
export function loadCachedToken(cachePath = CACHE_PATH): TokenCache | null {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(raw) as TokenCache;
    if (cache.expiresAt - EXPIRY_BUFFER_MS < Date.now()) return null;
    if (!cache.jwt || cache.jwt.split('.').length !== 3) return null;
    return cache;
  } catch {
    return null;
  }
}

/** Decodes the JWT payload for profile fields only — never returns the token itself. */
export function decodeJwtPayload(jwt: string) {
  const payload = JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString(),
  ) as {
    id?: number;
    email?: string;
    username?: string;
    accessLevel?: string;
    exp?: number;
  };
  return payload;
}

/**
 * Cookie domain/sameSite/secure logic for a given page origin, mirroring
 * buildIntegrationStorageState's rules (leading-dot parent domain for real
 * hosts so cookies reach API subdomains too; bare hostname for
 * localhost/IP/non-FQDN hosts, since a leading dot is invalid there).
 */
export function resolveCookieAttrs(hostname: string, protocol: string) {
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isHostOnly =
    hostname === 'localhost' || !hostname.includes('.') || isIpAddress;
  const domain = isHostOnly ? hostname : `.${hostname}`;
  const sameSite = protocol === 'https:' ? ('None' as const) : ('Lax' as const);
  const secure = protocol === 'https:';
  return { domain, sameSite, secure };
}

/**
 * Authenticates the shared browser session against a local dev server using the
 * cached e2e JWT (~/.legacy-sports/e2e-token.json, minted by `make e2e-auth`),
 * mirroring apps/web-e2e's buildIntegrationStorageState. The JWT is read
 * server-side and applied via Playwright's context.addCookies (which, like CDP
 * Network.setCookie, operates outside the page-JS sandbox and can set the
 * httpOnly ls_jwt cookie) plus page.evaluate for the accompanying localStorage
 * keys — it is never included in the tool result (LS-9437).
 *
 * @param cachePath override for tests only — the MCP tool always uses the default CACHE_PATH.
 */
export async function devLogin(
  params: DevLoginParams,
  cachePath = CACHE_PATH,
): Promise<ToolResult> {
  const { url, port } = params;

  const cache = loadCachedToken(cachePath);
  if (!cache) {
    return jsonResult(
      {
        ok: false,
        error: 'No valid cached e2e token found.',
        remedy:
          'Run `make e2e-auth` in an interactive terminal to mint/refresh the token cache, then retry.',
      },
      true,
    );
  }

  let targetUrl = url;
  if (port && (!targetUrl || !targetUrl.startsWith('http'))) {
    targetUrl = `http://localhost:${port}${targetUrl && targetUrl.startsWith('/') ? targetUrl : (targetUrl ?? '/')}`;
  }

  try {
    const payload = decodeJwtPayload(cache.jwt);
    const userProfile = {
      id: payload.id ?? 1,
      email: payload.email ?? cache.email,
      username: payload.username ?? 'testuser',
      accessLevel: payload.accessLevel ?? 'none',
    };
    const expiry = payload.exp ?? Math.floor(cache.expiresAt / 1000);

    // Lazy-initialize browser/context/page, same convention as navigate().
    if (!state.browser) {
      state.browser = await launchChromium();
    }
    if (!state.context) {
      state.context = await state.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }
    if (!state.page || state.page.isClosed()) {
      state.page = await state.context.newPage();
    }

    if (targetUrl) {
      await state.page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    }

    const currentUrl = new URL(state.page.url());
    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      return jsonResult(
        {
          ok: false,
          error: `No page loaded (current URL "${currentUrl.href}" is not http(s)).`,
          remedy:
            'Pass url or port to navigate first, or call browser_navigate before browser_dev_login.',
        },
        true,
      );
    }

    const {
      domain: cookieDomain,
      sameSite,
      secure,
    } = resolveCookieAttrs(currentUrl.hostname, currentUrl.protocol);

    await state.context.addCookies([
      {
        name: 'ls_jwt',
        value: cache.jwt,
        domain: cookieDomain,
        path: '/',
        httpOnly: true,
        secure,
        sameSite,
        expires: expiry,
      },
      {
        name: 'ls_csrf',
        value: 'integration-csrf-token',
        domain: cookieDomain,
        path: '/',
        httpOnly: false,
        secure,
        sameSite,
        expires: expiry,
      },
    ]);

    await state.page.evaluate(
      ({ userProfile, expiry }) => {
        try {
          localStorage.setItem('ls_user_profile', JSON.stringify(userProfile));
          localStorage.setItem('ls_token_expiry', String(expiry));
          localStorage.setItem('ls_csrf_token', 'integration-csrf-token');
        } catch {
          // localStorage can throw (private browsing, quota exceeded); the
          // ls_jwt cookie alone is enough for the backend to authenticate
          // the session, so a localStorage failure here is non-fatal.
        }
      },
      { userProfile, expiry },
    );

    // Reload so the newly-set ls_jwt cookie is sent on the next request and
    // the app's auth bootstrap picks up the localStorage profile.
    await state.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });

    return jsonResult({
      ok: true,
      identity: 'e2e-cached',
      email: userProfile.email,
      username: userProfile.username,
      expiresAt: cache.expiresAt,
      url: state.page.url(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResult(
      {
        ok: false,
        error: `Dev login failed: ${message}`,
        remedy:
          'Ensure the dev server is running (browser_dev_start) and reachable at the given url/port.',
      },
      true,
    );
  }
}

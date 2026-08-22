import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  decodeJwtPayload,
  devLogin,
  EXPIRY_BUFFER_MS,
  loadCachedToken,
  resolveCookieAttrs,
} from './dev-login.js';
import { state } from '../state.js';
import type { ToolResult } from '../types.js';

/** A syntactically valid (unsigned) JWT with the given payload. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.`;
}

async function withTempCache(
  contents: string | null,
  fn: (cachePath: string) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'dev-login-'));
  const cachePath = join(dir, 'e2e-token.json');
  try {
    if (contents !== null) writeFileSync(cachePath, contents);
    await fn(cachePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadCachedToken', () => {
  it('returns null when the cache file does not exist', async () => {
    await withTempCache(null, (cachePath) => {
      expect(loadCachedToken(cachePath)).toBeNull();
    });
  });

  it('returns the cache when the token is well-formed and not expired', async () => {
    const jwt = fakeJwt({ id: 1 });
    const cache = {
      jwt,
      email: 'e2e@test.com',
      expiresAt: Date.now() + 3_600_000,
    };
    await withTempCache(JSON.stringify(cache), (cachePath) => {
      expect(loadCachedToken(cachePath)).toEqual(cache);
    });
  });

  it('returns null when the token is within the expiry buffer', async () => {
    const jwt = fakeJwt({ id: 1 });
    const cache = {
      jwt,
      email: 'e2e@test.com',
      expiresAt: Date.now() + EXPIRY_BUFFER_MS - 1000,
    };
    await withTempCache(JSON.stringify(cache), (cachePath) => {
      expect(loadCachedToken(cachePath)).toBeNull();
    });
  });

  it('returns null when the jwt is malformed (not 3 dot-separated segments)', async () => {
    const cache = {
      jwt: 'not-a-real-jwt',
      email: 'e2e@test.com',
      expiresAt: Date.now() + 3_600_000,
    };
    await withTempCache(JSON.stringify(cache), (cachePath) => {
      expect(loadCachedToken(cachePath)).toBeNull();
    });
  });

  it('returns null on invalid JSON rather than throwing', async () => {
    await withTempCache('{not json', (cachePath) => {
      expect(loadCachedToken(cachePath)).toBeNull();
    });
  });
});

describe('decodeJwtPayload', () => {
  it('decodes the payload segment without validating a signature', () => {
    const jwt = fakeJwt({
      id: 42,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'premium',
      exp: 1_800_000_000,
    });
    expect(decodeJwtPayload(jwt)).toEqual({
      id: 42,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'premium',
      exp: 1_800_000_000,
    });
  });
});

/** Extracts the text payload from a jsonResult ToolResult for assertions. */
function resultJson(result: ToolResult): Record<string, unknown> {
  const first = result.content[0];
  if (first.type !== 'text') throw new Error('expected a text content block');
  return JSON.parse(first.text) as Record<string, unknown>;
}

describe('devLogin', () => {
  afterEach(() => {
    state.browser = null;
    state.context = null;
    state.page = null;
  });

  /** A fake Page/BrowserContext pair that records the Playwright calls devLogin makes. */
  function fakePlaywrightState(initialUrl: string) {
    let currentUrl = initialUrl;
    const addCookies = jest.fn((..._args: unknown[]) => Promise.resolve());
    const evaluate = jest.fn((..._args: unknown[]) => Promise.resolve());
    const goto = jest.fn((...args: unknown[]) => {
      currentUrl = args[0] as string;
      return Promise.resolve(null);
    });
    const reload = jest.fn((..._args: unknown[]) => Promise.resolve());
    const page = {
      isClosed: () => false,
      url: () => currentUrl,
      goto,
      evaluate,
      reload,
    };
    const context = { addCookies };
    return { page, context, addCookies, evaluate, goto, reload };
  }

  it('navigates, sets cookies + localStorage, and reloads on success', async () => {
    const { page, context, addCookies, evaluate, goto, reload } =
      fakePlaywrightState('about:blank');
    state.browser = {} as never;
    state.context = context as never;
    state.page = page as never;

    const jwt = fakeJwt({
      id: 7,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'premium',
      exp: 1_800_000_000,
    });
    const cache = {
      jwt,
      email: 'user@test.com',
      expiresAt: Date.now() + 3_600_000,
    };

    await withTempCache(JSON.stringify(cache), async (cachePath) => {
      const result = await devLogin(
        { url: 'http://localhost:4300/dashboard' },
        cachePath,
      );
      const payload = resultJson(result);

      expect(payload).toEqual({
        ok: true,
        identity: 'e2e-cached',
        email: 'user@test.com',
        username: 'testuser',
        expiresAt: cache.expiresAt,
        url: 'http://localhost:4300/dashboard',
      });

      expect(goto).toHaveBeenCalledWith(
        'http://localhost:4300/dashboard',
        expect.objectContaining({ waitUntil: 'domcontentloaded' }),
      );

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'ls_jwt', value: jwt, httpOnly: true }),
        expect.objectContaining({ name: 'ls_csrf', httpOnly: false }),
      ]);

      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('builds the URL from port when url is omitted', async () => {
    const { page, context, goto } = fakePlaywrightState('about:blank');
    state.browser = {} as never;
    state.context = context as never;
    state.page = page as never;

    const jwt = fakeJwt({ id: 1 });
    const cache = {
      jwt,
      email: 'e2e@test.com',
      expiresAt: Date.now() + 3_600_000,
    };

    await withTempCache(JSON.stringify(cache), async (cachePath) => {
      await devLogin({ port: 4300 }, cachePath);
      expect(goto).toHaveBeenCalledWith(
        'http://localhost:4300/',
        expect.anything(),
      );
    });
  });

  it('fails with a remedy when no page has been navigated (no url/port, no prior page)', async () => {
    const { page, context } = fakePlaywrightState('about:blank');
    state.browser = {} as never;
    state.context = context as never;
    state.page = page as never;

    const jwt = fakeJwt({ id: 1 });
    const cache = {
      jwt,
      email: 'e2e@test.com',
      expiresAt: Date.now() + 3_600_000,
    };

    await withTempCache(JSON.stringify(cache), async (cachePath) => {
      const result = await devLogin({}, cachePath);
      const payload = resultJson(result);
      expect(result.isError).toBe(true);
      expect(payload.ok).toBe(false);
      expect(payload.remedy).toMatch(/browser_navigate/);
    });
  });

  it('fails with a make e2e-auth remedy when no cached token exists', async () => {
    await withTempCache(null, async (cachePath) => {
      const result = await devLogin({ port: 4300 }, cachePath);
      const payload = resultJson(result);
      expect(result.isError).toBe(true);
      expect(payload.ok).toBe(false);
      expect(payload.remedy).toMatch(/make e2e-auth/);
    });
  });
});

describe('resolveCookieAttrs', () => {
  it('uses the bare hostname for localhost', () => {
    expect(resolveCookieAttrs('localhost', 'http:')).toEqual({
      domain: 'localhost',
      sameSite: 'Lax',
      secure: false,
    });
  });

  it('uses the bare hostname for an IP address', () => {
    expect(resolveCookieAttrs('127.0.0.1', 'http:')).toEqual({
      domain: '127.0.0.1',
      sameSite: 'Lax',
      secure: false,
    });
  });

  it('uses a leading-dot parent domain for a real FQDN over https', () => {
    expect(resolveCookieAttrs('legacy-fantasy.com', 'https:')).toEqual({
      domain: '.legacy-fantasy.com',
      sameSite: 'None',
      secure: true,
    });
  });
});

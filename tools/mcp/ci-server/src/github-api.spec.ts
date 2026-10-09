import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { generateKeyPairSync } from 'node:crypto';

// http-retry.ts has no import.meta / auth dependencies, so it compiles cleanly
// under the CommonJS spec tsconfig. We test the retry logic here rather than
// importing github-api.ts directly.
import {
  fetchWithRetry,
  formatGithubApiError,
  isAlreadyRunningError,
  isTimeoutError,
  isTransientServerError,
  NetworkFetchError,
  withRetryOnAlreadyRunning,
} from './http-retry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    text: jest.fn<() => Promise<string>>().mockResolvedValue(body),
    arrayBuffer: jest
      .fn<() => Promise<ArrayBuffer>>()
      .mockResolvedValue(new ArrayBuffer(4)),
  } as unknown as Response;
}

const FAKE_URL = 'https://api.github.com/repos/owner/repo/actions/jobs/1/logs';
const FAKE_OPTS: RequestInit = { headers: { Authorization: 'Bearer tok' } };
const noopLog = jest.fn<(res: Response, label: string) => void>();

describe('fetchWithRetry (githubGetArrayBuffer retry logic)', () => {
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = mockFetch;
    mockFetch.mockReset();
    noopLog.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('surfaces the undici cause instead of a bare "fetch failed" (LS-10250)', async () => {
    const cause = Object.assign(
      new Error('Proxy response (403) !== 200 when HTTP Tunneling'),
      { code: 'UND_ERR_PRX_TLS' },
    );
    mockFetch.mockRejectedValue(new TypeError('fetch failed', { cause }));

    const err = await fetchWithRetry(
      FAKE_URL,
      FAKE_OPTS,
      noopLog,
      'GET /actions/jobs/1/logs (arraybuffer)',
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NetworkFetchError);
    const message = (err as Error).message;
    expect(message).toContain('GET /actions/jobs/1/logs (arraybuffer)');
    expect(message).toContain('fetch failed');
    expect(message).toContain('Proxy response (403)');
    expect(message).toContain('UND_ERR_PRX_TLS');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rethrows abort/timeout errors unchanged', async () => {
    const abort = Object.assign(new Error('timed out'), {
      name: 'TimeoutError',
    });
    mockFetch.mockRejectedValue(abort);

    await expect(
      fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test'),
    ).rejects.toBe(abort);
  });

  it('returns arrayBuffer on first-attempt success', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 502 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 503', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 504', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(504))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 410 and succeeds once the log archive becomes available (LS-8435)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(410, '{"message":"Server Error"}'))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after MAX_ATTEMPTS exhausted on a persistent 410, message includes attempt count', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(410, '{"message":"Server Error"}'),
    );

    const assertion = expect(
      fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test'),
    ).rejects.toThrow(/GitHub API 410.*attempt 3\/3/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws after MAX_ATTEMPTS exhausted, message includes attempt count', async () => {
    mockFetch.mockResolvedValue(makeResponse(502, 'bad gateway'));

    // Attach the rejection handler before advancing timers so there is no
    // unhandled rejection window while the retry loop runs.
    const assertion = expect(
      fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test'),
    ).rejects.toThrow(/attempt 3\/3/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-transient error (404) — throws immediately', async () => {
    mockFetch.mockResolvedValue(makeResponse(404, 'not found'));

    await expect(
      fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test'),
    ).rejects.toThrow(/GitHub API 404/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff (2^attempt seconds) when retry-after absent', async () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    mockFetch
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    await resultPromise;

    // attempt 1 → 2^1 = 2000ms; attempt 2 → 2^2 = 4000ms
    const backoffDelays = setSpy.mock.calls.map((c) => c[1]);
    expect(backoffDelays).toContain(2000);
    expect(backoffDelays).toContain(4000);

    setSpy.mockRestore();
  });

  it('honors retry-after header over exponential backoff', async () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    mockFetch
      .mockResolvedValueOnce(makeResponse(502, '', { 'retry-after': '30' }))
      .mockResolvedValueOnce(makeResponse(200));

    const resultPromise = fetchWithRetry(FAKE_URL, FAKE_OPTS, noopLog, 'test');
    await jest.runAllTimersAsync();
    await resultPromise;

    const backoffDelays = setSpy.mock.calls.map((c) => c[1]);
    expect(backoffDelays).toContain(30_000);

    setSpy.mockRestore();
  });
});

describe('formatGithubApiError (LS-8740)', () => {
  const savedCcr = process.env['CLAUDE_CODE_REMOTE'];

  afterEach(() => {
    if (savedCcr === undefined) delete process.env['CLAUDE_CODE_REMOTE'];
    else process.env['CLAUDE_CODE_REMOTE'] = savedCcr;
  });

  it('does not append the CCR hint outside a CCR session', () => {
    delete process.env['CLAUDE_CODE_REMOTE'];

    const message = formatGithubApiError(401, '{"message":"Bad credentials"}');

    expect(message).toBe('GitHub API 401: {"message":"Bad credentials"}');
  });

  it('does not append the CCR hint for a non-401 status even in a CCR session', () => {
    process.env['CLAUDE_CODE_REMOTE'] = 'true';

    const message = formatGithubApiError(403, 'Forbidden');

    expect(message).toBe('GitHub API 403: Forbidden');
  });

  it('appends the CCR hint for a 401 in a CCR session (LS-8740)', () => {
    process.env['CLAUDE_CODE_REMOTE'] = 'true';

    const message = formatGithubApiError(401, '{"message":"Bad credentials"}');

    expect(message).toMatch(/^GitHub API 401: \{"message":"Bad credentials"\}/);
    expect(message).toContain('LS-8740');
    expect(message).toContain('legacy-sports-ci');
  });

  it('preserves the "GitHub API <status>" prefix used by isAlreadyRunningError/isTransientServerError', () => {
    process.env['CLAUDE_CODE_REMOTE'] = 'true';

    // 401 is the only status this helper annotates — confirm the prefix these
    // sibling matchers key on survives the CCR hint being appended.
    const message = formatGithubApiError(
      401,
      'Bad credentials',
      ' (attempt 2/3)',
    );

    expect(
      message.startsWith('GitHub API 401 (attempt 2/3): Bad credentials'),
    ).toBe(true);
  });
});

describe('isAlreadyRunningError', () => {
  it('matches a 403 "already running" message', () => {
    expect(
      isAlreadyRunningError(
        'GitHub API 403: This workflow is already running.',
      ),
    ).toBe(true);
  });

  it('matches a 403 "already in progress" message, case-insensitively', () => {
    expect(isAlreadyRunningError('GitHub API 403: Already IN PROGRESS')).toBe(
      true,
    );
  });

  it('does not match a non-matching 403 (e.g. permissions)', () => {
    expect(
      isAlreadyRunningError(
        'GitHub API 403: Resource not accessible by integration',
      ),
    ).toBe(false);
  });

  it('does not match an "already running"-shaped message on a different status', () => {
    expect(
      isAlreadyRunningError('GitHub API 409: This workflow is already running'),
    ).toBe(false);
  });
});

describe('isTimeoutError', () => {
  it('matches the DOMException Node throws for a fired AbortSignal.timeout (LS-8704)', () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    expect(isTimeoutError(err)).toBe(true);
  });

  it('matches the AbortError name some runtimes use for the same condition', () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    expect(isTimeoutError(err)).toBe(true);
  });

  it('does not match a regular GitHub API error', () => {
    expect(
      isTimeoutError(new Error('GitHub API 503: Service Unavailable')),
    ).toBe(false);
  });

  it('does not match a non-Error value', () => {
    expect(isTimeoutError('TimeoutError')).toBe(false);
  });
});

describe('isTransientServerError', () => {
  it('matches a 503 "Service Unavailable" message', () => {
    expect(
      isTransientServerError(
        'GitHub API 503: {"message":"Service Unavailable"}',
      ),
    ).toBe(true);
  });

  it('matches a 502 message', () => {
    expect(isTransientServerError('GitHub API 502: bad gateway')).toBe(true);
  });

  it('matches a 504 message', () => {
    expect(isTransientServerError('GitHub API 504: gateway timeout')).toBe(
      true,
    );
  });

  it('does not match a non-transient status (e.g. 404)', () => {
    expect(isTransientServerError('GitHub API 404: Not Found')).toBe(false);
  });

  it('does not match a message that is not the GitHub API error shape', () => {
    expect(isTransientServerError('Service Unavailable')).toBe(false);
  });
});

describe('withRetryOnAlreadyRunning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on a transient 503 "Service Unavailable" and succeeds once GitHub recovers (LS-9646)', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('GitHub API 503: {"message":"Service Unavailable"}'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting attempts on a persistent 503, message names the reason', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValue(
        new Error('GitHub API 503: {"message":"Service Unavailable"}'),
      );

    const assertion = expect(
      withRetryOnAlreadyRunning(attemptFn),
    ).rejects.toThrow(/gave up after 3 attempts waiting for GitHub to recover/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(attemptFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-transient 4xx error — throws immediately', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('GitHub API 404: Not Found'));

    await expect(withRetryOnAlreadyRunning(attemptFn)).rejects.toThrow(
      /GitHub API 404/,
    );
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('backs off ~2s then ~4s between retries on a transient 503', async () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('GitHub API 503: {"message":"Service Unavailable"}'),
      )
      .mockRejectedValueOnce(
        new Error('GitHub API 503: {"message":"Service Unavailable"}'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    await resultPromise;

    const backoffDelays = setSpy.mock.calls.map((c) => c[1]);
    expect(backoffDelays).toContain(2000);
    expect(backoffDelays).toContain(4000);

    setSpy.mockRestore();
  });

  it('returns the result immediately on first-attempt success (no retry)', async () => {
    const attemptFn = jest.fn<() => Promise<string>>().mockResolvedValue('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('retries on an "already running" 403 and succeeds once the run settles', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('GitHub API 403: This workflow is already running.'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-matching error — throws immediately', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValue(
        new Error('GitHub API 403: Resource not accessible by integration'),
      );

    await expect(withRetryOnAlreadyRunning(attemptFn)).rejects.toThrow(
      /Resource not accessible by integration/,
    );
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting attempts and surfaces the attempt count', async () => {
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValue(
        new Error('GitHub API 403: This workflow is already running.'),
      );

    const assertion = expect(
      withRetryOnAlreadyRunning(attemptFn),
    ).rejects.toThrow(/gave up after 2 attempts/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  // Deliberately short (2 attempts, ~8s backoff) so the whole retry budget
  // stays well under the ci-server Lambda's 30s hard timeout — a 3-attempt/
  // ~30s budget left no headroom for the HTTP round trips themselves
  // (LS-9647). Once this short budget is exhausted, rerun.ts hands off to
  // the transport-safe ci_wait_run bounded-wait/re-invoke pattern instead of
  // retrying blindly in-process.
  it('backs off ~8s between retries, well under the 30s Lambda timeout', async () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('GitHub API 403: This workflow is already running.'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    await resultPromise;

    const backoffDelays = setSpy.mock.calls.map((c) => c[1]);
    expect(backoffDelays).toContain(8_000);
    expect(Math.max(...(backoffDelays as number[]))).toBeLessThan(30_000);

    setSpy.mockRestore();
  });
});

// getRepoRoot's import.meta.url usage was extracted into ./repo-root.ts
// (LS-8322), so github-api.ts itself now compiles under the CommonJS spec
// tsconfig and can be imported directly below for getDeploysToken() coverage.
// Mock the extracted module anyway (mirrors the LS-5982 pattern) since we
// never exercise the repo-slug fallback path here.
jest.mock('./repo-root', () => ({
  getRepoRoot: jest.fn(() => '/tmp/repo-root-that-does-not-exist'),
}));

// ---------------------------------------------------------------------------
// getDeploysToken (LS-8322)
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  'PREVIEW_APP_PRIVATE_KEY',
  'PREVIEW_APP_ID',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'AGENT_AUTHOR_APP_PRIVATE_KEY',
] as const;

function makeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue(body),
    text: jest
      .fn<() => Promise<string>>()
      .mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('getDeploysToken (LS-8322)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const savedFetch = global.fetch;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = savedFetch;
  });

  it('mints a Preview-App-scoped token when PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID are configured', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['PREVIEW_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
    process.env['PREVIEW_APP_ID'] = '999999';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // GET /repos/bkrupa/legacy-sports-deploys/installation
      .mockResolvedValueOnce(makeJsonResponse(200, { id: 12345 }))
      // POST /app/installations/12345/access_tokens
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'preview-app-scoped-token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );
    global.fetch = mockFetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('preview-app-scoped-token');
    expect(deploysTokenWasFallback()).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain(
      '/repos/bkrupa/legacy-sports-deploys/installation',
    );
    expect(mockFetch.mock.calls[1][0]).toContain(
      '/app/installations/12345/access_tokens',
    );
  });

  it('falls back to getToken() when neither PREVIEW_APP nor AGENT_AUTHOR_APP credentials are configured', async () => {
    delete process.env['PREVIEW_APP_PRIVATE_KEY'];
    delete process.env['PREVIEW_APP_ID'];
    delete process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];
    process.env['GH_TOKEN'] = 'ghp_broad_fallback_token';

    const mockFetch = jest.fn<typeof fetch>();
    // resolveToken() validates GH_TOKEN via GET /user before trusting it
    // (LS-8551) — queue a 200 so the fallback token is accepted as-is.
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, { login: 'someone' }),
    );
    global.fetch = mockFetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('ghp_broad_fallback_token');
    expect(deploysTokenWasFallback()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the agent-author App when PREVIEW_APP installation discovery fails, then to getToken() if that also fails (LS-8547)', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    process.env['PREVIEW_APP_PRIVATE_KEY'] = pem;
    process.env['PREVIEW_APP_ID'] = '999999';
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = pem;
    process.env['GH_TOKEN'] = 'ghp_broad_fallback_token';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // PREVIEW_APP installation discovery — 404
      .mockResolvedValueOnce(makeJsonResponse(404, { message: 'Not Found' }))
      // agent-author App installation discovery on the deploys repo — also 404
      // (not yet installed there — LS-8547's remaining manual step)
      .mockResolvedValueOnce(makeJsonResponse(404, { message: 'Not Found' }))
      // falls to getToken() -> resolveToken() validates GH_TOKEN via GET /user
      // (LS-8551) before trusting it as the final fallback.
      .mockResolvedValueOnce(makeJsonResponse(200, { login: 'someone' }));
    global.fetch = mockFetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('ghp_broad_fallback_token');
    expect(deploysTokenWasFallback()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toContain(
      '/repos/bkrupa/legacy-sports-deploys/installation',
    );
  });

  it('mints a token via the agent-author App installation on the deploys repo when PREVIEW_APP creds are absent but AGENT_AUTHOR_APP_PRIVATE_KEY is set (LS-8547)', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    delete process.env['PREVIEW_APP_PRIVATE_KEY'];
    delete process.env['PREVIEW_APP_ID'];
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // GET /repos/bkrupa/legacy-sports-deploys/installation
      .mockResolvedValueOnce(makeJsonResponse(200, { id: 54321 }))
      // POST /app/installations/54321/access_tokens
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'agent-author-scoped-token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );
    global.fetch = mockFetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('agent-author-scoped-token');
    expect(deploysTokenWasFallback()).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain(
      '/repos/bkrupa/legacy-sports-deploys/installation',
    );
    expect(mockFetch.mock.calls[1][0]).toContain(
      '/app/installations/54321/access_tokens',
    );
  });

  it('falls back to getToken() when PREVIEW_APP installation discovery fails', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['PREVIEW_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
    process.env['PREVIEW_APP_ID'] = '999999';
    process.env['GH_TOKEN'] = 'ghp_broad_fallback_token';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(404, { message: 'Not Found' }))
      // resolveToken() validates GH_TOKEN via GET /user before trusting it
      // (LS-8551) as part of the getToken() fallback below.
      .mockResolvedValueOnce(makeJsonResponse(200, { login: 'someone' }));
    global.fetch = mockFetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('ghp_broad_fallback_token');
    expect(deploysTokenWasFallback()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// getDeploysTokenDiagnostics (LS-8788)
// ---------------------------------------------------------------------------

describe('getDeploysTokenDiagnostics (LS-8788)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const savedFetch = global.fetch;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = savedFetch;
  });

  it('reports both tiers not-configured and resolvedSource "fallback" when neither is set', async () => {
    const { getDeploysTokenDiagnostics } = await import('./github-api.js');
    const diagnostics = await getDeploysTokenDiagnostics();

    expect(diagnostics).toEqual({
      previewAppConfigured: false,
      previewAppResult: 'not-configured',
      previewAppError: undefined,
      agentAuthorConfigured: false,
      agentAuthorResult: 'not-configured',
      agentAuthorError: undefined,
      resolvedSource: 'fallback',
    });
  });

  it('reports previewAppResult "success" and resolvedSource "preview-app" when PREVIEW_APP mints cleanly', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['PREVIEW_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
    process.env['PREVIEW_APP_ID'] = '999999';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(200, { id: 12345 }))
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'preview-app-scoped-token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );
    global.fetch = mockFetch;

    const { getDeploysTokenDiagnostics } = await import('./github-api.js');
    const diagnostics = await getDeploysTokenDiagnostics();

    expect(diagnostics.previewAppConfigured).toBe(true);
    expect(diagnostics.previewAppResult).toBe('success');
    expect(diagnostics.previewAppError).toBeUndefined();
    // PREVIEW_APP already succeeded, so the agent-author tier is never probed.
    expect(diagnostics.agentAuthorResult).toBe('not-configured');
    expect(diagnostics.resolvedSource).toBe('preview-app');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces the installation-discovery failure reason when PREVIEW_APP is configured but not installed on the deploys repo', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['PREVIEW_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
    process.env['PREVIEW_APP_ID'] = '999999';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(404, { message: 'Not Found' }),
    );
    global.fetch = mockFetch;

    const { getDeploysTokenDiagnostics } = await import('./github-api.js');
    const diagnostics = await getDeploysTokenDiagnostics();

    expect(diagnostics.previewAppConfigured).toBe(true);
    expect(diagnostics.previewAppResult).toBe('failed');
    expect(diagnostics.previewAppError).toContain(
      'installation discovery failed (404)',
    );
    expect(diagnostics.agentAuthorResult).toBe('not-configured');
    expect(diagnostics.resolvedSource).toBe('fallback');
  });

  it('falls through to the agent-author tier and reports its own failure reason when PREVIEW_APP is unconfigured (LS-8547 pending-install case)', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(404, { message: 'Not Found' }),
    );
    global.fetch = mockFetch;

    const { getDeploysTokenDiagnostics } = await import('./github-api.js');
    const diagnostics = await getDeploysTokenDiagnostics();

    expect(diagnostics.previewAppConfigured).toBe(false);
    expect(diagnostics.previewAppResult).toBe('not-configured');
    expect(diagnostics.agentAuthorConfigured).toBe(true);
    expect(diagnostics.agentAuthorResult).toBe('failed');
    expect(diagnostics.agentAuthorError).toContain(
      'installation discovery failed (404)',
    );
    expect(diagnostics.resolvedSource).toBe('fallback');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getInstallationRateLimit (LS-9570)
// ---------------------------------------------------------------------------

describe('getInstallationRateLimit (LS-9570)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const savedFetch = global.fetch;
  let appPrivateKeyPem: string;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    jest.resetModules();

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    appPrivateKeyPem = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = savedFetch;
  });

  it('throws without hitting the network when AGENT_AUTHOR_APP_PRIVATE_KEY is not configured', async () => {
    const mockFetch = jest.fn<typeof fetch>();
    global.fetch = mockFetch;

    const { getInstallationRateLimit } = await import('./github-api.js');

    await expect(getInstallationRateLimit()).rejects.toThrow(
      /AGENT_AUTHOR_APP_PRIVATE_KEY is not configured/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('mints an installation token and reports its rate limit, ignoring a GH_TOKEN set in env', async () => {
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = appPrivateKeyPem;
    // A GH_TOKEN is also set — getInstallationRateLimit must not use it or
    // resolveToken()'s precedence; it always mints the App's own token.
    process.env['GH_TOKEN'] = 'ghp_unrelated_user_token';

    const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // POST /app/installations/<id>/access_tokens
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_installation_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      // GET /rate_limit
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          rate: { limit: 5000, remaining: 12, reset: resetEpoch },
        }),
      );
    global.fetch = mockFetch;

    const { getInstallationRateLimit } = await import('./github-api.js');
    const result = await getInstallationRateLimit();

    expect(result).toEqual({
      appId: '3158619',
      limit: 5000,
      remaining: 12,
      resetsAt: new Date(resetEpoch * 1000).toISOString(),
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://api.github.com/rate_limit',
    );
    expect(mockFetch.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer ghs_installation_token',
    });
  });

  it('throws with the GitHub API error body when the /rate_limit call itself fails', async () => {
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = appPrivateKeyPem;

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_installation_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse(403, { message: 'API rate limit exceeded' }),
      );
    global.fetch = mockFetch;

    const { getInstallationRateLimit } = await import('./github-api.js');

    await expect(getInstallationRateLimit()).rejects.toThrow(/GitHub API 403/);
  });
});

// ---------------------------------------------------------------------------
// Token self-healing (LS-8551)
//
// legacy-sports-ci-local (the stdio server run locally) shares this module
// with the deployed Lambda. Before this fix, a stale GH_TOKEN/GITHUB_TOKEN
// env var was trusted unconditionally and cached for the process lifetime,
// so every ci_* tool call (e.g. ci_search_logs) failed with a hard 401 "Bad
// credentials" for the rest of the session — even when a working GitHub App
// key was available. These tests cover the two fixes: (1) resolveToken()
// validates an env token before trusting it and falls through when it's
// invalid, and (2) the request helpers invalidate-and-retry once on a 401
// that only surfaces on the real API call (e.g. a token revoked mid-session).
// ---------------------------------------------------------------------------

const SELF_HEAL_ENV_KEYS = [
  ...ENV_KEYS,
  'GITHUB_REPOSITORY',
  'GITHUB_APP_ID',
  'GITHUB_INSTALLATION_ID',
] as const;

describe('token self-healing (LS-8551)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const savedFetch = global.fetch;
  let appPrivateKeyPem: string;

  beforeEach(() => {
    for (const key of SELF_HEAL_ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of SELF_HEAL_ENV_KEYS) delete process.env[key];
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    jest.resetModules();

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    appPrivateKeyPem = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
  });

  afterEach(() => {
    for (const key of SELF_HEAL_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = savedFetch;
  });

  it('githubGet succeeds on the happy path with a valid env token (regression check)', async () => {
    process.env['GH_TOKEN'] = 'ghp_valid_token';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // resolveToken() validates GH_TOKEN via GET /user
      .mockResolvedValueOnce(makeJsonResponse(200, { login: 'someone' }))
      // the actual GET request
      .mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    global.fetch = mockFetch;

    const { githubGet } = await import('./github-api.js');
    const result = await githubGet('/actions/runs/1');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer ghp_valid_token',
    });
  });

  it('getToken() falls through to a GitHub App token when GH_TOKEN is set but invalid', async () => {
    process.env['GH_TOKEN'] = 'ghp_stale_token';
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = appPrivateKeyPem;

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // resolveToken() validates GH_TOKEN via GET /user — rejected
      .mockResolvedValueOnce(
        makeJsonResponse(401, { message: 'Bad credentials' }),
      )
      // falls through to minting a GitHub App installation token
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_app_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );
    global.fetch = mockFetch;

    const { getToken } = await import('./github-api.js');
    const token = await getToken();

    expect(token).toBe('ghs_app_token');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('githubGet retries once with a freshly-minted token when the API call itself 401s', async () => {
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = appPrivateKeyPem;

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // 1. mint the initial App token
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_first',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      // 2. the real GET call is rejected — token went stale mid-session
      .mockResolvedValueOnce(
        makeJsonResponse(401, { message: 'Bad credentials' }),
      )
      // 3. self-heal: mint a fresh App token after invalidating the cache
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_second',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      // 4. retry succeeds with the fresh token
      .mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    global.fetch = mockFetch;

    const { githubGet } = await import('./github-api.js');
    const result = await githubGet('/actions/runs/1');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][1]?.headers).toMatchObject({
      Authorization: 'Bearer ghs_second',
    });
  });

  it('githubGetArrayBuffer retries once on a typed 401 from fetchWithRetry, not a message-string match', async () => {
    process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = appPrivateKeyPem;

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch
      // 1. mint the initial App token
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_first',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      // 2. the arraybuffer GET is rejected — fetchWithRetry throws a typed
      //    HttpStatusError(401, ...), not just an Error with a matching message
      .mockResolvedValueOnce(makeResponse(401, '{"message":"Bad credentials"}'))
      // 3. self-heal: mint a fresh App token after invalidating the cache
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          token: 'ghs_second',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      )
      // 4. retry succeeds with the fresh token
      .mockResolvedValueOnce(makeResponse(200));
    global.fetch = mockFetch;

    const { githubGetArrayBuffer } = await import('./github-api.js');
    const result = await githubGetArrayBuffer('/actions/jobs/1/logs');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][1]?.headers).toMatchObject({
      Authorization: 'Bearer ghs_second',
    });
  });
});

import { generateKeyPairSync } from 'node:crypto';
import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

// http-retry.ts has no import.meta / auth dependencies, so it compiles cleanly
// under the CommonJS spec tsconfig. We test the retry logic here rather than
// importing github-api.ts directly.
import {
  fetchWithRetry,
  isAlreadyRunningError,
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
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    noopLog.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
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

describe('withRetryOnAlreadyRunning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
      .mockRejectedValueOnce(
        new Error('GitHub API 403: This workflow is already running.'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(attemptFn).toHaveBeenCalledTimes(3);
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
    ).rejects.toThrow(/gave up after 3 attempts/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(attemptFn).toHaveBeenCalledTimes(3);
  });

  it('backs off ~10s then ~20s between retries', async () => {
    const setSpy = jest.spyOn(global, 'setTimeout');
    const attemptFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('GitHub API 403: This workflow is already running.'),
      )
      .mockRejectedValueOnce(
        new Error('GitHub API 403: This workflow is already running.'),
      )
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetryOnAlreadyRunning(attemptFn);
    await jest.runAllTimersAsync();
    await resultPromise;

    const backoffDelays = setSpy.mock.calls.map((c) => c[1]);
    expect(backoffDelays).toContain(10_000);
    expect(backoffDelays).toContain(20_000);

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
    global.fetch = mockFetch as unknown as typeof fetch;

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

  it('falls back to getToken() when PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID are not configured', async () => {
    delete process.env['PREVIEW_APP_PRIVATE_KEY'];
    delete process.env['PREVIEW_APP_ID'];
    process.env['GH_TOKEN'] = 'ghp_broad_fallback_token';

    const mockFetch = jest.fn<typeof fetch>();
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('ghp_broad_fallback_token');
    expect(deploysTokenWasFallback()).toBe(true);
    // GH_TOKEN short-circuits resolveToken() — no network calls needed.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to getToken() when PREVIEW_APP installation discovery fails', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['PREVIEW_APP_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString();
    process.env['PREVIEW_APP_ID'] = '999999';
    process.env['GH_TOKEN'] = 'ghp_broad_fallback_token';

    const mockFetch = jest.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(404, { message: 'Not Found' }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getDeploysToken, deploysTokenWasFallback } =
      await import('./github-api.js');
    const token = await getDeploysToken();

    expect(token).toBe('ghp_broad_fallback_token');
    expect(deploysTokenWasFallback()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

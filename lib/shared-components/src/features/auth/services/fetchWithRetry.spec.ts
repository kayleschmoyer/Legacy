import { fetchWithRetry } from './fetchWithRetry';

const PROXY_URL = 'https://oauth-proxy.example.com/test';
// Pass retryBaseMs: 0 so retries are instant (no real sleep in tests).
// timeoutMs is left at default but the 10 s per-attempt timers never fire
// in practice because the mocked fetch resolves immediately.
const FAST_OPTS = { retryBaseMs: 0 };

function makeOkResponse(body = '{"ok":true}'): Partial<Response> {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

function makeErrorResponse(status: number): Partial<Response> {
  return { ok: false, status, text: () => Promise.resolve('') };
}

describe('fetchWithRetry', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the response on a successful first attempt', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse());

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
  });

  it('retries on network error and succeeds on the second attempt', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeOkResponse());

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  });

  it('retries up to maxRetries times on repeated network errors', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeOkResponse());

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.ok).toBe(true);
  });

  it('throws after exhausting all retries', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      fetchWithRetry(PROXY_URL, { method: 'POST' }, FAST_OPTS),
    ).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on non-network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Unexpected internal error'));

    await expect(
      fetchWithRetry(PROXY_URL, { method: 'POST' }, FAST_OPTS),
    ).rejects.toThrow('Unexpected internal error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx responses without retrying', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403));

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(403);
  });

  it('returns 5xx responses without retrying', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(500));

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });

  it('retries on AbortError when it comes from the timeout controller', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('Timeout', 'AbortError'))
      .mockResolvedValueOnce(makeOkResponse());

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  });

  it('does not retry when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchWithRetry(
        PROXY_URL,
        { method: 'POST', signal: controller.signal },
        FAST_OPTS,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry when the caller signal fires during a fetch that then rejects with AbortError', async () => {
    const controller = new AbortController();
    // fetchMock rejects with the abortError (simulating what fetch does when aborted).
    // We abort the signal AFTER setting up the mock but the signal is not yet aborted
    // when fetchWithRetry is entered, so fetch IS called once before the abort propagates.
    fetchMock.mockImplementationOnce(() => {
      controller.abort(); // abort mid-call
      return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    });

    await expect(
      fetchWithRetry(
        PROXY_URL,
        { method: 'POST', signal: controller.signal },
        FAST_OPTS,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    // fetch was called once; the rejection is not retried because callerSignal is aborted
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respects a custom maxRetries of 0 (no retries)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      fetchWithRetry(PROXY_URL, { method: 'POST' }, { maxRetries: 0 }),
    ).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes the init options through to fetch', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse());

    await fetchWithRetry(
      PROXY_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{"foo":"bar"}',
      },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      PROXY_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{"foo":"bar"}',
      }),
    );
  });

  it('recognises Node.js fetch error format as a network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(makeOkResponse());

    const response = await fetchWithRetry(
      PROXY_URL,
      { method: 'POST' },
      FAST_OPTS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  });
});

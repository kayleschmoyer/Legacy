import { handleReviewThreadResolvedEvent } from './handle-review-thread-resolved';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('./github-app', () => ({
  getRepoInstallationToken: jest
    .fn()
    .mockResolvedValue('ghs_installation_token'),
  REQUEST_TIMEOUT_MS: 15_000,
}));

const APP_PRIVATE_KEY =
  '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----';
const APP_ID = 3142924;
const GITHUB_REPO = 'bkrupa/legacy-sports';

const resolvedPayload = {
  action: 'resolved',
  pull_request: {
    number: 42,
    labels: [{ name: 'merge-when-ready' }],
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleReviewThreadResolvedEvent', () => {
  it('dispatches merge-queue.yml when a thread is resolved on a merge-when-ready PR', async () => {
    const result = await handleReviewThreadResolvedEvent(
      resolvedPayload,
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/bkrupa/legacy-sports/actions/workflows/merge-queue.yml/dispatches',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer ghs_installation_token',
    );
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' });
    expect(result).toContain('PR #42');
    expect(result).toContain('thread resolved');
  });

  it('ignores unresolved action', async () => {
    const result = await handleReviewThreadResolvedEvent(
      {
        action: 'unresolved',
        pull_request: { number: 42, labels: [{ name: 'merge-when-ready' }] },
      },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('Ignored action="unresolved"');
  });

  it('ignores payload with missing pull_request.number', async () => {
    const result = await handleReviewThreadResolvedEvent(
      {
        action: 'resolved',
        pull_request: { labels: [{ name: 'merge-when-ready' }] },
      },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('missing pull_request.number');
  });

  it('ignores PRs without merge-when-ready label', async () => {
    const result = await handleReviewThreadResolvedEvent(
      {
        action: 'resolved',
        pull_request: { number: 42, labels: [{ name: 'bugfix' }] },
      },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('merge-when-ready label not present');
  });

  it('ignores PRs with no labels array', async () => {
    const result = await handleReviewThreadResolvedEvent(
      { action: 'resolved', pull_request: { number: 42, labels: [] } },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('merge-when-ready label not present');
  });

  it('throws when dispatch returns a non-ok status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: jest.fn().mockResolvedValue('Unprocessable Entity'),
    });

    await expect(
      handleReviewThreadResolvedEvent(
        resolvedPayload,
        APP_PRIVATE_KEY,
        APP_ID,
        GITHUB_REPO,
      ),
    ).rejects.toThrow('HTTP 422');
  });

  it('throws on invalid GITHUB_REPO format', async () => {
    await expect(
      handleReviewThreadResolvedEvent(
        resolvedPayload,
        APP_PRIVATE_KEY,
        APP_ID,
        'not-a-valid-repo',
      ),
    ).rejects.toThrow('Invalid GITHUB_REPO format');
  });
});

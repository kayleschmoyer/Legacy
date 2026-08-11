jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

import { awaitRef } from './await-ref';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');

const REPO = { owner: 'bkrupa', name: 'legacy-sports' };
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function refResponse(sha: string) {
  return { object: { sha } };
}

function notFound() {
  return Promise.reject(
    new Error(
      'GitHub API GET /repos/bkrupa/legacy-sports/git/ref/heads/main failed (404): {"message":"Not Found"}',
    ),
  );
}

function unauthorized() {
  return Promise.reject(
    new Error(
      'GitHub API GET /repos/bkrupa/legacy-sports/git/ref/heads/main failed (401): {"message":"Bad credentials"}',
    ),
  );
}

function parseBody(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetRepoOwnerName.mockResolvedValue(REPO);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('awaitRef', () => {
  it('reports "changed" as soon as the SHA differs from the baseline', async () => {
    mockGithubRest
      .mockResolvedValueOnce(refResponse(SHA_A))
      .mockResolvedValueOnce(refResponse(SHA_B));

    const promise = awaitRef({
      ref: 'heads/main',
      changedFrom: SHA_A,
      maxWaitSeconds: 20,
    });
    await jest.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result.isError).toBeUndefined();
    const body = parseBody(result);
    expect(body).toEqual({ status: 'changed', sha: SHA_B, ref: 'heads/main' });
    expect(mockGithubRest).toHaveBeenCalledTimes(2);
  });

  it('reports "unchanged" with a re-invoke hint when the deadline elapses with no change', async () => {
    mockGithubRest.mockResolvedValue(refResponse(SHA_A));

    const promise = awaitRef({
      ref: 'heads/main',
      changedFrom: SHA_A,
      maxWaitSeconds: 10,
    });
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.isError).toBeUndefined();
    const body = parseBody(result);
    expect(body.status).toBe('unchanged');
    expect(body.sha).toBe(SHA_A);
    expect(typeof body.hint).toBe('string');
    expect(String(body.hint)).toMatch(/github_await_ref/);
  });

  it('reports "deleted" when the ref never existed and deleted:true is awaited', async () => {
    mockGithubRest.mockImplementationOnce(notFound);

    const result = await awaitRef({ ref: 'heads/gone', deleted: true });

    expect(result.isError).toBeUndefined();
    const body = parseBody(result);
    expect(body).toEqual({ status: 'deleted', sha: null, ref: 'heads/gone' });
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
  });

  it('reports "deleted" when a previously-existing ref 404s mid-poll (non-deleted wait)', async () => {
    mockGithubRest
      .mockResolvedValueOnce(refResponse(SHA_A))
      .mockImplementationOnce(notFound);

    const promise = awaitRef({
      ref: 'heads/feature',
      changedFrom: SHA_A,
      maxWaitSeconds: 20,
    });
    await jest.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result.isError).toBeUndefined();
    const body = parseBody(result);
    expect(body).toEqual({
      status: 'deleted',
      sha: null,
      ref: 'heads/feature',
    });
  });

  it('propagates a 401 as an error without retrying', async () => {
    mockGithubRest.mockImplementationOnce(unauthorized);

    const result = await awaitRef({ ref: 'heads/main', changedFrom: SHA_A });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/401/);
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
  });
});

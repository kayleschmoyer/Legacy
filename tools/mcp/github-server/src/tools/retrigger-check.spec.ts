jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('../pr-utils', () => ({
  resolveHeadShaFromPrNumber: jest.fn(),
}));

import { retriggerCheck } from './retrigger-check';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');
const { resolveHeadShaFromPrNumber: mockResolveHeadSha } = jest.requireMock<{
  resolveHeadShaFromPrNumber: jest.Mock;
}>('../pr-utils');

const SHA = 'abc1234def5678';
const REPO = { owner: 'bkrupa', name: 'legacy-sports' };

function makeCheckRun(
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 99,
    name,
    status: 'completed',
    conclusion: 'cancelled',
    app: { slug: 'github-actions' },
    ...overrides,
  };
}

function parseMcpText(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue(REPO);
  mockResolveHeadSha.mockResolvedValue(SHA);
});

describe('retriggerCheck — workflow_dispatch 403 hint', () => {
  it('emits fallback hint when 403 "Invalid check_run_id" comes from github-actions app', async () => {
    mockGithubRest
      // list check runs
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [makeCheckRun('Verify All Migrations Applied')],
      })
      // rerequest → 403
      .mockRejectedValueOnce(
        new Error(
          'GitHub API POST /repos/bkrupa/legacy-sports/check-runs/99/rerequest failed (403): {"message":"Invalid check_run_id `99`"}',
        ),
      );

    const result = await retriggerCheck({
      number: 5113,
      checkName: 'Verify All Migrations Applied',
    });

    expect(result.isError).toBe(true);
    const body = parseMcpText(result);
    expect(body.failed).toBe(1);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.retriggered).toBe(false);
    expect(entry.fallback).toBe('push-empty-commit');
    expect(String(entry.error)).toMatch(
      /cannot be re-requested via the Checks API/,
    );
    expect(String(entry.error)).toMatch(/fire a fresh pull_request event/);
    expect(String(entry.error)).toMatch(/AssumeRoleWithWebIdentity/);
    expect(String(entry.error)).toMatch(/Do NOT use ci_dispatch_workflow/);
  });

  it('does not emit fallback hint when 403 "Invalid check_run_id" comes from a non-github-actions app', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('Some Other Check', { app: { slug: 'other-app' } }),
        ],
      })
      .mockRejectedValueOnce(
        new Error(
          'GitHub API POST /repos/bkrupa/legacy-sports/check-runs/99/rerequest failed (403): {"message":"Invalid check_run_id `99`"}',
        ),
      );

    const result = await retriggerCheck({
      number: 5113,
      checkName: 'Some Other Check',
    });

    const body = parseMcpText(result);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.fallback).toBeUndefined();
    expect(String(entry.error)).toMatch(/Invalid check_run_id/);
  });

  it('does not emit fallback hint for other 403 errors from github-actions app', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [makeCheckRun('bot-review')],
      })
      .mockRejectedValueOnce(
        new Error(
          'GitHub API POST /repos/bkrupa/legacy-sports/check-runs/99/rerequest failed (403): {"message":"Resource not accessible by integration"}',
        ),
      );

    const result = await retriggerCheck({
      number: 5113,
      checkName: 'bot-review',
    });

    const body = parseMcpText(result);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.fallback).toBeUndefined();
  });

  it('succeeds normally when rerequest works', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [makeCheckRun('bot-review', { conclusion: 'failure' })],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 42,
      checkName: 'bot-review',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    expect(body.failed).toBe(0);
  });
});

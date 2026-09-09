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

const ACTIONS_RUN_ID = 33834032501;
const DETAILS_URL = `https://github.com/bkrupa/legacy-sports/actions/runs/${ACTIONS_RUN_ID}/job/1234567890`;

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
    details_url: DETAILS_URL,
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

describe('retriggerCheck — Actions API fallback (LS-9881)', () => {
  it('falls back to Actions rerun-failed-jobs and succeeds when the Checks API rejects a github-actions check', async () => {
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
      )
      // Actions rerun-failed-jobs → succeeds
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 5113,
      checkName: 'Verify All Migrations Applied',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    expect(body.failed).toBe(0);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.retriggered).toBe(true);
    expect(mockGithubRest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/repos/bkrupa/legacy-sports/actions/runs/${ACTIONS_RUN_ID}/rerun-failed-jobs`,
      }),
    );
  });

  it('never recommends an empty commit, even when the Actions API fallback also fails', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [makeCheckRun('Verify All Migrations Applied')],
      })
      .mockRejectedValueOnce(
        new Error(
          'GitHub API POST /repos/bkrupa/legacy-sports/check-runs/99/rerequest failed (403): {"message":"Invalid check_run_id `99`"}',
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          `GitHub API POST /repos/bkrupa/legacy-sports/actions/runs/${ACTIONS_RUN_ID}/rerun-failed-jobs failed (422): {"message":"Unable to reschedule run"}`,
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
    expect(entry.fallback).toBeUndefined();
    expect(String(entry.error)).not.toMatch(/empty commit/i);
    expect(String(entry.error)).toMatch(/rerun-failed-jobs call.*also failed/);
    expect(String(entry.error)).toMatch(/AssumeRoleWithWebIdentity/);
    expect(String(entry.error)).toMatch(/Do NOT use ci_dispatch_workflow/);
  });

  it('reports "not_yet_reschedulable" (not a hard failure) when the owning workflow run is still in flight', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [makeCheckRun('Verify All Migrations Applied')],
      })
      .mockRejectedValueOnce(
        new Error(
          'GitHub API POST /repos/bkrupa/legacy-sports/check-runs/99/rerequest failed (403): {"message":"Invalid check_run_id `99`"}',
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          `GitHub API POST /repos/bkrupa/legacy-sports/actions/runs/${ACTIONS_RUN_ID}/rerun-failed-jobs failed (403): {"message":"This workflow is already running"}`,
        ),
      );

    const result = await retriggerCheck({
      number: 5113,
      checkName: 'Verify All Migrations Applied',
    });

    // Advisory, not a hard failure — must not flip the overall call to isError.
    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.success).toBe(true);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.retriggered).toBe(false);
    expect(entry.status).toBe('not_yet_reschedulable');
    expect(String(entry.error)).not.toMatch(/empty commit/i);
    expect(String(entry.error)).toMatch(/still running/i);
  });

  it('reports no path (without recommending an empty commit) when the workflow run id cannot be resolved', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('Verify All Migrations Applied', {
            details_url: null,
            html_url: null,
          }),
        ],
      })
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
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.retriggered).toBe(false);
    expect(String(entry.error)).not.toMatch(/empty commit/i);
    expect(String(entry.error)).toMatch(/could not be resolved/i);
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

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

describe('retriggerCheck — checkName matching on names containing "&" (LS-9884)', () => {
  it('matches a check name containing "&" via local substring filtering', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('GraphQL Schema & Codegen', { conclusion: 'failure' }),
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 7562,
      checkName: 'GraphQL Schema & Codegen',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    expect(body.failed).toBe(0);
    // Server-side check_name filtering must not be used — the request lists
    // all check runs unfiltered and matching happens locally.
    const calls = mockGithubRest.mock.calls as Array<
      [{ query?: Record<string, string> }]
    >;
    expect(calls[0][0].query).not.toHaveProperty('check_name');
  });

  it('matches a "&"-containing check name via a partial substring', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('GraphQL Schema & Codegen', { conclusion: 'failure' }),
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 7562,
      checkName: 'Schema',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
  });

  it('reports available check names when a checkName matches nothing', async () => {
    mockGithubRest.mockResolvedValueOnce({
      total_count: 1,
      check_runs: [
        makeCheckRun('GraphQL Schema & Codegen', { conclusion: 'failure' }),
      ],
    });

    const result = await retriggerCheck({
      number: 7562,
      checkName: 'nonexistent check',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /No check run named "nonexistent check"/,
    );
    expect(result.content[0].text).toMatch(/GraphQL Schema & Codegen/);
  });
});

describe('retriggerCheck — allFailed scoped to the current head SHA, not superseded attempts (LS-10059)', () => {
  it('does not retrigger a check whose latest attempt on the head SHA has already succeeded, even though an earlier (e.g. stood-down-as-flaky) attempt for the same name and SHA failed', async () => {
    // GitHub's check-runs-for-a-ref listing returns every attempt of a check
    // that has run against this SHA, newest first. A rerequested check keeps
    // its older check_run objects in the list alongside the new one.
    mockGithubRest.mockResolvedValueOnce({
      total_count: 2,
      check_runs: [
        makeCheckRun('flaky-test', { id: 2, conclusion: 'success' }),
        makeCheckRun('flaky-test', { id: 1, conclusion: 'failure' }),
      ],
    });

    const result = await retriggerCheck({ number: 5113, allFailed: true });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.message).toBe('No failed check runs to retrigger.');
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
  });

  it('retriggers a check whose latest attempt on the head SHA is still failing', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 2,
        check_runs: [
          makeCheckRun('flaky-test', { id: 2, conclusion: 'failure' }),
          makeCheckRun('flaky-test', { id: 1, conclusion: 'success' }),
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({ number: 5113, allFailed: true });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.id).toBe(2);
  });
});

describe('retriggerCheck — checkNames array param (LS-10059)', () => {
  it('retriggers the union of checks matching any of the given names, regardless of status', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 3,
        check_runs: [
          makeCheckRun('bot-review', { id: 1, conclusion: 'success' }),
          makeCheckRun('lint', { id: 2, conclusion: 'failure' }),
          makeCheckRun('unrelated-check', { id: 3, conclusion: 'failure' }),
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 42,
      checkNames: ['bot-review', 'lint'],
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(2);
    const names = (body.results as Array<Record<string, unknown>>).map(
      (r) => r.name,
    );
    expect(names.sort()).toEqual(['bot-review', 'lint']);
  });

  it('combines with allFailed to retrigger only the currently-failing checks among the named subset', async () => {
    mockGithubRest.mockResolvedValueOnce({
      total_count: 2,
      check_runs: [
        makeCheckRun('bot-review', { id: 1, conclusion: 'success' }),
        makeCheckRun('lint', { id: 2, conclusion: 'failure' }),
      ],
    });
    mockGithubRest.mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 42,
      checkNames: ['bot-review', 'lint'],
      allFailed: true,
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    const [entry] = body.results as Array<Record<string, unknown>>;
    expect(entry.name).toBe('lint');
  });

  it('reports available check names when none of checkNames match anything', async () => {
    mockGithubRest.mockResolvedValueOnce({
      total_count: 1,
      check_runs: [makeCheckRun('bot-review', { conclusion: 'failure' })],
    });

    const result = await retriggerCheck({
      number: 42,
      checkNames: ['nonexistent-1', 'nonexistent-2'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /No check run named "nonexistent-1", "nonexistent-2"/,
    );
    expect(result.content[0].text).toMatch(/bot-review/);
  });
});

describe('retriggerCheck — checkName substring match on the emoji-prefixed CI Pipeline name (LS-9973)', () => {
  it('matches the short name "lint" against the full "🚀 CI Pipeline / lint & format" check name', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('🚀 CI Pipeline / lint & format', {
            conclusion: 'cancelled',
          }),
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 7756,
      checkName: 'lint',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    expect(body.failed).toBe(0);
  });

  it('matches "lint & format" against the full "🚀 CI Pipeline / lint & format" check name', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          makeCheckRun('🚀 CI Pipeline / lint & format', {
            conclusion: 'cancelled',
          }),
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await retriggerCheck({
      number: 7756,
      checkName: 'lint & format',
    });

    expect(result.isError).toBeUndefined();
    const body = parseMcpText(result);
    expect(body.retriggered).toBe(1);
    expect(body.failed).toBe(0);
  });
});

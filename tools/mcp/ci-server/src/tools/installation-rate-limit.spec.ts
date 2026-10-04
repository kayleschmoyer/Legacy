import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  getInstallationRateLimit: jest.fn(),
}));

jest.mock('../logs.js', () => ({
  fetchRunLogs: jest.fn(),
  stripAnsiCodes: (s: string) => s,
}));

import { installationRateLimit } from './installation-rate-limit.js';
import * as githubApi from '../github-api.js';
import * as logs from '../logs.js';

const mockRateLimit =
  githubApi.getInstallationRateLimit as unknown as jest.MockedFunction<
    typeof githubApi.getInstallationRateLimit
  >;
const mockFetchRunLogs = logs.fetchRunLogs as unknown as jest.MockedFunction<
  typeof logs.fetchRunLogs
>;

const HEALTHY = {
  appId: '3158619',
  limit: 5000,
  remaining: 4996,
  resetsAt: '2026-10-04T17:00:00.000Z',
};

function textOf(
  result: Awaited<ReturnType<typeof installationRateLimit>>,
): Record<string, unknown> {
  const [first] = result.content;
  return JSON.parse(first.text) as Record<string, unknown>;
}

function logsResult(text: string) {
  return { text, jobsSearched: 2, jobsTotal: 2, skippedByFailedOnly: false };
}

describe('installationRateLimit (LS-10491)', () => {
  beforeEach(() => {
    mockRateLimit.mockReset();
    mockFetchRunLogs.mockReset();
  });

  it('states which bucket it measured and that the workflow GITHUB_TOKEN budget is separate', async () => {
    mockRateLimit.mockResolvedValue(HEALTHY);

    const out = textOf(await installationRateLimit({}));

    expect(out['configured']).toBe(true);
    expect(out['measured']).toMatchObject({
      token: 'github-app-installation',
      app: 'Agent Author',
      appId: '3158619',
    });
    expect(out['rateLimit']).toEqual({
      limit: 5000,
      remaining: 4996,
      resetsAt: HEALTHY.resetsAt,
    });
    expect(out['notMeasured']).toMatch(/GITHUB_TOKEN/);
    expect(out['hint']).toMatch(/runId/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('reports workflow-bucket-separate when logs show rate-limit 403s but the App bucket is healthy', async () => {
    mockRateLimit.mockResolvedValue(HEALTHY);
    mockFetchRunLogs.mockResolvedValue(
      logsResult(
        [
          'Setting commit status: success',
          'HttpError: API rate limit exceeded for installation ID 12345.',
          'done',
        ].join('\n'),
      ),
    );

    const out = textOf(await installationRateLimit({ runId: 37214281121 }));

    expect(mockFetchRunLogs).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 37214281121, failedOnly: false }),
    );
    expect(out['verdict']).toBe('workflow-bucket-separate');
    expect(out['hint']).toMatch(/GITHUB_TOKEN/);
    expect(out['workflowLogs']).toMatchObject({
      rateLimit403Lines: 1,
      appTokenMintFailureLines: 0,
    });
  });

  it('flags App-token mint failures alongside the 403s', async () => {
    mockRateLimit.mockResolvedValue(HEALTHY);
    mockFetchRunLogs.mockResolvedValue(
      logsResult(
        [
          'Failed to create token for "bkrupa/legacy-sports" (attempt 1): Invalid keyData',
          'HttpError: API rate limit exceeded for installation',
        ].join('\n'),
      ),
    );

    const out = textOf(await installationRateLimit({ jobId: 111452115939 }));

    expect(out['verdict']).toBe('workflow-bucket-separate');
    expect(out['hint']).toMatch(/supplies the App private key/);
    expect(out['workflowLogs']).toMatchObject({ appTokenMintFailureLines: 1 });
  });

  it('reports agent-author-bucket-low when the measured bucket is nearly exhausted', async () => {
    mockRateLimit.mockResolvedValue({ ...HEALTHY, remaining: 12 });
    mockFetchRunLogs.mockResolvedValue(
      logsResult('API rate limit exceeded for installation'),
    );

    const out = textOf(await installationRateLimit({ runId: 1 }));

    expect(out['verdict']).toBe('agent-author-bucket-low');
  });

  it('reports no-rate-limit-403-in-logs when the logs are clean', async () => {
    mockRateLimit.mockResolvedValue(HEALTHY);
    mockFetchRunLogs.mockResolvedValue(logsResult('Error: test failed'));

    const out = textOf(await installationRateLimit({ runId: 1 }));

    expect(out['verdict']).toBe('no-rate-limit-403-in-logs');
  });

  it('still scans logs when the App key is not configured', async () => {
    mockRateLimit.mockRejectedValue(
      new Error('AGENT_AUTHOR_APP_PRIVATE_KEY is not configured'),
    );
    mockFetchRunLogs.mockResolvedValue(
      logsResult('API rate limit exceeded for installation'),
    );

    const out = textOf(await installationRateLimit({ runId: 1 }));

    expect(out['configured']).toBe(false);
    expect(out['error']).toMatch(/not configured/);
    expect(out['verdict']).toBe('unknown');
  });

  it('returns the bucket reading plus a logScanError when the log fetch fails', async () => {
    mockRateLimit.mockResolvedValue(HEALTHY);
    mockFetchRunLogs.mockRejectedValue(new Error('404 Not Found'));

    const out = textOf(await installationRateLimit({ runId: 1 }));

    expect(out['rateLimit']).toBeDefined();
    expect(out['logScanError']).toMatch(/run 1: 404 Not Found/);
  });
});

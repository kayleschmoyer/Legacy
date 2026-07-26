import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('./github-api.js', () => ({
  githubGet: jest.fn(),
  githubGetArrayBuffer: jest.fn(),
}));

import { fetchRunLogsRing, JOB_NEVER_STARTED_MESSAGE } from './logs.js';
import * as githubApi from './github-api.js';

const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;
const mockGithubGetArrayBuffer =
  githubApi.githubGetArrayBuffer as jest.MockedFunction<
    typeof githubApi.githubGetArrayBuffer
  >;

function textToArrayBuffer(text: string): ArrayBuffer {
  const buf = Buffer.from(text, 'utf-8');
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

describe('fetchRunLogsRing', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  it('handles logs with hundreds of thousands of lines without stack overflow', async () => {
    // Reproduces the bug from LS-4875: a multi-job run where one job has a very
    // large log payload used to crash with "Maximum call stack size exceeded"
    // because `[...arr]` and `push(...arr)` spread millions of lines as args.
    const HUGE_LINE_COUNT = 300_000;
    const hugeLog = Array.from(
      { length: HUGE_LINE_COUNT },
      (_, i) => `line ${i}`,
    ).join('\n');

    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 42,
          name: 'huge-job',
          status: 'completed',
          conclusion: 'failure',
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(textToArrayBuffer(hugeLog));

    const result = await fetchRunLogsRing(
      { runId: 26392539058, failedOnly: true },
      500,
    );

    expect(result.lines.length).toBe(500);
    // totalLines counts the job-name header line plus all log lines
    expect(result.totalLines).toBe(HUGE_LINE_COUNT + 1);
    // Ring buffer keeps the tail
    expect(result.lines[result.lines.length - 1]).toBe(
      `line ${HUGE_LINE_COUNT - 1}`,
    );
  }, 30_000);

  it('returns all lines when log fits under maxLines', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 1,
          name: 'small-job',
          status: 'completed',
          conclusion: 'failure',
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('alpha\nbravo\ncharlie'),
    );

    const result = await fetchRunLogsRing({ runId: 1, failedOnly: true }, 500);

    expect(result.lines).toEqual(['small-job', 'alpha', 'bravo', 'charlie']);
    expect(result.totalLines).toBe(4);
  });

  it('returns a friendly message for a bare jobId that 404s with no steps executed (LS-7910)', async () => {
    mockGithubGetArrayBuffer.mockRejectedValue(
      new Error(
        'GitHub API 404: <?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code></Error>',
      ),
    );
    mockGithubGet.mockResolvedValue({
      id: 999,
      name: 'startup-failure-job',
      status: 'completed',
      conclusion: 'startup_failure',
      steps: [],
    });

    const result = await fetchRunLogsRing({ jobId: 999 }, 500);

    expect(result).toEqual({
      lines: [JOB_NEVER_STARTED_MESSAGE],
      totalLines: 1,
    });
    // Job-detail lookup only happens on the 404 path, not on every call.
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
    expect(mockGithubGet).toHaveBeenCalledWith(
      '/actions/jobs/999',
      undefined,
      expect.anything(),
    );
  });

  it('preserves the raw 404 error for a bare jobId whose job actually ran steps', async () => {
    mockGithubGetArrayBuffer.mockRejectedValue(
      new Error(
        'GitHub API 404: <?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code></Error>',
      ),
    );
    mockGithubGet.mockResolvedValue({
      id: 1000,
      name: 'ran-then-lost-logs-job',
      status: 'completed',
      conclusion: 'failure',
      steps: [
        {
          name: 'Build',
          status: 'completed',
          conclusion: 'failure',
          number: 1,
        },
      ],
    });

    await expect(fetchRunLogsRing({ jobId: 1000 }, 500)).rejects.toThrow(
      /^GitHub API 404:/,
    );
  });

  it('finds priorityMatcher lines outside the ring-buffered tail window (LS-8391)', async () => {
    // 10,000-line log where the "failure" marker sits near the front — well
    // outside a small ring buffer's tail — plus noise lines throughout.
    const logLines: string[] = [];
    logLines.push('FAIL src/foo.spec.ts');
    for (let i = 0; i < 9_999; i++) {
      logLines.push(`console.error: noise line ${i}`);
    }

    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        { id: 1, name: 'test-job', status: 'completed', conclusion: 'failure' },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer(logLines.join('\n')),
    );

    // maxLines=500 means the ring buffer only keeps the *last* 500 lines —
    // the FAIL marker at the front would never appear in `lines` without
    // whole-log priority scanning.
    const result = await fetchRunLogsRing(
      { runId: 1, failedOnly: true },
      500,
      (line) => line.startsWith('FAIL '),
    );

    expect(result.lines).not.toContain('FAIL src/foo.spec.ts');
    expect(result.priorityLines).toContain('FAIL src/foo.spec.ts');
  });

  it('omits priorityLines from the result when no matcher is passed', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        { id: 1, name: 'test-job', status: 'completed', conclusion: 'failure' },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(textToArrayBuffer('a\nb\nc'));

    const result = await fetchRunLogsRing({ runId: 1, failedOnly: true }, 500);

    expect(result.priorityLines).toBeUndefined();
  });

  it('uses the friendly message for one empty-steps job in a multi-job runId batch, leaving others unaffected', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      jobs: [
        {
          id: 1,
          name: 'ok-job',
          status: 'completed',
          conclusion: 'failure',
        },
        {
          id: 2,
          name: 'startup-failure-job',
          status: 'completed',
          conclusion: 'startup_failure',
          steps: [],
        },
      ],
    });
    mockGithubGetArrayBuffer.mockImplementation(async (path: string) => {
      if (path === '/actions/jobs/2/logs') {
        throw new Error(
          'GitHub API 404: <?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code></Error>',
        );
      }
      return textToArrayBuffer('all good here');
    });

    const result = await fetchRunLogsRing(
      { runId: 26392539058, failedOnly: true },
      500,
    );

    expect(result.lines).toContain(JOB_NEVER_STARTED_MESSAGE);
    expect(result.lines).not.toContain('(Log fetch failed for this job)');
    expect(result.lines).toEqual([
      'ok-job',
      'all good here',
      'startup-failure-job',
      JOB_NEVER_STARTED_MESSAGE,
    ]);
    // Steps were already available from the jobs list — no per-job detail lookup.
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });
});

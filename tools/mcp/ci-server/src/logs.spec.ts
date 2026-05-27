import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('./github-api.js', () => ({
  githubGet: jest.fn(),
  githubGetArrayBuffer: jest.fn(),
}));

import { fetchRunLogsRing } from './logs.js';
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
});

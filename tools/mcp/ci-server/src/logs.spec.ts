import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deflateRawSync } from 'node:zlib';

jest.mock('./github-api.js', () => ({
  githubGet: jest.fn(),
  githubGetArrayBuffer: jest.fn(),
}));

import {
  AmbiguousJobNameError,
  fetchRunLogs,
  fetchRunLogsRing,
  JOB_NEVER_STARTED_MESSAGE,
  resolveJobsByName,
  stripAnsiCodes,
} from './logs.js';
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
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/** Build a STORED (uncompressed) ZIP local file entry with real header sizes. */
function buildStoredZipEntry(name: string, text: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  const data = Buffer.from(text, 'utf-8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed to extract
  header.writeUInt16LE(0, 6); // general purpose bit flag (no data descriptor)
  header.writeUInt16LE(0, 8); // compression method: stored
  header.writeUInt32LE(0, 14); // crc-32 (unchecked by extractTextFromZip)
  header.writeUInt32LE(data.length, 18); // compressed size
  header.writeUInt32LE(data.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBuf, data]);
}

/**
 * Build a DEFLATE ZIP local file entry with general-purpose bit 3 set — i.e.
 * a "streamed" entry whose local header reports zeroed sizes, with the real
 * sizes/CRC only available in a trailing data descriptor. This is the shape
 * GitHub Actions' log archiver produces for larger job logs (LS-9229).
 */
function buildStreamedDeflateZipEntry(name: string, text: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  const compressed = deflateRawSync(Buffer.from(text, 'utf-8'));
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed to extract
  header.writeUInt16LE(0x0008, 6); // general purpose bit flag: data descriptor follows
  header.writeUInt16LE(8, 8); // compression method: deflate
  header.writeUInt32LE(0, 14); // crc-32: zeroed (real value is in the data descriptor)
  header.writeUInt32LE(0, 18); // compressed size: zeroed
  header.writeUInt32LE(0, 22); // uncompressed size: zeroed
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length

  const dataDescriptor = Buffer.alloc(16);
  dataDescriptor.writeUInt32LE(0x08074b50, 0); // optional data descriptor signature
  dataDescriptor.writeUInt32LE(0, 4); // crc-32
  dataDescriptor.writeUInt32LE(compressed.length, 8); // compressed size
  dataDescriptor.writeUInt32LE(text.length, 12); // uncompressed size

  return Buffer.concat([header, nameBuf, compressed, dataDescriptor]);
}

describe('stripAnsiCodes (LS-9557)', () => {
  // Built from String.fromCharCode rather than a \x1b literal — same
  // no-control-regex rationale as logs.ts / get-logs.ts.
  const ESC = String.fromCharCode(27);

  it('strips colour codes and cursor-movement sequences, leaving content intact', () => {
    // Reproduces the sample from LS-9557's description (a ci_search_logs
    // result this fix regression-tests: run 32586634982, job 97065111167).
    const raw = [
      '2026-08-22T17:38:02.9319059Z ',
      `${ESC}[1m${ESC}[31m  ${ESC}[1m● ${ESC}[22m${ESC}[1m`,
      'FootballLeagueId › matchups tab playoff bracket toggle (FLD-017) › does not render the view toggle when the bracket has no seeded matchups',
      `${ESC}[39m${ESC}[22m`,
    ].join('');

    const stripped = stripAnsiCodes(raw);

    expect(stripped.includes(ESC)).toBe(false);
    expect(stripped).toContain('● FootballLeagueId');
  });

  it('strips a broader set than SGR-only color codes (e.g. cursor-movement sequences)', () => {
    const raw = `${ESC}[2K${ESC}[1Gprogress: 50%`;
    expect(stripAnsiCodes(raw)).toBe('progress: 50%');
  });

  it('is a no-op on text with no escape sequences', () => {
    expect(stripAnsiCodes('plain log line')).toBe('plain log line');
  });
});

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
    mockGithubGetArrayBuffer.mockImplementation((path: string) => {
      if (path === '/actions/jobs/2/logs') {
        throw new Error(
          'GitHub API 404: <?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code></Error>',
        );
      }
      return Promise.resolve(textToArrayBuffer('all good here'));
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

describe('errorSummary step-scoping (LS-9556)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  it('scopes a run-based job to only the failing step, dropping successful setup/checkout noise', async () => {
    // Reproduces the "lint & format" job from LS-9556 (run 32586634982, job
    // 97065111193): the failing step is "Lint" (step 3), but the whole job
    // log also includes "Set up job" (runner bootstrap) and "Checkout" (git
    // fetch spam) steps that both succeeded.
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 97065111193,
          name: 'lint & format',
          status: 'completed',
          conclusion: 'failure',
          steps: [
            {
              name: 'Set up job',
              status: 'completed',
              conclusion: 'success',
              number: 1,
            },
            {
              name: 'Checkout',
              status: 'completed',
              conclusion: 'success',
              number: 2,
            },
            {
              name: 'Lint',
              status: 'completed',
              conclusion: 'failure',
              number: 3,
            },
          ],
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        Buffer.concat([
          buildStoredZipEntry(
            '1_Set up job.txt',
            'hook_job_started.sh: runner heartbeat\n',
          ),
          buildStoredZipEntry(
            '2_Checkout.txt',
            '* [new branch]      LS-1001-fix-error-logging -> origin/LS-1001-fix-error-logging\n',
          ),
          buildStoredZipEntry(
            '3_Lint.txt',
            "src/foo.ts\n  12:5  error  'foo' is defined but never used  no-unused-vars\n\n✖ 1 problem (1 error, 0 warnings)\n",
          ),
        ]),
      ),
    );

    const result = await fetchRunLogsRing(
      { runId: 32586634982, failedOnly: true },
      500,
      () => false,
    );

    expect(result.lines.join('\n')).not.toContain('hook_job_started.sh');
    expect(result.lines.join('\n')).not.toContain('new branch');
    expect(result.lines.join('\n')).toContain('no-unused-vars');
    expect(result.lines.join('\n')).toContain('✖ 1 problem');
    // Steps already came from the jobs-list response — no extra job-detail call.
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('scopes a bare-jobId errorSummary call to the failing step via an extra job-detail lookup', async () => {
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        Buffer.concat([
          buildStoredZipEntry('1_Set up job.txt', 'bootstrap noise\n'),
          buildStoredZipEntry('2_Test.txt', 'FAIL src/foo.spec.ts\n'),
        ]),
      ),
    );
    mockGithubGet.mockResolvedValue({
      id: 42,
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      steps: [
        {
          name: 'Set up job',
          status: 'completed',
          conclusion: 'success',
          number: 1,
        },
        { name: 'Test', status: 'completed', conclusion: 'failure', number: 2 },
      ],
    });

    const result = await fetchRunLogsRing({ jobId: 42 }, 500, () => false);

    expect(result.lines.join('\n')).not.toContain('bootstrap noise');
    expect(result.lines.join('\n')).toContain('FAIL src/foo.spec.ts');
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('falls back to the whole job log when no step is marked failure (e.g. a cancelled job)', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 1,
          name: 'cancelled-job',
          status: 'completed',
          conclusion: 'cancelled',
          steps: [
            {
              name: 'Set up job',
              status: 'completed',
              conclusion: 'success',
              number: 1,
            },
            {
              name: 'Build',
              status: 'completed',
              conclusion: 'cancelled',
              number: 2,
            },
          ],
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        buildStoredZipEntry('1_Set up job.txt', 'setup output here\n'),
      ),
    );

    const result = await fetchRunLogsRing(
      { runId: 1, failedOnly: true },
      500,
      () => false,
    );

    expect(result.lines.join('\n')).toContain('setup output here');
  });

  it('does not scope by step when no priorityMatcher is passed (non-errorSummary calls keep the full log)', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 1,
          name: 'lint-job',
          status: 'completed',
          conclusion: 'failure',
          steps: [
            {
              name: 'Set up job',
              status: 'completed',
              conclusion: 'success',
              number: 1,
            },
            {
              name: 'Lint',
              status: 'completed',
              conclusion: 'failure',
              number: 2,
            },
          ],
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        Buffer.concat([
          buildStoredZipEntry('1_Set up job.txt', 'setup output\n'),
          buildStoredZipEntry('2_Lint.txt', 'lint output\n'),
        ]),
      ),
    );

    const result = await fetchRunLogsRing({ runId: 1, failedOnly: true }, 500);

    expect(result.lines.join('\n')).toContain('setup output');
    expect(result.lines.join('\n')).toContain('lint output');
  });
});

describe('fetchRunLogs scope metadata (LS-8301)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  it('flags skippedByFailedOnly when every job in the run succeeded', async () => {
    // Reproduces LS-8301: a completed run where every job succeeded — the
    // failedOnly=true default filters jobs to zero even though the run had
    // jobs whose logs contain the searched-for text.
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      jobs: [
        {
          id: 1,
          name: 'merge-queue-processor',
          status: 'completed',
          conclusion: 'success',
        },
        {
          id: 2,
          name: 'notify',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    });

    const result = await fetchRunLogs({ runId: 28615049081, failedOnly: true });

    expect(result).toEqual({
      text: 'No failed jobs found in this workflow run.',
      jobsSearched: 0,
      jobsTotal: 2,
      skippedByFailedOnly: true,
    });
    expect(mockGithubGetArrayBuffer).not.toHaveBeenCalled();
  });

  it('searches successful jobs and reports full scope when failedOnly=false', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      jobs: [
        {
          id: 1,
          name: 'merge-queue-processor',
          status: 'completed',
          conclusion: 'success',
        },
        {
          id: 2,
          name: 'notify',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('Successfully merged PR #5910'),
    );

    const result = await fetchRunLogs({
      runId: 28615049081,
      failedOnly: false,
    });

    expect(result.jobsSearched).toBe(2);
    expect(result.jobsTotal).toBe(2);
    expect(result.skippedByFailedOnly).toBe(false);
    expect(result.text).toContain('Successfully merged PR #5910');
  });

  it('does not flag skippedByFailedOnly when the run genuinely has zero jobs', async () => {
    mockGithubGet.mockResolvedValue({ total_count: 0, jobs: [] });

    const result = await fetchRunLogs({ runId: 1, failedOnly: true });

    expect(result).toEqual({
      text: 'No failed jobs found in this workflow run.',
      jobsSearched: 0,
      jobsTotal: 0,
      skippedByFailedOnly: false,
    });
  });

  it('reports a single directly-targeted jobId as fully in scope, never filtered', async () => {
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('some log output'),
    );

    const result = await fetchRunLogs({ jobId: 42 });

    expect(result).toEqual({
      text: 'some log output',
      jobsSearched: 1,
      jobsTotal: 1,
      skippedByFailedOnly: false,
    });
  });

  it('reports a mix of failed and successful jobs correctly under failedOnly=true', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      jobs: [
        {
          id: 1,
          name: 'ok-job',
          status: 'completed',
          conclusion: 'success',
        },
        {
          id: 2,
          name: 'broken-job',
          status: 'completed',
          conclusion: 'failure',
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('boom, failed here'),
    );

    const result = await fetchRunLogs({ runId: 1, failedOnly: true });

    expect(result.jobsSearched).toBe(1);
    expect(result.jobsTotal).toBe(2);
    expect(result.skippedByFailedOnly).toBe(false);
  });
});

describe('extractTextFromZip streamed (data-descriptor) entries (LS-9229)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  it('reads content from a streamed DEFLATE entry after a normal STORED entry', async () => {
    // Reproduces LS-9229: GitHub Actions' log archiver streams larger job
    // logs, producing a ZIP entry with general-purpose bit 3 set (sizes
    // zeroed in the local header, real sizes in a trailing data descriptor).
    // The old parser trusted the zeroed compressedSize, landed on the middle
    // of the entry's compressed bytes for its next "signature" check, found
    // no match, and silently `break`-ed — dropping this entry and everything
    // after it while still reporting the search as untruncated.
    const zip = Buffer.concat([
      buildStoredZipEntry('1_setup.txt', 'Setting up job\n'),
      buildStreamedDeflateZipEntry(
        '2_run-e2e-tests.txt',
        'Running 42 tests using 3 workers\n42 passed (18s)\n',
      ),
    ]);

    mockGithubGetArrayBuffer.mockResolvedValue(bufferToArrayBuffer(zip));

    const result = await fetchRunLogs({ jobId: 93328804888 });

    expect(result.text).toContain('Setting up job');
    expect(result.text).toContain('42 passed (18s)');
  });

  it('reads a streamed entry that is the only entry in the archive', async () => {
    const zip = buildStreamedDeflateZipEntry(
      '0_run-e2e-tests.txt',
      'passed: 10\nfailed: 0\n',
    );

    mockGithubGetArrayBuffer.mockResolvedValue(bufferToArrayBuffer(zip));

    const result = await fetchRunLogs({ jobId: 1 });

    expect(result.text).toContain('passed: 10');
  });

  it('reads multiple consecutive streamed entries', async () => {
    const zip = Buffer.concat([
      buildStreamedDeflateZipEntry('0_step-one.txt', 'step one output\n'),
      buildStreamedDeflateZipEntry('1_step-two.txt', 'step two output\n'),
    ]);

    mockGithubGetArrayBuffer.mockResolvedValue(bufferToArrayBuffer(zip));

    const result = await fetchRunLogs({ jobId: 1 });

    expect(result.text).toContain('step one output');
    expect(result.text).toContain('step two output');
  });

  it('stops parsing rather than reading out of bounds when fileNameLength overruns the buffer', async () => {
    // legacy-sports-review-bot flagged this on the PR: a malicious/corrupt
    // header could claim a fileNameLength/extraFieldLength that pushes
    // dataOffset past the end of the buffer.
    const good = buildStoredZipEntry('0_setup.txt', 'setup output\n');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(0, 18);
    header.writeUInt32LE(0, 22);
    header.writeUInt16LE(60_000, 26); // fileNameLength claims far more than remains
    header.writeUInt16LE(0, 28);
    const malformed = Buffer.concat([header, Buffer.from('short')]);

    const zip = Buffer.concat([good, malformed]);
    mockGithubGetArrayBuffer.mockResolvedValue(bufferToArrayBuffer(zip));

    const result = await fetchRunLogs({ jobId: 1 });

    expect(result.text).toContain('setup output');
  });
});

describe('resolveJobsByName (LS-9578)', () => {
  const jobs = [
    {
      id: 1,
      name: '🚀 CI Pipeline / test',
      status: 'completed',
      conclusion: 'success',
    },
    {
      id: 2,
      name: '🚀 CI Pipeline / E2E Tests (Mobile Chrome — affected)',
      status: 'completed',
      conclusion: 'failure',
    },
    {
      id: 3,
      name: '🚀 CI Pipeline / E2E Tests (Shard 1/3)',
      status: 'completed',
      conclusion: 'failure',
    },
  ];

  it('prefers an exact case-insensitive full-name match over substring matches', () => {
    const result = resolveJobsByName(jobs, '🚀 ci pipeline / test');
    expect(result).toEqual([jobs[0]]);
  });

  it('throws AmbiguousJobNameError listing every candidate when multiple jobs substring-match', () => {
    // Reproduces LS-9578: "test" is a substring of all three job names above.
    expect(() => resolveJobsByName(jobs, 'test')).toThrow(
      AmbiguousJobNameError,
    );
    try {
      resolveJobsByName(jobs, 'test');
      throw new Error('expected resolveJobsByName to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AmbiguousJobNameError);
      const ambiguous = err as AmbiguousJobNameError;
      expect(ambiguous.candidates).toEqual([
        { id: 1, name: jobs[0].name },
        { id: 2, name: jobs[1].name },
        { id: 3, name: jobs[2].name },
      ]);
      expect(ambiguous.message).toContain(jobs[0].name);
      expect(ambiguous.message).toContain(jobs[1].name);
      expect(ambiguous.message).toContain(jobs[2].name);
    }
  });

  it('returns a single unambiguous substring match', () => {
    const result = resolveJobsByName(jobs, 'shard 1');
    expect(result).toEqual([jobs[2]]);
  });

  it('returns no matches for a name that matches nothing', () => {
    expect(resolveJobsByName(jobs, 'security scan')).toEqual([]);
  });

  it('exact: true disables the substring fallback even for an otherwise-unambiguous substring match', () => {
    expect(resolveJobsByName(jobs, 'shard 1', true)).toEqual([]);
  });
});

describe('fetchRunLogs / fetchRunLogsRing jobName disambiguation (LS-9578)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  const ambiguousJobs = {
    total_count: 3,
    jobs: [
      {
        id: 1,
        name: '🚀 CI Pipeline / test',
        status: 'completed',
        conclusion: 'success',
      },
      {
        id: 2,
        name: '🚀 CI Pipeline / E2E Tests (Mobile Chrome — affected)',
        status: 'completed',
        conclusion: 'failure',
      },
    ],
  };

  it('fetchRunLogs rejects an ambiguous jobName instead of silently picking a job', async () => {
    mockGithubGet.mockResolvedValue(ambiguousJobs);

    await expect(fetchRunLogs({ runId: 1, jobName: 'test' })).rejects.toThrow(
      AmbiguousJobNameError,
    );
    expect(mockGithubGetArrayBuffer).not.toHaveBeenCalled();
  });

  it('fetchRunLogsRing rejects an ambiguous jobName even though the intended job succeeded and would otherwise be filtered out by failedOnly first', async () => {
    // Reproduces the exact LS-9578 report: the target job ("test") succeeded
    // so failedOnly would exclude it, and resolving jobName only against the
    // already-filtered (failedOnly) list left a single unrelated failed job
    // as an unflagged, silently-returned "match". Resolution must happen
    // against the full job list so this stays ambiguous and errors instead.
    mockGithubGet.mockResolvedValue(ambiguousJobs);

    await expect(
      fetchRunLogsRing({ runId: 1, jobName: 'test' }, 500),
    ).rejects.toThrow(AmbiguousJobNameError);
    expect(mockGithubGetArrayBuffer).not.toHaveBeenCalled();
  });

  it('fetchRunLogsRing echoes resolvedJobName/resolvedJobId when jobName resolves to exactly one job', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      jobs: [
        {
          id: 2,
          name: '🚀 CI Pipeline / E2E Tests (Mobile Chrome — affected)',
          status: 'completed',
          conclusion: 'failure',
        },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('some log output'),
    );

    const result = await fetchRunLogsRing(
      { runId: 1, jobName: 'Mobile Chrome' },
      500,
    );

    expect(result.resolvedJobName).toBe(
      '🚀 CI Pipeline / E2E Tests (Mobile Chrome — affected)',
    );
    expect(result.resolvedJobId).toBe(2);
  });

  it('fetchRunLogsRing with exact: true finds the exact-named job even when it would otherwise substring-match ambiguously', async () => {
    mockGithubGet.mockResolvedValue(ambiguousJobs);
    mockGithubGetArrayBuffer.mockResolvedValue(
      textToArrayBuffer('the test job output'),
    );

    const result = await fetchRunLogsRing(
      {
        runId: 1,
        jobName: '🚀 CI Pipeline / test',
        exact: true,
        failedOnly: false,
      },
      500,
    );

    expect(result.resolvedJobName).toBe('🚀 CI Pipeline / test');
    expect(result.resolvedJobId).toBe(1);
  });
});

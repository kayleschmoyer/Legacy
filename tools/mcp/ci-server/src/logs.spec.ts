import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('./github-api.js', () => ({
  githubGet: jest.fn(),
  githubGetArrayBuffer: jest.fn(),
}));

import {
  fetchRunLogs,
  fetchRunLogsRing,
  JOB_NEVER_STARTED_MESSAGE,
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
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
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

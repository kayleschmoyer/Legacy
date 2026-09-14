jest.mock('../github-api', () => ({
  githubGetArrayBuffer: jest.fn(),
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { getJobLogs } from './get-job-logs';

const { githubGetArrayBuffer: mockGetArrayBuffer, githubRest: mockRest } =
  jest.requireMock<{
    githubGetArrayBuffer: jest.Mock;
    githubRest: jest.Mock;
  }>('../github-api');
const { getRepoOwnerName: mockGetRepo } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');

function makeLogBuffer(content: string): ArrayBuffer {
  const buf = Buffer.from(content);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
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
  header.writeUInt32LE(0, 14); // crc-32 (unchecked by extractZipEntries)
  header.writeUInt32LE(data.length, 18); // compressed size
  header.writeUInt32LE(data.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBuf, data]);
}

function makeZipBuffer(entries: Buffer[]): ArrayBuffer {
  const buf = Buffer.concat(entries);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepo.mockResolvedValue({ owner: 'bkrupa', name: 'legacy-sports' });
});

describe('getJobLogs', () => {
  it('errors when neither job_id nor run_id is provided', async () => {
    const result = await getJobLogs({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/job_id.*run_id/i);
  });

  describe('tail_lines enforcement (AC1 + AC3)', () => {
    it('bounds output to tail_lines when log exceeds the limit', async () => {
      // Build a log archive larger than 50 KB
      const manyLines = Array.from({ length: 5000 }, (_, i) => `log line ${i}`);
      const bigLog = manyLines.join('\n');
      expect(Buffer.byteLength(bigLog)).toBeGreaterThan(50_000);

      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(bigLog));

      const result = await getJobLogs({
        jobId: 42,
        tailLines: 100,
        maxChars: 1_000_000,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.totalLines).toBe(5000);
      expect(payload.tailLines).toBe(100);
      expect(payload.truncated).toBe(true);
      const returnedLines = (payload.logs as string)
        .split('\n')
        .filter((l) => !l.startsWith('...'));
      expect(returnedLines.length).toBeLessThanOrEqual(100);
    });

    it('does not truncate when log is within tail_lines', async () => {
      const smallLog = Array.from({ length: 50 }, (_, i) => `line ${i}`).join(
        '\n',
      );
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(smallLog));

      const result = await getJobLogs({
        jobId: 7,
        tailLines: 100,
        maxChars: 1_000_000,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.truncated).toBe(false);
      expect(payload.logs as string).not.toContain('[truncated');
    });
  });

  describe('maxChars hard cap (AC2)', () => {
    it('truncates to maxChars and appends the indicator', async () => {
      const log = 'A'.repeat(200) + '\n' + 'B'.repeat(200);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(log));

      const result = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
        maxChars: 50,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.truncated).toBe(true);
      expect(payload.logs as string).toContain('[truncated,');
      expect(
        (payload.logs as string).replace(/\n\.\.\. \[truncated.*\]$/, '')
          .length,
      ).toBeLessThanOrEqual(50);
    });

    it('defaults to 10 000 chars when max_chars is not set', async () => {
      const bigLog = 'x'.repeat(20_000);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(bigLog));

      const result = await getJobLogs({ jobId: 1 });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.truncated).toBe(true);
      expect((payload.logs as string).length).toBeLessThanOrEqual(11_000);
    });
  });

  describe('truncateLineLength (AC1 + AC2 + AC4)', () => {
    it('truncates a line longer than truncate_line_length with the indicator', async () => {
      const longLine = 'x'.repeat(1000);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(longLine));

      const result = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
        maxChars: 1_000_000,
        truncateLineLength: 50,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      const logsStr = payload.logs as string;
      expect(logsStr).toContain('...[line truncated]');
      for (const line of logsStr.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(
          50 + '...[line truncated]'.length,
        );
      }
    });

    it('truncates multiple long lines independently so more lines survive the same maxChars budget', async () => {
      const longLine = 'y'.repeat(500);
      const lines = Array.from({ length: 10 }, () => longLine);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(lines.join('\n')));

      const withoutTruncation = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
        maxChars: 1200,
      });
      const withTruncation = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
        maxChars: 1200,
        truncateLineLength: 50,
      });

      const countFullLines = (text: string) =>
        text.split('\n').filter((l) => l === longLine).length;
      const countTruncatedLines = (text: string) =>
        text
          .split('\n')
          .filter((l) => l.startsWith('y'.repeat(50)) && l !== longLine).length;

      const linesWithout = countFullLines(
        parse(withoutTruncation.content[0].text).logs as string,
      );
      const linesWith = countTruncatedLines(
        parse(withTruncation.content[0].text).logs as string,
      );

      expect(linesWith).toBeGreaterThan(linesWithout);
    });

    it('applies truncate_line_length in errorSummary mode too', async () => {
      const longErrorLine = `error: ${'z'.repeat(1000)}`;
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(longErrorLine));

      const result = await getJobLogs({
        jobId: 1,
        errorSummary: true,
        truncateLineLength: 50,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      const logsStr = payload.logs as string;
      expect(logsStr).toContain('...[line truncated]');
      for (const line of logsStr.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(
          50 + '...[line truncated]'.length,
        );
      }
    });

    it('leaves behavior unchanged when truncate_line_length is omitted', async () => {
      const longLine = 'x'.repeat(1000);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(longLine));

      const result = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
        maxChars: 1_000_000,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.logs as string).toBe(longLine);
      expect(payload.logs as string).not.toContain('[line truncated]');
    });
  });

  describe('errorSummary mode', () => {
    it('extracts only error lines and includes totalLogLines', async () => {
      const lines = [
        'noise line 1',
        'noise line 2',
        'noise line 3',
        'noise line 4',
        'noise line 5',
        'Step: error: something broke',
        'noise line 6',
        'noise line 7',
        'noise line 8',
        'noise line 9',
        'noise line 10',
        'Failed tasks',
        '- build',
      ];
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(lines.join('\n')));

      const result = await getJobLogs({ jobId: 5, errorSummary: true });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.errorSummary).toBe(true);
      expect(payload.totalLogLines).toBe(lines.length);
      expect(payload.logs as string).toContain('error: something broke');
      expect(payload.logs as string).toContain('Failed tasks');
      // Lines far from the error are not included (only 2-line context window)
      expect(payload.logs as string).not.toContain('noise line 1');
    });
  });

  describe('grep_pattern (LS-9633)', () => {
    it('extracts only matching lines plus 2 lines of context', async () => {
      const lines = [
        'noise line 1',
        'noise line 2',
        'noise line 3',
        'noise line 4',
        'noise line 5',
        '5 passed, 1 failed',
        'noise line 6',
        'noise line 7',
        'noise line 8',
      ];
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(lines.join('\n')));

      const result = await getJobLogs({ jobId: 1, grepPattern: 'failed' });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.grepPattern).toBe('failed');
      expect(payload.totalLogLines).toBe(lines.length);
      expect(payload.matchedLines).toBe(5);
      expect(payload.logs as string).toContain('5 passed, 1 failed');
      expect(payload.logs as string).toContain('noise line 4');
      expect(payload.logs as string).toContain('noise line 6');
      expect(payload.logs as string).not.toContain('noise line 1');
      expect(payload.logs as string).not.toContain('noise line 8');
    });

    it('matches case-insensitively', async () => {
      mockGetArrayBuffer.mockResolvedValue(
        makeLogBuffer('Some FAILURE happened'),
      );

      const result = await getJobLogs({ jobId: 1, grepPattern: 'failure' });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.logs as string).toContain('Some FAILURE happened');
    });

    it('still applies tail_lines/max_chars/truncate_line_length to matched lines', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `error ${i}`);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(lines.join('\n')));

      const result = await getJobLogs({
        jobId: 1,
        grepPattern: 'error',
        tailLines: 5,
        maxChars: 1_000_000,
      });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.truncated).toBe(true);
      expect(payload.returnedLines).toBe(5);
    });

    it('rejects an overly long grep_pattern', async () => {
      const result = await getJobLogs({
        jobId: 1,
        grepPattern: 'x'.repeat(201),
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('too long');
      expect(mockGetArrayBuffer).not.toHaveBeenCalled();
    });

    it('treats a regex-special character in grep_pattern as a literal', async () => {
      const lines = ['a.b', 'gap 1', 'gap 2', 'gap 3', 'gap 4', 'axb'];
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(lines.join('\n')));

      const result = await getJobLogs({ jobId: 1, grepPattern: 'a.b' });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.matchedLines).toBe(3);
      expect(payload.logs as string).toContain('a.b');
      expect(payload.logs as string).not.toContain('axb');
    });

    it('rejects grep_pattern combined with error_summary', async () => {
      const result = await getJobLogs({
        jobId: 1,
        grepPattern: 'error',
        errorSummary: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('mutually exclusive');
      expect(mockGetArrayBuffer).not.toHaveBeenCalled();
    });
  });

  describe('failing-step scoping (LS-9644)', () => {
    it('scopes job_id logs to the step GitHub marked as failed', async () => {
      const zip = makeZipBuffer([
        buildStoredZipEntry('1_Set up job.txt', 'setup output, all fine\n'),
        buildStoredZipEntry(
          '2_Run tests.txt',
          'FAIL src/foo.spec.ts\nExpect failure here\n',
        ),
        buildStoredZipEntry('3_Cleanup.txt', 'cleanup noise\n'),
      ]);
      mockGetArrayBuffer.mockResolvedValue(zip);
      mockRest.mockResolvedValue({
        id: 42,
        name: 'test',
        conclusion: 'failure',
        steps: [
          { name: 'Set up job', conclusion: 'success', number: 1 },
          { name: 'Run tests', conclusion: 'failure', number: 2 },
          { name: 'Cleanup', conclusion: 'success', number: 3 },
        ],
      });

      const result = await getJobLogs({ jobId: 42 });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.scopedToFailingStep).toBe(true);
      expect(payload.failingSteps).toEqual(['Run tests']);
      expect(payload.logs as string).toContain('Expect failure here');
      expect(payload.logs as string).not.toContain('setup output');
      expect(payload.logs as string).not.toContain('cleanup noise');
    });

    it('falls back to the whole log when no step is marked failed', async () => {
      const zip = makeZipBuffer([
        buildStoredZipEntry('1_Set up job.txt', 'setup output\n'),
        buildStoredZipEntry('2_Run tests.txt', 'all good\n'),
      ]);
      mockGetArrayBuffer.mockResolvedValue(zip);
      mockRest.mockResolvedValue({
        id: 43,
        name: 'test',
        conclusion: 'cancelled',
        steps: [
          { name: 'Set up job', conclusion: 'success', number: 1 },
          { name: 'Run tests', conclusion: 'cancelled', number: 2 },
        ],
      });

      const result = await getJobLogs({ jobId: 43 });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.scopedToFailingStep).toBe(false);
      expect(payload.failingSteps).toBeUndefined();
      expect(payload.logs as string).toContain('setup output');
      expect(payload.logs as string).toContain('all good');
    });

    it('falls back to the whole log for a plain-text (non-ZIP) log response', async () => {
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer('plain text log\n'));

      const result = await getJobLogs({ jobId: 44 });

      expect(result.isError).toBeFalsy();
      expect(mockRest).not.toHaveBeenCalled();
      const payload = parse(result.content[0].text);
      expect(payload.scopedToFailingStep).toBe(false);
      expect(payload.logs as string).toContain('plain text log');
    });

    it('surfaces returnedFrom: "tail" and returnedLines only when truncated', async () => {
      const manyLines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer(manyLines.join('\n')));

      const truncatedResult = await getJobLogs({ jobId: 1, tailLines: 50 });
      const truncatedPayload = parse(truncatedResult.content[0].text);
      expect(truncatedPayload.truncated).toBe(true);
      expect(truncatedPayload.returnedFrom).toBe('tail');
      expect(truncatedPayload.returnedLines).toBe(50);

      const untruncatedResult = await getJobLogs({
        jobId: 1,
        tailLines: 1000,
      });
      const untruncatedPayload = parse(untruncatedResult.content[0].text);
      expect(untruncatedPayload.truncated).toBe(false);
      expect(untruncatedPayload.returnedFrom).toBeUndefined();
      expect(untruncatedPayload.returnedLines).toBe(300);
    });
  });

  describe('run_id path', () => {
    function makeJobsResponse(
      jobs: Array<{ id: number; name: string; conclusion: string | null }>,
    ) {
      return { total_count: jobs.length, jobs };
    }

    it('fetches logs for all failed jobs in a run', async () => {
      mockRest.mockResolvedValue(
        makeJobsResponse([
          { id: 10, name: 'build', conclusion: 'failure' },
          { id: 11, name: 'lint', conclusion: 'success' },
        ]),
      );
      mockGetArrayBuffer.mockResolvedValue(makeLogBuffer('build error'));

      const result = await getJobLogs({ runId: 99, failedOnly: true });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.jobLabel).toBe('run 99');
      expect(mockGetArrayBuffer).toHaveBeenCalledTimes(1);
      expect(mockGetArrayBuffer).toHaveBeenCalledWith(
        'bkrupa',
        'legacy-sports',
        '/actions/jobs/10/logs',
      );
    });

    it('returns no-jobs message when no failed jobs exist', async () => {
      mockRest.mockResolvedValue(makeJobsResponse([]));

      const result = await getJobLogs({ runId: 77, failedOnly: true });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/no failed jobs/i);
      expect(mockGetArrayBuffer).not.toHaveBeenCalled();
    });

    it('scopes to the failing step using steps already present on the jobs-list response (LS-9644, no extra fetch)', async () => {
      mockRest.mockResolvedValue({
        total_count: 1,
        jobs: [
          {
            id: 10,
            name: 'build',
            conclusion: 'failure',
            steps: [
              { name: 'Set up job', conclusion: 'success', number: 1 },
              { name: 'Build', conclusion: 'failure', number: 2 },
            ],
          },
        ],
      });
      const zip = makeZipBuffer([
        buildStoredZipEntry('1_Set up job.txt', 'setup output\n'),
        buildStoredZipEntry('2_Build.txt', 'build error here\n'),
      ]);
      mockGetArrayBuffer.mockResolvedValue(zip);

      const result = await getJobLogs({ runId: 99, failedOnly: true });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.scopedToFailingStep).toBe(true);
      expect(payload.failingSteps).toEqual(['Build']);
      expect(payload.logs as string).toContain('build error here');
      expect(payload.logs as string).not.toContain('setup output');
      // Only the jobs-list call — no separate per-job detail fetch needed.
      expect(mockRest).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('wraps fetch errors as isError response', async () => {
      mockGetArrayBuffer.mockRejectedValue(
        new Error('GitHub API 404: not found'),
      );

      const result = await getJobLogs({ jobId: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('GitHub API 404');
    });
  });

  describe('BlobNotFound 404 (LS-10158)', () => {
    const blobNotFoundError = new Error(
      'GitHub API GET /actions/jobs/103634057690/logs failed (404): ' +
        '<?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code>' +
        '<Message>The specified blob does not exist.\n' +
        'RequestId:dc37d091-f01e-0025-750a-433296000000\n' +
        'Time:2026-09-12T23:00:10.5748648Z</Message></Error>',
    );

    it('translates a BlobNotFound 404 into an actionable message on the job_id path', async () => {
      mockGetArrayBuffer.mockRejectedValue(blobNotFoundError);

      const result = await getJobLogs({ jobId: 103634057690 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain('BlobNotFound');
      expect(result.content[0].text).not.toContain('<?xml');
      expect(result.content[0].text).toMatch(/not yet available/i);
      expect(result.content[0].text).toMatch(/retry/i);
    });

    it('still passes through a genuine (non-blob) 404 as-is on the job_id path', async () => {
      mockGetArrayBuffer.mockRejectedValue(
        new Error(
          'GitHub API GET /actions/jobs/1/logs failed (404): {"message":"Not Found"}',
        ),
      );

      const result = await getJobLogs({ jobId: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toMatch(/not yet available/i);
    });

    it('translates a BlobNotFound 404 into an actionable per-job message on the run_id path', async () => {
      mockRest.mockResolvedValue({
        total_count: 1,
        jobs: [{ id: 10, name: 'build', conclusion: 'failure' }],
      });
      mockGetArrayBuffer.mockRejectedValue(blobNotFoundError);

      const result = await getJobLogs({ runId: 99, failedOnly: true });

      expect(result.isError).toBeFalsy();
      const payload = parse(result.content[0].text);
      expect(payload.logs as string).not.toContain('BlobNotFound');
      expect(payload.logs as string).toMatch(/not yet available/i);
    });
  });
});

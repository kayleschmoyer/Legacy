import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// run-command.ts uses import.meta, which the CJS jest build cannot compile —
// mock it out the same way run-target.spec.ts does.
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

import {
  formatPcChunkLogTail,
  getSuccessMarkerForChunk,
  getTimeoutForChunk,
  PC_CHUNKS,
  runPcChunk,
} from './run-pc-chunk.js';
import type { PcChunk } from './run-pc-chunk.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;

/** Enough consecutive prettier per-file lines to trigger compressFormatterOutput. */
function prettierListing(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `apps/web/File${i}.tsx ${10 + i}ms (unchanged)`,
  ).join('\n');
}

const HEAVY_CHUNKS: PcChunk[] = ['pc-lint', 'pc-test'];
const LIGHT_CHUNKS = PC_CHUNKS.filter((chunk) => !HEAVY_CHUNKS.includes(chunk));

describe('getTimeoutForChunk', () => {
  it('gives pc-lint and pc-test a longer timeout than every other chunk', () => {
    for (const heavy of HEAVY_CHUNKS) {
      for (const light of LIGHT_CHUNKS) {
        expect(getTimeoutForChunk(heavy)).toBeGreaterThan(
          getTimeoutForChunk(light),
        );
      }
    }
  });

  it('uses one shared default for the five non-heavy chunks', () => {
    const timeouts = new Set(LIGHT_CHUNKS.map(getTimeoutForChunk));
    expect(timeouts.size).toBe(1);
  });
});

describe('getSuccessMarkerForChunk', () => {
  it('matches the real nx success line for pc-lint', () => {
    const marker = getSuccessMarkerForChunk('pc-lint');
    expect(marker).toBeDefined();
    expect(
      marker?.test('NX   Successfully ran target lint for 30 projects'),
    ).toBe(true);
  });

  it('matches the real nx success line for pc-test', () => {
    const marker = getSuccessMarkerForChunk('pc-test');
    expect(marker).toBeDefined();
    expect(
      marker?.test(
        'NX   Successfully ran target test for 40 projects and 2 tasks they depend on',
      ),
    ).toBe(true);
  });

  it("does not accept the other heavy chunk's success line", () => {
    expect(
      getSuccessMarkerForChunk('pc-lint')?.test(
        'NX   Successfully ran target test for 40 projects',
      ),
    ).toBe(false);
    expect(
      getSuccessMarkerForChunk('pc-test')?.test(
        'NX   Successfully ran target lint for 30 projects',
      ),
    ).toBe(false);
  });

  it('returns undefined for multi-step chunks so partial success lines cannot mask a later hang', () => {
    for (const chunk of LIGHT_CHUNKS) {
      expect(getSuccessMarkerForChunk(chunk)).toBeUndefined();
    }
  });
});

describe('runPcChunk — maxWorkers validation (LS-8666)', () => {
  it('rejects a non-positive maxWorkers before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-test', maxWorkers: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });

  it('rejects a non-integer maxWorkers before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-test', maxWorkers: 1.5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });
});

describe('runPcChunk — parallel validation (LS-9114)', () => {
  it('rejects a non-positive parallel before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-lint', parallel: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid parallel');
  });

  it('rejects a non-integer parallel before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-lint', parallel: 1.5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid parallel');
  });
});

describe('runPcChunk — compaction shared with nx_job_wait (LS-9814)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tags the job with meta.kind:"pc-chunk" so nx_job_wait can apply the same compaction', async () => {
    mockRunJob.mockImplementation((jobOpts: StartJobOptions) =>
      Promise.resolve({
        jobId: 'pc-1',
        status: 'done',
        label: jobOpts.label,
        cwd: jobOpts.cwd,
        elapsedSec: 60,
        exitCode: 0,
        error: null,
        meta: jobOpts.meta,
        log: '',
      } satisfies JobSnapshot),
    );

    await runPcChunk({ chunk: 'pc-format' });

    expect(mockRunJob.mock.calls[0][0].meta).toEqual({
      kind: 'pc-chunk',
      chunk: 'pc-format',
      verbose: false,
    });
  });

  it('compacts the inline done result the same way a deferred nx_job_wait result would be', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'pc-2',
      status: 'done',
      label: 'pc-format',
      cwd: '/repo',
      elapsedSec: 60,
      exitCode: 0,
      error: null,
      meta: { kind: 'pc-chunk', chunk: 'pc-format', verbose: false },
      log: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await runPcChunk({ chunk: 'pc-format' });

    const parsed = JSON.parse(result.content[0].text) as { output: string };
    expect(parsed.output).toContain(
      '[Formatting: 50 files checked, 0 changed]',
    );
    expect(parsed.output).not.toContain('File0.tsx');
  });

  it('compacts a running snapshot logTail inline (not just once terminal)', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'pc-3',
      status: 'running',
      label: 'pc-lint',
      cwd: '/repo',
      elapsedSec: 45,
      exitCode: null,
      error: null,
      logTail: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await runPcChunk({ chunk: 'pc-lint' });

    const parsed = JSON.parse(result.content[0].text) as { logTail: string };
    expect(parsed.logTail).toContain(
      '[Formatting: 50 files checked, 0 changed]',
    );
    expect(parsed.logTail).not.toContain('File0.tsx');
  });

  it('returns raw output/logTail when verbose:true is requested', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'pc-4',
      status: 'done',
      label: 'pc-format',
      cwd: '/repo',
      elapsedSec: 60,
      exitCode: 0,
      error: null,
      meta: { kind: 'pc-chunk', chunk: 'pc-format', verbose: true },
      log: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await runPcChunk({ chunk: 'pc-format', verbose: true });

    const parsed = JSON.parse(result.content[0].text) as { output: string };
    expect(parsed.output).toContain('File0.tsx');
  });
});

describe('formatPcChunkLogTail', () => {
  it('compacts by default', () => {
    expect(formatPcChunkLogTail(prettierListing(50), undefined)).not.toContain(
      'File0.tsx',
    );
  });

  it('passes through raw text when verbose', () => {
    expect(formatPcChunkLogTail(prettierListing(50), true)).toContain(
      'File0.tsx',
    );
  });
});

import { describe, expect, it, jest } from '@jest/globals';

// run-command.ts uses import.meta, which the CJS jest build cannot compile —
// job-tools.ts now transitively imports it via run-pc-chunk.js, so mock it
// out the same way run-pc-chunk.spec.ts does.
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

jest.mock('../jobs.js', () => ({
  MAX_WAIT_MS: 60_000,
  listJobs: jest.fn(),
  snapshotJob: jest.fn(),
  waitForJob: jest.fn(),
}));

import { jobStatus, jobWait } from './job-tools.js';
import { snapshotJob, waitForJob } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';

const mockSnapshotJob = snapshotJob as jest.MockedFunction<typeof snapshotJob>;
const mockWaitForJob = waitForJob as jest.MockedFunction<typeof waitForJob>;

/** Enough consecutive prettier per-file lines to trigger compressFormatterOutput. */
function prettierListing(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `apps/web/File${i}.tsx ${10 + i}ms (unchanged)`,
  ).join('\n');
}

describe('jobStatus daemon-failure detection (LS-8819)', () => {
  it('reports daemonError for a "done" nx_run job whose daemon failed to compute the project graph', async () => {
    mockSnapshotJob.mockReturnValue({
      jobId: 'nx-1',
      status: 'done',
      label: 'nx run mcp-github-server:test',
      cwd: '/repo',
      elapsedSec: 131,
      exitCode: 0,
      error: null,
      log: 'Calculating the project graph on the Nx Daemon\n\n NX   Nx Daemon was not able to compute the project graph.\n',
    } satisfies JobSnapshot);

    const result = await jobStatus({ jobId: 'nx-1' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text) as {
      passed: boolean;
      daemonError?: boolean;
      hint?: string;
    };
    expect(parsed.passed).toBe(false);
    expect(parsed.daemonError).toBe(true);
    expect(parsed.hint).toMatch(/make clean-cache/);
  });

  it('does not flag a genuinely passing nx_run job', async () => {
    mockSnapshotJob.mockReturnValue({
      jobId: 'nx-2',
      status: 'done',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 3,
      exitCode: 0,
      error: null,
      log: ' NX   Successfully ran target test for project shared-components\n',
    } satisfies JobSnapshot);

    const result = await jobStatus({ jobId: 'nx-2' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      passed: boolean;
      daemonError?: boolean;
      hint?: string;
    };
    expect(parsed.passed).toBe(true);
    expect(parsed.daemonError).toBeUndefined();
  });

  it('does not apply the daemon check to a non-nx job (label does not start with "nx ")', async () => {
    mockSnapshotJob.mockReturnValue({
      jobId: 'other-1',
      status: 'done',
      label: 'some other job',
      cwd: '/repo',
      elapsedSec: 3,
      exitCode: 0,
      error: null,
      log: 'no completion marker here',
    } satisfies JobSnapshot);

    const result = await jobStatus({ jobId: 'other-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      passed: boolean;
      daemonError?: boolean;
      hint?: string;
    };
    expect(parsed.passed).toBe(true);
    expect(parsed.daemonError).toBeUndefined();
  });

  it('leaves an already-failed job as failed without adding daemonError', async () => {
    mockSnapshotJob.mockReturnValue({
      jobId: 'nx-3',
      status: 'failed',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 5,
      exitCode: 1,
      error: 'nx run shared-components:test exited with code 1',
      log: 'FAIL shared-components/LoginPage.spec.ts',
    } satisfies JobSnapshot);

    const result = await jobStatus({ jobId: 'nx-3' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text) as {
      passed: boolean;
      daemonError?: boolean;
      hint?: string;
    };
    expect(parsed.passed).toBe(false);
    expect(parsed.daemonError).toBeUndefined();
  });
});

describe('pc-chunk compaction via nx_job_wait (LS-9814)', () => {
  it('collapses a done pc-format job routed through nx_job_wait, not just the inline path', async () => {
    mockWaitForJob.mockResolvedValue({
      jobId: 'pc-chunk-1',
      status: 'done',
      label: 'pc-format',
      cwd: '/repo',
      elapsedSec: 60,
      exitCode: 0,
      error: null,
      meta: { kind: 'pc-chunk', chunk: 'pc-format', verbose: false },
      log: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await jobWait({ jobId: 'pc-chunk-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      chunk?: string;
      passed: boolean;
      output: string;
    };
    expect(parsed.chunk).toBe('pc-format');
    expect(parsed.passed).toBe(true);
    expect(parsed.output).toContain(
      '[Formatting: 50 files checked, 0 changed]',
    );
    expect(parsed.output).not.toContain('File0.tsx');
  });

  it('returns raw output for a done pc-chunk job when the originating call passed verbose:true', async () => {
    mockWaitForJob.mockResolvedValue({
      jobId: 'pc-chunk-2',
      status: 'done',
      label: 'pc-lint',
      cwd: '/repo',
      elapsedSec: 60,
      exitCode: 0,
      error: null,
      meta: { kind: 'pc-chunk', chunk: 'pc-lint', verbose: true },
      log: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await jobWait({ jobId: 'pc-chunk-2' });

    const parsed = JSON.parse(result.content[0].text) as { output: string };
    expect(parsed.output).toContain('File0.tsx');
  });

  it('collapses a still-running pc-chunk job logTail the same way', async () => {
    mockWaitForJob.mockResolvedValue({
      jobId: 'pc-chunk-3',
      status: 'running',
      label: 'pc-lint',
      cwd: '/repo',
      elapsedSec: 50,
      exitCode: null,
      error: null,
      meta: { kind: 'pc-chunk', chunk: 'pc-lint', verbose: false },
      logTail: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await jobWait({ jobId: 'pc-chunk-3' });

    const parsed = JSON.parse(result.content[0].text) as { logTail: string };
    expect(parsed.logTail).toContain(
      '[Formatting: 50 files checked, 0 changed]',
    );
    expect(parsed.logTail).not.toContain('File0.tsx');
  });

  it('leaves a non pc-chunk running job logTail raw (no regression for other job kinds)', async () => {
    mockWaitForJob.mockResolvedValue({
      jobId: 'nx-run-1',
      status: 'running',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 10,
      exitCode: null,
      error: null,
      logTail: prettierListing(50),
    } satisfies JobSnapshot);

    const result = await jobWait({ jobId: 'nx-run-1' });

    const parsed = JSON.parse(result.content[0].text) as { logTail: string };
    expect(parsed.logTail).toContain('File0.tsx');
  });
});

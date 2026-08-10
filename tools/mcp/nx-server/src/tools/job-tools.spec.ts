import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../jobs.js', () => ({
  MAX_WAIT_MS: 60_000,
  listJobs: jest.fn(),
  snapshotJob: jest.fn(),
  waitForJob: jest.fn(),
}));

import { snapshotJob } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { jobStatus } from './job-tools.js';

const mockSnapshotJob = snapshotJob as jest.MockedFunction<typeof snapshotJob>;

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
    const parsed = JSON.parse(result.content[0].text as string);
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
    const parsed = JSON.parse(result.content[0].text as string);
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
    const parsed = JSON.parse(result.content[0].text as string);
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
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.passed).toBe(false);
    expect(parsed.daemonError).toBeUndefined();
  });
});

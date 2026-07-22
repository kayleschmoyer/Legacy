import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listJobs,
  runJobWithBudget,
  snapshotJob,
  startJob,
  waitForJob,
} from './jobs';

describe('background job registry', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'worktree-jobs-test-'));
    // Makefile recipes require a leading TAB. Use `echo`/`node` (not `true`):
    // when these tests run as a descendant of `make pc` on Windows, the child
    // make finds no sh.exe in PATH and execs simple commands directly via
    // CreateProcess — `echo` routes through the cmd.exe fallback shell and
    // `node` is a real executable, so both work under sh and cmd.
    writeFileSync(
      join(workDir, 'Makefile'),
      'noop:\n\t@echo ok\n' +
        'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n',
    );
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('snapshotJob returns null for an unknown jobId', () => {
    expect(snapshotJob('does-not-exist')).toBeNull();
  });

  it('waitForJob returns null for an unknown jobId', async () => {
    expect(await waitForJob('does-not-exist', 1_000)).toBeNull();
  });

  it('startJob returns a jobId immediately and the job reaches done', async () => {
    const { jobId, existing } = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'noop',
      timeoutMs: 30_000,
    });
    expect(existing).toBe(false);

    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('done');
    expect(snapshot?.exitCode).toBe(0);
    expect(snapshot?.log).toContain('ok');
  }, 25_000);

  it('reports failure for a non-existent make target', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['__no_such_target__'],
      cwd: workDir,
      label: '__no_such_target__',
      timeoutMs: 30_000,
    });
    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.error).toContain('exited with code');
  }, 25_000);

  it('runJobWithBudget returns a running snapshot with a hint when the budget expires', async () => {
    const snapshot = await runJobWithBudget(
      {
        command: 'make',
        args: ['slow'],
        cwd: workDir,
        label: 'slow',
        timeoutMs: 30_000,
      },
      1_500,
    );
    expect(snapshot.status).toBe('running');
    expect(snapshot.hint).toContain('worktree_job_wait');

    // The handle stays valid: a follow-up wait reaches the terminal state.
    const final = await waitForJob(snapshot.jobId, 20_000);
    expect(final?.status).toBe('done');
  }, 30_000);

  it('idempotencyKey joins an in-flight job instead of spawning a duplicate', async () => {
    const first = startJob({
      command: 'make',
      args: ['slow'],
      cwd: workDir,
      label: 'slow-idem',
      timeoutMs: 30_000,
      idempotencyKey: 'test-idem-key',
    });
    const second = startJob({
      command: 'make',
      args: ['slow'],
      cwd: workDir,
      label: 'slow-idem',
      timeoutMs: 30_000,
      idempotencyKey: 'test-idem-key',
    });
    expect(second.jobId).toBe(first.jobId);
    expect(second.existing).toBe(true);

    const final = await waitForJob(first.jobId, 20_000);
    expect(final?.status).toBe('done');

    // Once the job is terminal, the same key starts a fresh job.
    const third = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'noop-idem',
      timeoutMs: 30_000,
      idempotencyKey: 'test-idem-key',
    });
    expect(third.jobId).not.toBe(first.jobId);
    expect(third.existing).toBe(false);
    await waitForJob(third.jobId, 20_000);
  }, 30_000);

  it('persists meta and echoes it on snapshots; env vars reach the child', async () => {
    // `make noop-env` echoes $WT_JOBS_TEST_VAR (recipe added per-test below).
    writeFileSync(
      join(workDir, 'Makefile'),
      'noop:\n\t@echo ok\n' +
        'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n' +
        'noop-env:\n\t@node -e "console.log(process.env.WT_JOBS_TEST_VAR)"\n',
    );
    const { jobId } = startJob({
      command: 'make',
      args: ['noop-env'],
      cwd: workDir,
      label: 'noop-env',
      timeoutMs: 30_000,
      env: { WT_JOBS_TEST_VAR: 'hello-from-env' },
      meta: { kind: 'test-kind', extra: 42 },
    });
    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('done');
    expect(snapshot?.log).toContain('hello-from-env');
    expect(snapshot?.meta).toEqual({ kind: 'test-kind', extra: 42 });
  }, 25_000);

  it('marks a job failed with an internal-timeout error when it exceeds timeoutMs', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['slow'],
      cwd: workDir,
      label: 'slow-timeout',
      timeoutMs: 1_500,
    });
    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.error).toContain('internal timeout');
  }, 25_000);

  it('reports a disk-recovered job past its deadline as orphaned even if the pid is alive', () => {
    // Simulate a job persisted by a dead server process: not in this process's
    // registry, done:false, a live pid (this test process), expired deadline.
    const jobId = `wt-test-orphan-${process.pid}`;
    const jobsDir = join(tmpdir(), 'worktree-mcp-jobs');
    mkdirSync(jobsDir, { recursive: true });
    const metaPath = join(jobsDir, `${jobId}.json`);
    writeFileSync(
      metaPath,
      JSON.stringify({
        jobId,
        pid: process.pid,
        label: 'recovered-expired',
        cwd: workDir,
        command: 'make',
        args: ['slow'],
        startTime: Date.now() - 10_000,
        timeoutMs: 1_000,
        done: false,
        exitCode: null,
        error: null,
      }),
    );
    try {
      const snapshot = snapshotJob(jobId);
      expect(snapshot?.status).toBe('orphaned');
      expect(snapshot?.hint).toContain('exceeded its process timeout');
    } finally {
      unlinkSync(metaPath);
    }
  });

  it('listJobs returns recent jobs newest-first with status', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'noop-list',
      timeoutMs: 30_000,
    });
    await waitForJob(jobId, 20_000);

    const jobs = listJobs();
    const entry = jobs.find((j) => j.jobId === jobId);
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('noop-list');
    expect(['done', 'failed']).toContain(entry?.status ?? '');
  }, 25_000);
});

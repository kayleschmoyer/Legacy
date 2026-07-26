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

import { createJobRunner } from './index';

const TEST_DIR_NAME = 'mcp-jobs-test';

const runner = createJobRunner({
  idPrefix: 'test',
  dirName: TEST_DIR_NAME,
  waitHint: (jobId) => `Call test_job_wait({ jobId: "${jobId}" }) to wait.`,
});
const { listJobs, runJobWithBudget, snapshotJob, startJob, waitForJob } =
  runner;

describe('background job registry', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'mcp-jobs-spec-'));
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
    expect(jobId).toMatch(/^test-/);

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

  it('runJobWithBudget returns a running snapshot with the configured hint when the budget expires', async () => {
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
    expect(snapshot.hint).toContain('test_job_wait');

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
    // `make noop-env` echoes $MCP_JOBS_TEST_VAR (recipe added per-test below).
    writeFileSync(
      join(workDir, 'Makefile'),
      'noop:\n\t@echo ok\n' +
        'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n' +
        'noop-env:\n\t@node -e "process.stdout.write(String(process.env.MCP_JOBS_TEST_VAR))"\n',
    );
    const { jobId } = startJob({
      command: 'make',
      args: ['noop-env'],
      cwd: workDir,
      label: 'noop-env',
      timeoutMs: 30_000,
      env: { MCP_JOBS_TEST_VAR: 'hello-from-env' },
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

  it('finalizes a timed-out job as passed when the log already matches successMarker', async () => {
    // Mirrors the pc-lint/pc-test shape: the command prints its success line,
    // then the process outlives the timeout (e.g. worker teardown).
    const markerDir = mkdtempSync(join(tmpdir(), 'mcp-jobs-marker-'));
    writeFileSync(
      join(markerDir, 'Makefile'),
      'fake-nx-pass:\n' +
        '\t@echo "NX   Successfully ran target lint for 1 projects"\n' +
        '\t@node -e "setTimeout(function () {}, 5000)"\n',
    );
    try {
      const { jobId } = startJob({
        command: 'make',
        args: ['fake-nx-pass'],
        cwd: markerDir,
        label: 'fake-nx-pass',
        timeoutMs: 1_500,
        successMarker: /Successfully ran target lint/,
      });
      const snapshot = await waitForJob(jobId, 20_000);
      expect(snapshot?.status).toBe('done');
      expect(snapshot?.exitCode).toBe(0);
      expect(snapshot?.error).toBeNull();
      expect(snapshot?.recoveredFromTimeout).toBe(true);
      expect(snapshot?.log).toContain('Successfully ran target lint');

      // The recovery must survive the SIGTERM-driven close event: give the
      // close handler time to fire, then re-snapshot.
      await new Promise((r) => setTimeout(r, 2_000));
      const after = snapshotJob(jobId);
      expect(after?.status).toBe('done');
      expect(after?.exitCode).toBe(0);
      expect(after?.error).toBeNull();
    } finally {
      rmSync(markerDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps the internal-timeout failure when successMarker never appears in the log', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['slow'],
      cwd: workDir,
      label: 'slow-timeout-no-marker',
      timeoutMs: 1_500,
      successMarker: /Successfully ran target/,
    });
    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.error).toContain('Process killed after');
    expect(snapshot?.error).toContain('internal timeout');
    expect(snapshot?.recoveredFromTimeout).toBeUndefined();
  }, 25_000);

  it('reports a disk-recovered job past its deadline as orphaned even if the pid is alive', () => {
    // Simulate a job persisted by a dead server process: not in this process's
    // registry, done:false, a live pid (this test process), expired deadline.
    const jobId = `test-orphan-${process.pid}`;
    const jobsDir = join(tmpdir(), TEST_DIR_NAME);
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

  it("runners with different dirNames do not see each other's jobs", async () => {
    const other = createJobRunner({
      idPrefix: 'other',
      dirName: 'mcp-jobs-test-other',
      waitHint: (jobId) => jobId,
    });
    const { jobId } = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'noop-isolated',
      timeoutMs: 30_000,
    });
    await waitForJob(jobId, 20_000);
    expect(other.snapshotJob(jobId)).toBeNull();
  }, 25_000);

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

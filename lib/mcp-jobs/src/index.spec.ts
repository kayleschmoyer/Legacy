import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createJobRunner,
  encodeCommandAndArgs,
  PS_WRAPPER_SCRIPT,
  SIDECAR_INVOKE_FAILURE_MARKER,
} from './index';

/**
 * PowerShell Core (`pwsh`) is cross-platform and preinstalled on GitHub-hosted
 * `ubuntu-latest` runners, so this regression test can exercise the real
 * `run-with-exit-sidecar.ps1` parameter-binding behavior in CI even though CI
 * runs on Linux (see ci-pipeline.yml — no windows-latest job exists for this
 * package). Skips locally when `pwsh` isn't installed rather than failing.
 */
function findPwsh(): string | null {
  for (const candidate of ['pwsh', 'pwsh.exe']) {
    const probe = spawnSync(candidate, ['-Version'], { encoding: 'utf-8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

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

  it('strips leaked TSX_TSCONFIG_PATH from the spawned child env (LS-9310)', async () => {
    // Simulate the env `.mcp.json` injects into an MCP server's own process
    // (e.g. `legacy-sports-nx`) — a job spawned by that server must not pass
    // it through to the child, whether or not the caller supplies its own
    // `env` override.
    const original = process.env.TSX_TSCONFIG_PATH;
    process.env.TSX_TSCONFIG_PATH = 'tools/mcp/nx-server/tsconfig.json';
    try {
      writeFileSync(
        join(workDir, 'Makefile'),
        'noop:\n\t@echo ok\n' +
          'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n' +
          'noop-env:\n\t@node -e "process.stdout.write(String(process.env.MCP_JOBS_TEST_VAR))"\n' +
          'echo-tsx:\n\t@node -e "process.stdout.write(String(process.env.TSX_TSCONFIG_PATH))"\n',
      );

      const noEnvOverride = startJob({
        command: 'make',
        args: ['echo-tsx'],
        cwd: workDir,
        label: 'echo-tsx-no-override',
        timeoutMs: 30_000,
      });
      const noEnvSnapshot = await waitForJob(noEnvOverride.jobId, 20_000);
      expect(noEnvSnapshot?.status).toBe('done');
      expect(noEnvSnapshot?.log).toContain('undefined');

      const withEnvOverride = startJob({
        command: 'make',
        args: ['echo-tsx'],
        cwd: workDir,
        label: 'echo-tsx-with-override',
        timeoutMs: 30_000,
        env: { MCP_JOBS_TEST_VAR: 'irrelevant' },
      });
      const withEnvSnapshot = await waitForJob(withEnvOverride.jobId, 20_000);
      expect(withEnvSnapshot?.status).toBe('done');
      expect(withEnvSnapshot?.log).toContain('undefined');
    } finally {
      if (original === undefined) {
        delete process.env.TSX_TSCONFIG_PATH;
      } else {
        process.env.TSX_TSCONFIG_PATH = original;
      }
    }
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

  it(
    'reattaches to a still-running job via a second runner instance pointed ' +
      'at the same dirName, without erroring (simulates an MCP server ' +
      'disconnect/reconnect mid-poll, LS-8889)',
    async () => {
      // The "spawning" runner starts the job — analogous to the pre-reconnect
      // MCP server process.
      const { jobId } = startJob({
        command: 'make',
        args: ['slow'],
        cwd: workDir,
        label: 'reconnect-mid-run',
        timeoutMs: 30_000,
      });

      // A second runner instance with an empty in-memory registry but the
      // same dirName — analogous to the reconnected MCP server process, which
      // has never seen this jobId in memory and must recover it from disk.
      const reconnected = createJobRunner({
        idPrefix: 'test',
        dirName: TEST_DIR_NAME,
        waitHint: (id) => `Call test_job_wait({ jobId: "${id}" }) to wait.`,
      });

      // The job is still running at this point (its "slow" target sleeps 5s).
      // Reattaching must report it running with a re-poll hint, not null or
      // an orphaned/failed status.
      const midRun = reconnected.snapshotJob(jobId);
      expect(midRun?.status).toBe('running');
      expect(midRun?.hint).toContain('test_job_wait');

      // Waiting via the reconnected runner converges to the real outcome.
      const final = await reconnected.waitForJob(jobId, 20_000);
      expect(final?.status).toBe('done');
      expect(final?.exitCode).toBe(0);
    },
    25_000,
  );

  it('writes an exit-code sidecar file when a job completes', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'sidecar-noop',
      timeoutMs: 30_000,
    });
    await waitForJob(jobId, 20_000);
    const sidecarPath = join(tmpdir(), TEST_DIR_NAME, `${jobId}.exit`);
    expect(readFileSync(sidecarPath, 'utf-8').trim()).toBe('0');
  }, 25_000);

  it('writes a non-zero exit-code sidecar file when a job fails', async () => {
    const { jobId } = startJob({
      command: 'make',
      args: ['__no_such_target__'],
      cwd: workDir,
      label: 'sidecar-fail',
      timeoutMs: 30_000,
    });
    await waitForJob(jobId, 20_000);
    const sidecarPath = join(tmpdir(), TEST_DIR_NAME, `${jobId}.exit`);
    expect(readFileSync(sidecarPath, 'utf-8').trim()).not.toBe('0');
  }, 25_000);

  it(
    'forces a job failed when its log carries the sidecar invoke-failure ' +
      'marker even though the process exited 0 (LS-9970 — belt-and-braces: ' +
      'the marker must win even if some future change miscomputes the exit ' +
      "code as success, matching this ticket's 'no evidence of work done is " +
      "not a pass' fix)",
    async () => {
      writeFileSync(
        join(workDir, 'Makefile'),
        'noop:\n\t@echo ok\n' +
          'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n' +
          `sidecar-invoke-failed:\n\t@echo "${SIDECAR_INVOKE_FAILURE_MARKER}: CommandNotFoundException: simulated"\n`,
      );
      const { jobId } = startJob({
        command: 'make',
        args: ['sidecar-invoke-failed'],
        cwd: workDir,
        label: 'sidecar-invoke-failed',
        timeoutMs: 30_000,
      });
      const snapshot = await waitForJob(jobId, 20_000);
      expect(snapshot?.status).toBe('failed');
      expect(snapshot?.exitCode).toBe(0);
      expect(snapshot?.error).toContain(SIDECAR_INVOKE_FAILURE_MARKER);
    },
    25_000,
  );

  it('negative control: a genuine passing job stays passed and carries no invoke-failure marker (LS-9970)', async () => {
    writeFileSync(
      join(workDir, 'Makefile'),
      'noop:\n\t@echo ok\n' +
        'slow:\n\t@node -e "setTimeout(function () {}, 5000)"\n',
    );
    const { jobId } = startJob({
      command: 'make',
      args: ['noop'],
      cwd: workDir,
      label: 'noop-negative-control',
      timeoutMs: 30_000,
    });
    const snapshot = await waitForJob(jobId, 20_000);
    expect(snapshot?.status).toBe('done');
    expect(snapshot?.exitCode).toBe(0);
    expect(snapshot?.error).toBeNull();
    expect(snapshot?.log).not.toContain(SIDECAR_INVOKE_FAILURE_MARKER);
  }, 25_000);

  it(
    'always rewrites the materialized trampoline script rather than trusting ' +
      'a stale cached copy on disk (LS-9970 Defect 1 — a script materialized ' +
      'by an older server version must not survive a source fix because ' +
      'ensureWrapperScript skipped writing when the file already existed)',
    async () => {
      const wrapperName =
        process.platform === 'win32'
          ? 'run-with-exit-sidecar.ps1'
          : 'run-with-exit-sidecar.sh';
      const wrapperPath = join(tmpdir(), TEST_DIR_NAME, wrapperName);
      mkdirSync(join(tmpdir(), TEST_DIR_NAME), { recursive: true });
      writeFileSync(
        wrapperPath,
        '# stale/corrupt wrapper from a previous server version\nexit 1\n',
      );

      const { jobId } = startJob({
        command: 'make',
        args: ['noop'],
        cwd: workDir,
        label: 'refresh-wrapper',
        timeoutMs: 30_000,
      });
      const snapshot = await waitForJob(jobId, 20_000);

      expect(snapshot?.status).toBe('done');
      expect(readFileSync(wrapperPath, 'utf-8')).not.toContain('stale/corrupt');
    },
    25_000,
  );

  it("recovers a done result from the exit-code sidecar for a job outside this process's in-memory registry (simulates a server restart, LS-8358)", () => {
    const jobId = `test-restart-done-${process.pid}`;
    const jobsDir = join(tmpdir(), TEST_DIR_NAME);
    mkdirSync(jobsDir, { recursive: true });
    const metaPath = join(jobsDir, `${jobId}.json`);
    const exitPath = join(jobsDir, `${jobId}.exit`);
    // done:false mirrors a job whose spawning server process died before its
    // close handler could persist the terminal state.
    writeFileSync(
      metaPath,
      JSON.stringify({
        jobId,
        pid: 999_999_999,
        label: 'restart-sim-done',
        cwd: workDir,
        command: 'make',
        args: ['noop'],
        startTime: Date.now() - 2_000,
        timeoutMs: 30_000,
        done: false,
        exitCode: null,
        error: null,
      }),
    );
    writeFileSync(exitPath, '0');
    try {
      const snapshot = snapshotJob(jobId);
      expect(snapshot?.status).toBe('done');
      expect(snapshot?.exitCode).toBe(0);
      expect(snapshot?.error).toBeNull();
    } finally {
      unlinkSync(metaPath);
      unlinkSync(exitPath);
    }
  });

  it("recovers a failed result from the exit-code sidecar for a job outside this process's in-memory registry (LS-8358)", () => {
    const jobId = `test-restart-failed-${process.pid}`;
    const jobsDir = join(tmpdir(), TEST_DIR_NAME);
    mkdirSync(jobsDir, { recursive: true });
    const metaPath = join(jobsDir, `${jobId}.json`);
    const exitPath = join(jobsDir, `${jobId}.exit`);
    writeFileSync(
      metaPath,
      JSON.stringify({
        jobId,
        pid: 999_999_999,
        label: 'restart-sim-failed',
        cwd: workDir,
        command: 'make',
        args: ['__no_such_target__'],
        startTime: Date.now() - 2_000,
        timeoutMs: 30_000,
        done: false,
        exitCode: null,
        error: null,
      }),
    );
    writeFileSync(exitPath, '2');
    try {
      const snapshot = snapshotJob(jobId);
      expect(snapshot?.status).toBe('failed');
      expect(snapshot?.exitCode).toBe(2);
      expect(snapshot?.error).toContain('exited with code 2');
    } finally {
      unlinkSync(metaPath);
      unlinkSync(exitPath);
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

describe('PS_WRAPPER_SCRIPT (LS-9321 regression)', () => {
  const pwsh = findPwsh();
  const maybeIt = pwsh ? it : it.skip;
  let scriptDir: string;
  let scriptPath: string;

  beforeAll(() => {
    scriptDir = mkdtempSync(join(tmpdir(), 'mcp-jobs-ps-wrapper-'));
    scriptPath = join(scriptDir, 'run-with-exit-sidecar.ps1');
    writeFileSync(scriptPath, PS_WRAPPER_SCRIPT);
  });

  afterAll(() => {
    rmSync(scriptDir, { recursive: true, force: true });
  });

  function runWrapper(
    exitPath: string,
    command: string,
    args: string[],
  ): ReturnType<typeof spawnSync> {
    return spawnSync(
      pwsh as string,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        scriptPath,
        exitPath,
        encodeCommandAndArgs(command, args),
      ],
      { encoding: 'utf-8' },
    );
  }

  // Reproduces the exact command shape worktree_run/worktree_run_long forward
  // on Windows: command=<shell path>, args=['-c', <wrapped script>]. Before
  // the fix, forwarding these as separate positional script arguments meant
  // PowerShell's parameter binder unambiguously prefix-matched the leading
  // `-c` against a declared `$CommandAndArgs` parameter and bound it by name,
  // leaving no positional slot for the shell path — surfacing as "A
  // positional parameter cannot be found that accepts argument '<path>'" on
  // effectively every invocation, regardless of the wrapped command.
  maybeIt(
    'runs a -c-flagged command via the encoded payload and records the real exit code',
    () => {
      const exitPath = join(scriptDir, 'test.exit');
      const result = runWrapper(exitPath, 'sh', ['-c', 'exit 7']);

      expect(result.stderr).not.toContain('PositionalParameterNotFound');
      expect(result.stderr).not.toContain(
        'A positional parameter cannot be found',
      );
      expect(result.status).toBe(7);
      expect(readFileSync(exitPath, 'utf-8').trim()).toBe('7');
    },
  );

  // Original ticket repro: a quoted --grep="..." value plus a trailing flag.
  maybeIt('runs a git-log-grep-shaped command end to end', () => {
    const exitPath = join(scriptDir, 'test-grep.exit');
    const result = runWrapper(exitPath, 'sh', [
      '-c',
      'git log --all --oneline --grep="LS-8364" -i >/dev/null; exit $?',
    ]);

    expect(result.stderr).not.toContain(
      'A positional parameter cannot be found',
    );
    expect(result.status).toBe(0);
    expect(readFileSync(exitPath, 'utf-8').trim()).toBe('0');
  });

  // A single-element command array (no args at all) must not be unwrapped
  // into a scalar by ConvertFrom-Json — a documented PowerShell gotcha for
  // single-element JSON arrays.
  maybeIt('runs a plain command with no args', () => {
    const exitPath = join(scriptDir, 'test-plain.exit');
    const result = runWrapper(exitPath, 'true', []);

    expect(result.status).toBe(0);
    expect(readFileSync(exitPath, 'utf-8').trim()).toBe('0');
  });

  // LS-9970 regression: the exact failure mode reported in the ticket. A
  // command name PowerShell cannot resolve (real-world cause: a botched
  // base64 decode leaving `$command` holding the still-encoded payload
  // string, reproduced directly here as any unresolvable command name)
  // throws CommandNotFoundException. Before the fix that exception was
  // non-fatal to the script: it fell through to `$code = $LASTEXITCODE`,
  // still `$null` because no process ever ran, and the null-to-0 fallback
  // silently reported success (exit 0) for a command that never executed.
  maybeIt(
    'reports a non-zero exit with the invoke-failure marker for a command PowerShell cannot resolve, instead of the null-exit-code-defaults-to-0 false green (LS-9970)',
    () => {
      const exitPath = join(scriptDir, 'test-not-found.exit');
      const result = runWrapper(exitPath, 'ThisCommandDoesNotExist12345', []);

      expect(result.status).not.toBe(0);
      expect(readFileSync(exitPath, 'utf-8').trim()).not.toBe('0');
      expect(result.stdout).toContain(SIDECAR_INVOKE_FAILURE_MARKER);
      expect(result.stdout).toContain('CommandNotFoundException');
    },
  );

  // Negative control for the marker itself: a command that genuinely runs
  // and exits 0 must not carry the invoke-failure marker anywhere in its
  // output — proves the fix doesn't turn every pass into a false failure.
  maybeIt(
    'a genuine passing command carries no invoke-failure marker (LS-9970 negative control)',
    () => {
      const exitPath = join(scriptDir, 'test-genuine-pass.exit');
      const result = runWrapper(exitPath, 'true', []);

      expect(result.status).toBe(0);
      expect(readFileSync(exitPath, 'utf-8').trim()).toBe('0');
      expect(result.stdout).not.toContain(SIDECAR_INVOKE_FAILURE_MARKER);
    },
  );
});

/**
 * `wrapForExitSidecar` hardcodes `powershell.exe` (Windows PowerShell 5.1,
 * "Desktop" edition) as the actual production trampoline on Windows — not
 * `pwsh` (PowerShell 7+, "Core" edition), which the suite above uses as a
 * cross-platform stand-in so this file gets *some* coverage on Linux CI
 * (there is no Windows CI runner for this package). That substitution is not
 * behavior-equivalent (LS-10064): `@($json | ConvertFrom-Json)` — wrapping
 * the ConvertFrom-Json *pipeline expression itself* in `@()` — double-wraps
 * its single emitted pipeline object (the already-deserialized array) on
 * Desktop edition once the array has 2+ elements, but not on Core edition.
 * The result: `$commandAndArgs.Count` comes back 1 instead of 2, and
 * `$command` ends up holding the *entire original array* rather than just
 * the command name — which PowerShell then silently stringifies
 * (space-joined) when resolving it as a command, producing a
 * CommandNotFoundException for a command name like "make pc-typecheck" that
 * was never supposed to exist. Every existing case above (`pwsh`-only) either
 * used zero args or otherwise didn't trip this, so none of them caught it;
 * this block exists specifically to close that gap on developer machines,
 * even though — per the same CI/runner constraint noted on `findPwsh` above —
 * it cannot run in this repo's Linux-only CI and is local-Windows-only
 * enforcement.
 */
describe('PS_WRAPPER_SCRIPT on Windows PowerShell 5.1 / Desktop edition (LS-10064 regression)', () => {
  function findWindowsPowerShell(): string | null {
    if (process.platform !== 'win32') return null;
    // Unlike `pwsh`, `powershell.exe` has no bare `-Version` flag that exits
    // 0 (it errors "Missing argument for parameter 'version'"), so probe
    // with a trivial -Command instead.
    const probe = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit 0'],
      { encoding: 'utf-8' },
    );
    return !probe.error && probe.status === 0 ? 'powershell.exe' : null;
  }

  const winPwsh = findWindowsPowerShell();
  const maybeIt = winPwsh ? it : it.skip;
  let scriptDir: string;
  let scriptPath: string;

  beforeAll(() => {
    scriptDir = mkdtempSync(join(tmpdir(), 'mcp-jobs-ps-wrapper-winps-'));
    scriptPath = join(scriptDir, 'run-with-exit-sidecar.ps1');
    writeFileSync(scriptPath, PS_WRAPPER_SCRIPT);
  });

  afterAll(() => {
    rmSync(scriptDir, { recursive: true, force: true });
  });

  function runWrapper(
    exitPath: string,
    command: string,
    args: string[],
  ): ReturnType<typeof spawnSync> {
    return spawnSync(
      winPwsh as string,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        scriptPath,
        exitPath,
        encodeCommandAndArgs(command, args),
      ],
      { encoding: 'utf-8' },
    );
  }

  // The exact repro shape that broke every nx_run_pc_chunk call on Windows:
  // a command with two total tokens (command + one arg), reproduced here
  // with `cmd.exe /c echo` instead of `make <chunk>` for a hermetic assertion
  // on stdout content and exit code.
  maybeIt(
    'invokes a two-token command correctly instead of stringifying the whole array into an unresolvable command name',
    () => {
      const exitPath = join(scriptDir, 'test-two-token.exit');
      const result = runWrapper(exitPath, 'cmd.exe', [
        '/c',
        'echo',
        'two-token-ok',
      ]);

      expect(result.stdout).not.toContain(SIDECAR_INVOKE_FAILURE_MARKER);
      expect(result.stdout).not.toContain('CommandNotFoundException');
      expect(result.stdout).toContain('two-token-ok');
      expect(result.status).toBe(0);
      expect(readFileSync(exitPath, 'utf-8').trim()).toBe('0');
    },
  );

  // A single-element command array (no args) must keep working post-fix —
  // this is the case ConvertFrom-Json unwraps to a scalar rather than a
  // 1-element array, which is why the fix's extra `@()` wrap is still needed.
  maybeIt('still runs a plain command with no args', () => {
    const exitPath = join(scriptDir, 'test-plain-winps.exit');
    const result = runWrapper(exitPath, 'cmd.exe', ['/c', 'exit 0']);

    expect(result.status).toBe(0);
    expect(readFileSync(exitPath, 'utf-8').trim()).toBe('0');
  });
});

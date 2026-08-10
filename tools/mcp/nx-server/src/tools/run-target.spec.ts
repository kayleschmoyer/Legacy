import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));
jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';
import {
  coalesceWindowsTestPathPatterns,
  isTargetAllowed,
  runTarget,
} from './run-target.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;

/** Configure runJobWithBudget to resolve with a terminal "done" snapshot. */
function setupJob(): void {
  mockRunJob.mockImplementation(async (jobOpts: StartJobOptions) => {
    const snapshot: JobSnapshot = {
      jobId: 'nx-test-job',
      status: 'done',
      label: jobOpts.label,
      cwd: jobOpts.cwd,
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      meta: jobOpts.meta,
      log: ' NX   Successfully ran target test\n',
    };
    return snapshot;
  });
}

/** The nx args passed to the (mocked) job runner in the first call. */
function jobCallArgs(): string[] {
  return mockRunJob.mock.calls[0][0].args;
}

/** The StartJobOptions passed to the (mocked) job runner in the first call. */
function jobCallOpts(): StartJobOptions {
  return mockRunJob.mock.calls[0][0];
}

describe('coalesceWindowsTestPathPatterns', () => {
  it('coalesces two separate values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('coalesces three values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB|FileC']);
  });

  it('leaves a single value unchanged (no coalescing needed)', () => {
    expect(
      coalesceWindowsTestPathPatterns(['--testPathPatterns', 'FileA']),
    ).toEqual(['--testPathPatterns', 'FileA']);
  });

  it('leaves a single already-pipe-separated value unchanged', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env|statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('stops coalescing at flag boundaries (does not absorb --all)', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        '--all',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB', '--all']);
  });

  it('handles equals-form with one trailing value', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns=expo-public-env|statsApiUrl']);
  });

  it('handles equals-form with two trailing values', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns=FileA|FileB|FileC']);
  });

  it('returns tokens unchanged when no --testPathPatterns flag is present', () => {
    expect(coalesceWindowsTestPathPatterns(['--all', '--verbose'])).toEqual([
      '--all',
      '--verbose',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = ['--testPathPatterns', 'FileA', 'FileB'];
    const original = [...input];
    coalesceWindowsTestPathPatterns(input);
    expect(input).toEqual(original);
  });
});

describe('isTargetAllowed', () => {
  it('allows exact matches from the allowlist', () => {
    expect(isTargetAllowed('test')).toBe(true);
    expect(isTargetAllowed('deploy:plan')).toBe(true);
  });

  it('allows colon-suffixed variants of an allowed base target', () => {
    expect(isTargetAllowed('test:web')).toBe(true);
    expect(isTargetAllowed('test:mobile')).toBe(true);
    expect(isTargetAllowed('test:stories')).toBe(true);
  });

  it('rejects a colon-suffixed variant whose base is not allowed', () => {
    expect(isTargetAllowed('deploy:staging')).toBe(false);
  });

  it('rejects a target with no allowlist match at all', () => {
    expect(isTargetAllowed('publish')).toBe(false);
  });
});

describe('runTarget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts test:web and test:mobile variants', async () => {
    setupJob();
    const web = await runTarget({
      project: 'shared-components',
      target: 'test:web',
    });
    const mobile = await runTarget({
      project: 'shared-components',
      target: 'test:mobile',
    });
    expect(web.isError).toBeUndefined();
    expect(mobile.isError).toBeUndefined();
  });

  it('accepts the test:stories variant', async () => {
    setupJob();
    const result = await runTarget({
      project: 'shared-components',
      target: 'test:stories',
    });
    expect(result.isError).toBeUndefined();
  });

  it('still rejects a disallowed colon-suffixed target with the allowlist error', async () => {
    const result = await runTarget({ project: 'x', target: 'deploy:staging' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in the allowed list/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('auto-appends --all when --testPathPatterns is passed against test:web', async () => {
    setupJob();
    await runTarget({
      project: 'shared-components',
      target: 'test:web',
      args: ['--testPathPatterns', 'SomeFile'],
    });
    expect(jobCallArgs()).toContain('--all');
  });

  it('appends --updateSnapshot for test:mobile when requested', async () => {
    setupJob();
    await runTarget({
      project: 'shared-components',
      target: 'test:mobile',
      updateSnapshot: true,
    });
    expect(jobCallArgs()).toContain('--updateSnapshot');
  });

  it('returns the finished result when the job completes inside the sync budget', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-1',
      status: 'done',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 3,
      exitCode: 0,
      error: null,
      log: 'PASS shared-components/LoginPage.spec.ts\n\n NX   Successfully ran target test for project shared-components\n',
    } satisfies JobSnapshot);

    const result = await runTarget({
      project: 'shared-components',
      target: 'test',
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text as string)).toEqual({
      project: 'shared-components',
      target: 'test',
      passed: true,
      output:
        'PASS shared-components/LoginPage.spec.ts\n\n NX   Successfully ran target test for project shared-components\n',
    });
  });

  it('reports daemonError and isError when the Nx Daemon fails to compute the project graph (LS-8819)', async () => {
    const daemonOutput =
      'Calculating the project graph on the Nx Daemon\n\n NX   Nx Daemon was not able to compute the project graph.\n\nLog file with the error: <worktree>/.nx/workspace-data/d/daemon-error.log\nPlease file an issue at https://github.com/nrwl/nx\nNx Daemon is going to be disabled until you run "nx reset".\n';
    mockRunJob.mockResolvedValue({
      jobId: 'nx-daemon-fail',
      status: 'done',
      label: 'nx run mcp-github-server:test',
      cwd: '/repo',
      elapsedSec: 131,
      exitCode: 0,
      error: null,
      log: daemonOutput,
    } satisfies JobSnapshot);

    const result = await runTarget({
      project: 'mcp-github-server',
      target: 'test',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.passed).toBe(false);
    expect(parsed.daemonError).toBe(true);
    expect(parsed.hint).toMatch(/make clean-cache/);
    expect(parsed.hint).not.toMatch(/nx reset/);
  });

  it('reports daemonError when the job exits 0 with no task-completion line at all', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-no-completion',
      status: 'done',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      log: 'some unexpected truncated output with no nx trailer',
    } satisfies JobSnapshot);

    const result = await runTarget({
      project: 'shared-components',
      target: 'test',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.passed).toBe(false);
    expect(parsed.daemonError).toBe(true);
  });

  it('returns a running snapshot with jobId instead of blocking past the sync budget', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-2',
      status: 'running',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 50,
      exitCode: null,
      error: null,
      logTail: 'compiling project graph...',
      hint: 'Job still running. Call nx_job_wait({ jobId: "nx-2" }) to continue waiting.',
    } satisfies JobSnapshot);

    const result = await runTarget({
      project: 'shared-components',
      target: 'test',
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text as string)).toEqual({
      project: 'shared-components',
      target: 'test',
      status: 'running',
      jobId: 'nx-2',
      elapsedSec: 50,
      logTail: 'compiling project graph...',
      hint: 'Job still running. Call nx_job_wait({ jobId: "nx-2" }) to continue waiting.',
    });
  });

  it('sets isError when the job fails', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-3',
      status: 'failed',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 5,
      exitCode: 1,
      error: 'nx run shared-components:test exited with code 1',
      log: 'FAIL shared-components/LoginPage.spec.ts',
    } satisfies JobSnapshot);

    const result = await runTarget({
      project: 'shared-components',
      target: 'test',
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text as string)).toMatchObject({
      passed: false,
      error: 'nx run shared-components:test exited with code 1',
      output: 'FAIL shared-components/LoginPage.spec.ts',
    });
  });

  it('passes a cwd/args-derived idempotencyKey so a duplicate call joins the in-flight job', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-4',
      status: 'done',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      log: '',
    } satisfies JobSnapshot);

    await runTarget({ project: 'shared-components', target: 'test' });

    expect(jobCallOpts().idempotencyKey).toBe(
      'nx-run:/repo:run shared-components:test',
    );
  });

  it('forwards params.env to the job runner', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'nx-5',
      status: 'done',
      label: 'nx run shared-components:test',
      cwd: '/repo',
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      log: '',
    } satisfies JobSnapshot);

    await runTarget({
      project: 'shared-components',
      target: 'test',
      env: { PLAYWRIGHT_GREP: '@regression' },
    });

    expect(jobCallOpts().env).toEqual({ PLAYWRIGHT_GREP: '@regression' });
  });
});

// --- Windows spawn shape: pre-joined pipe values (LS-8498, LS-7580 gap) ---
//
// LS-7580 fixed cmd.exe pipe-interpretation for the *coalescing* path
// (["--testPathPatterns", "a", "b"] -> joined into "a|b"). LS-8498 reported
// that a value which already arrives as a single pre-joined pipe-separated
// string (["--testPathPatterns", "a|b"]) reproduced the same unescaped-pipe
// failure. It doesn't: `pnpmJobSpec` (nx-job.ts) applies `escapeCmdShellArg`
// to every arg unconditionally on win32, regardless of how the pipe got
// there. These tests pin that down end-to-end so the job runner never again
// receives an unquoted pipe-bearing token on Windows.
describe('Windows spawn shape (LS-8498)', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('quotes a single pre-joined pipe-separated array element on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    setupJob();

    await runTarget({
      project: 'db',
      target: 'test',
      args: ['--testPathPatterns', 'delete-resilience|matchup-loaders'],
    });

    expect(jobCallArgs()).toContain('"delete-resilience|matchup-loaders"');
    expect(jobCallOpts().shell).toBe(true);
  });

  it('quotes a pre-joined pipe value in equals-form on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    setupJob();

    await runTarget({
      project: 'db',
      target: 'test',
      args: ['--testPathPatterns=delete-resilience|matchup-loaders'],
    });

    expect(jobCallArgs()).toContain(
      '"--testPathPatterns=delete-resilience|matchup-loaders"',
    );
  });

  it('quotes a pre-joined pipe value passed as a single whitespace-split string on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    setupJob();

    await runTarget({
      project: 'db',
      target: 'test',
      args: '--testPathPatterns delete-resilience|matchup-loaders',
    });

    expect(jobCallArgs()).toContain('"delete-resilience|matchup-loaders"');
  });

  it('leaves the pre-joined pipe value unquoted (shell:false) on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    setupJob();

    await runTarget({
      project: 'db',
      target: 'test',
      args: ['--testPathPatterns', 'delete-resilience|matchup-loaders'],
    });

    expect(jobCallArgs()).toContain('delete-resilience|matchup-loaders');
    expect(jobCallOpts().shell).toBe(false);
  });
});

describe('runTarget shell-metacharacter validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a --testPathPatterns value containing Expo Router route-group parens', async () => {
    setupJob();
    const result = await runTarget({
      project: 'app',
      target: 'test',
      args: [
        '--testPathPatterns',
        '(app)/(tabs)/players.spec|(app)/_layout.spec',
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunJob).toHaveBeenCalled();
  });

  it('still rejects a token containing a semicolon', async () => {
    const result = await runTarget({
      project: 'app',
      target: 'test',
      args: ['--testPathPatterns', 'foo;rm -rf /'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('contains shell metacharacters (;&`${})'),
    });
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('still rejects a token containing a backtick', async () => {
    const result = await runTarget({
      project: 'app',
      target: 'test',
      args: ['--testPathPatterns', 'foo`whoami`'],
    });

    expect(result.isError).toBe(true);
    expect(mockRunJob).not.toHaveBeenCalled();
  });
});

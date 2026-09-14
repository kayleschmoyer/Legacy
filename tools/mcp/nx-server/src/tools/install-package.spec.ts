import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  lstat: jest.fn(),
}));
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runCommand: jest.fn(),
  runPnpm: jest.fn(),
}));
jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

import { access, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { installPackage } from './install-package.js';
import { runCommand, runPnpm } from '../run-command.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockReaddir = readdir as jest.MockedFunction<typeof readdir>;
const mockAccess = access as jest.MockedFunction<typeof access>;
const mockLstat = lstat as jest.MockedFunction<typeof lstat>;
const mockRunPnpm = runPnpm as jest.MockedFunction<typeof runPnpm>;
const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;

const ORIGINAL_PACKAGE_JSON = JSON.stringify(
  {
    name: '@legacy-sports/source',
    dependencies: { alpha: '^1.0.0', zeta: '^2.0.0' },
    devDependencies: { eslint: '^9.0.0' },
  },
  null,
  2,
);

function setupHappyPath(): void {
  mockLstat.mockRejectedValue(new Error('not a symlink'));
  mockReaddir.mockRejectedValue(new Error('lib/ missing'));
  mockAccess.mockRejectedValue(new Error('missing'));
  mockReadFile.mockResolvedValue(`${ORIGINAL_PACKAGE_JSON}\n`);
  mockWriteFile.mockResolvedValue(undefined);
  mockRunPnpm.mockImplementation((args: string[]) => {
    // `pnpm info <name> types typings --json` (hasBuiltinTypes) — report none bundled.
    if (args[0] === 'info' && args.includes('--json')) {
      return Promise.resolve('{}');
    }
    // `pnpm info @types/<name> version` (typesCompanionExists) — report no companion.
    if (args[0] === 'info' && String(args[1]).startsWith('@types/')) {
      return Promise.reject(new Error('404 Not Found'));
    }
    // `pnpm info <name> version` — version resolution (used when no explicit version given).
    return Promise.resolve('1.2.3');
  });
  mockRunJob.mockImplementation((jobOpts: StartJobOptions) => {
    const snapshot: JobSnapshot = {
      jobId: 'nx-test-job',
      status: 'done',
      label: jobOpts.label,
      cwd: jobOpts.cwd,
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      meta: jobOpts.meta,
      log: 'Done in 1s\n',
    };
    return Promise.resolve(snapshot);
  });
  mockRunCommand.mockResolvedValue('4\t2\tpnpm-lock.yaml');
}

function jobCallOpts(): StartJobOptions {
  return mockRunJob.mock.calls[0][0];
}

function writtenPackageJson(): Record<string, unknown> {
  const call = mockWriteFile.mock.calls.find(([path]) =>
    (path as string).endsWith('package.json'),
  );
  if (!call) throw new Error('package.json was never written');
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

describe('installPackage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid package name without touching the filesystem', async () => {
    const result = await installPackage({ name: 'not a valid name!' });
    expect(result.isError).toBe(true);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects an invalid version string', async () => {
    const result = await installPackage({ name: 'foo', version: '  bad  ' });
    expect(result.isError).toBe(true);
  });

  it('refuses to install when node_modules is a symlink', async () => {
    mockLstat.mockResolvedValue({ isSymbolicLink: () => true } as never);
    const result = await installPackage({ name: 'foo' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SYMLINK_DETECTED');
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('declares the dependency in package.json and installs via `pnpm install` (not `pnpm add`)', async () => {
    setupHappyPath();

    const result = await installPackage({ name: 'newpkg', version: '3.4.5' });

    expect(result.isError).toBeUndefined();
    // No more `pnpm add` invocation — the job runs a plain install.
    expect(jobCallOpts().args).toEqual(['install']);

    const pkg = writtenPackageJson();
    expect(pkg.dependencies).toEqual({
      alpha: '^1.0.0',
      newpkg: '^3.4.5',
      zeta: '^2.0.0',
    });
  });

  it('writes to devDependencies, sorted alphabetically, when dev: true', async () => {
    setupHappyPath();

    await installPackage({ name: 'bpkg', version: '1.0.0', dev: true });

    const pkg = writtenPackageJson();
    expect(pkg.devDependencies).toEqual({ bpkg: '^1.0.0', eslint: '^9.0.0' });
    expect(pkg.dependencies).toEqual({ alpha: '^1.0.0', zeta: '^2.0.0' });
  });

  it('resolves the latest version via `pnpm info` when no version is given', async () => {
    setupHappyPath();

    await installPackage({ name: 'newpkg' });

    const pkg = writtenPackageJson();
    expect((pkg.dependencies as Record<string, string>).newpkg).toBe('^1.2.3');
  });

  it('reports lockfileDiffLines and warns above the churn threshold', async () => {
    setupHappyPath();
    mockRunCommand.mockResolvedValue('900\t400\tpnpm-lock.yaml');

    const result = await installPackage({ name: 'newpkg', version: '1.0.0' });
    const body = JSON.parse(result.content[0].text) as {
      lockfileDiffLines: number;
      warnings?: string[];
    };

    expect(body.lockfileDiffLines).toBe(1300);
    expect(body.warnings?.some((w) => w.includes('1300 lines'))).toBe(true);
  });

  it('does not warn when lockfile churn is small', async () => {
    setupHappyPath();
    mockRunCommand.mockResolvedValue('4\t2\tpnpm-lock.yaml');

    const result = await installPackage({ name: 'newpkg', version: '1.0.0' });
    const body = JSON.parse(result.content[0].text) as {
      lockfileDiffLines: number;
      warnings?: string[];
    };

    expect(body.lockfileDiffLines).toBe(6);
    expect(body.warnings).toBeUndefined();
  });

  it('rolls back the package.json edit when the install job fails', async () => {
    setupHappyPath();
    mockRunJob.mockImplementation((jobOpts: StartJobOptions) => {
      const snapshot: JobSnapshot = {
        jobId: 'nx-test-job',
        status: 'failed',
        label: jobOpts.label,
        cwd: jobOpts.cwd,
        elapsedSec: 1,
        exitCode: 1,
        error: 'ERR_PNPM_NO_MATCHING_VERSION',
        meta: jobOpts.meta,
        log: 'boom\n',
      };
      return Promise.resolve(snapshot);
    });

    const result = await installPackage({ name: 'newpkg', version: '1.0.0' });

    expect(result.isError).toBe(true);
    const restoreCall = mockWriteFile.mock.calls.find(
      ([, contents]) => contents === `${ORIGINAL_PACKAGE_JSON}\n`,
    );
    expect(restoreCall).toBeDefined();
  });
});

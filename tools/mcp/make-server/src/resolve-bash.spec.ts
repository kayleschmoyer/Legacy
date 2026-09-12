import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('resolveBashExecutable (LS-9021)', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };
  let tmpRoot: string;

  beforeEach(() => {
    jest.resetModules();
    tmpRoot = mkdtempSync(join(tmpdir(), 'resolve-bash-test-'));
    // resolveBashExecutable also probes hardcoded C:\Program Files paths and
    // `where bash`, which find the real Git Bash on a Windows dev machine.
    // Confine it to files under tmpRoot so every scenario is hermetic.
    jest.doMock('node:fs', () => {
      const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        existsSync: (p: string) =>
          p.startsWith(tmpRoot) && actual.existsSync(p),
      };
    });
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual<typeof import('node:child_process')>(
        'node:child_process',
      ),
      execSync: () => {
        throw new Error('where: bash not found');
      },
    }));
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    process.env = { ...originalEnv };
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns the bare "bash" command on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    const { resolveBashExecutable } = await import('./resolve-bash.js');
    expect(resolveBashExecutable()).toBe('bash');
  });

  it('resolves Git for Windows bash.exe under %ProgramFiles% on win32', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    const gitBinDir = join(tmpRoot, 'Git', 'bin');
    mkdirSync(gitBinDir, { recursive: true });
    writeFileSync(join(gitBinDir, 'bash.exe'), '');
    process.env['ProgramFiles'] = tmpRoot;
    delete process.env['ProgramFiles(x86)'];
    delete process.env['LOCALAPPDATA'];

    const { resolveBashExecutable } = await import('./resolve-bash.js');
    expect(resolveBashExecutable()).toBe(join(gitBinDir, 'bash.exe'));
  });

  it('falls back to the bare "bash" command on win32 when no Git Bash is found', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    process.env['ProgramFiles'] = join(tmpRoot, 'does-not-exist');
    delete process.env['ProgramFiles(x86)'];
    delete process.env['LOCALAPPDATA'];

    const { resolveBashExecutable } = await import('./resolve-bash.js');
    expect(resolveBashExecutable()).toBe('bash');
  });

  it('memoizes the resolved path across calls within the same module instance', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    const gitBinDir = join(tmpRoot, 'Git', 'bin');
    mkdirSync(gitBinDir, { recursive: true });
    writeFileSync(join(gitBinDir, 'bash.exe'), '');
    process.env['ProgramFiles'] = tmpRoot;
    delete process.env['ProgramFiles(x86)'];
    delete process.env['LOCALAPPDATA'];

    const { resolveBashExecutable, __resetBashExecutableCacheForTests } =
      await import('./resolve-bash.js');
    const first = resolveBashExecutable();
    rmSync(join(gitBinDir, 'bash.exe'), { force: true });
    expect(resolveBashExecutable()).toBe(first);

    __resetBashExecutableCacheForTests();
    expect(resolveBashExecutable()).toBe('bash');
  });
});

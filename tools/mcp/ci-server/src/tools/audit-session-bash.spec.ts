import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

jest.mock('../github-api.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn(),
}));

import { execFileSync } from 'node:child_process';
import { pythonInterpreterCandidates } from './audit-session-bash.js';

const mockExecFileSync = execFileSync as jest.MockedFunction<
  typeof execFileSync
>;

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_PYTHON = process.env.PYTHON;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('pythonInterpreterCandidates', () => {
  beforeEach(() => {
    delete process.env.PYTHON;
    mockExecFileSync.mockImplementation(() => {
      throw new Error('which: not found');
    });
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    if (ORIGINAL_PYTHON === undefined) {
      delete process.env.PYTHON;
    } else {
      process.env.PYTHON = ORIGINAL_PYTHON;
    }
    jest.resetAllMocks();
  });

  it('includes python3, python, and common absolute paths on non-Windows platforms', () => {
    setPlatform('linux');
    const candidates = pythonInterpreterCandidates();
    expect(candidates).toContain('python3');
    expect(candidates).toContain('python');
    expect(candidates).toContain('/usr/local/bin/python3');
    expect(candidates).toContain('/usr/bin/python3');
    expect(candidates).toContain('/usr/bin/python');
  });

  it('prepends shell-discovered path before fixed candidates on Linux', () => {
    setPlatform('linux');
    (mockExecFileSync as jest.Mock).mockImplementation((...args: unknown[]) => {
      if ((args[1] as string[])[0] === 'python3')
        return '/opt/homebrew/bin/python3';
      throw new Error('not found');
    });
    const candidates = pythonInterpreterCandidates();
    expect(candidates[0]).toBe('/opt/homebrew/bin/python3');
    // fixed fallbacks still present
    expect(candidates).toContain('python3');
  });

  it('deduplicates when shell-discovered path matches a fixed entry', () => {
    setPlatform('linux');
    (mockExecFileSync as jest.Mock).mockImplementation((...args: unknown[]) => {
      if ((args[1] as string[])[0] === 'python3') return '/usr/bin/python3';
      throw new Error('not found');
    });
    const candidates = pythonInterpreterCandidates();
    // /usr/bin/python3 appears exactly once even though which resolved it
    expect(candidates.filter((c) => c === '/usr/bin/python3')).toHaveLength(1);
  });

  it('puts py launcher first on win32 and adds absolute fallback paths', () => {
    setPlatform('win32');
    const candidates = pythonInterpreterCandidates();
    // py launcher is first — it lives in C:\Windows\ and survives PATH stripping
    expect(candidates[0]).toBe('py');
    // python3 and python follow for non-launcher installs
    expect(candidates).toContain('python3');
    expect(candidates).toContain('python');
    // absolute fallback so the tool works even with a fully-stripped PATH
    expect(
      candidates.some((c) => c.includes('Python') && c.endsWith('python.exe')),
    ).toBe(true);
  });

  it('honors the PYTHON env var as the sole candidate when set', () => {
    setPlatform('win32');
    process.env.PYTHON = 'C:\\Python311\\python.exe';
    expect(pythonInterpreterCandidates()).toEqual([
      'C:\\Python311\\python.exe',
    ]);
  });
});

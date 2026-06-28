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

import { pythonInterpreterCandidates } from './audit-session-bash.js';

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
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    if (ORIGINAL_PYTHON === undefined) {
      delete process.env.PYTHON;
    } else {
      process.env.PYTHON = ORIGINAL_PYTHON;
    }
  });

  it('returns python3, python, then common absolute paths on non-Windows platforms', () => {
    setPlatform('linux');
    expect(pythonInterpreterCandidates()).toEqual([
      'python3',
      'python',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      '/usr/bin/python',
    ]);
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

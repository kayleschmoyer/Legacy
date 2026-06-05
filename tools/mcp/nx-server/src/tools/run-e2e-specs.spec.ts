import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the import under test
// ---------------------------------------------------------------------------

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:fs', () => ({ existsSync: jest.fn(() => true) }));
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  rm: jest.fn(() => Promise.resolve()),
}));

let listeningHandler: (() => void) | null = null;
const mockServer = {
  once: jest.fn((event: string, cb: () => void) => {
    if (event === 'listening') listeningHandler = cb;
    return mockServer;
  }),
  close: jest.fn(),
  listen: jest.fn(() => {
    listeningHandler?.();
    return mockServer;
  }),
};
jest.mock('node:net', () => ({
  __esModule: true,
  default: { createServer: jest.fn(() => mockServer) },
}));

jest.mock('../run-command.js', () => ({ getRepoRoot: jest.fn(() => '/repo') }));
jest.mock('../truncate-output.js', () => ({
  truncateOutput: jest.fn((s: string) => s),
  MAX_OUTPUT_CHARS: 50_000,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { runE2ESpecs } from './run-e2e-specs.js';

const mockExecFile = childProcess.execFile as jest.MockedFunction<
  typeof childProcess.execFile
>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockReadFile = fsPromises.readFile as jest.MockedFunction<
  typeof fsPromises.readFile
>;
const mockRm = fsPromises.rm as jest.MockedFunction<typeof fsPromises.rm>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExecFileCallback = (
  err: NodeJS.ErrnoException | null,
  stdout: string,
  stderr: string,
) => void;

function setupExecFile(stdout: string, stderr = '', killed = false): void {
  (mockExecFile as unknown as jest.Mock).mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      const cb = callback as ExecFileCallback;
      const err = killed
        ? Object.assign(new Error('killed'), { killed: true })
        : null;
      cb(err, stdout, stderr);
    },
  );
}

const PASSING_REPORT = JSON.stringify({
  stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0, duration: 5000 },
  suites: [],
});

const FAILING_REPORT = JSON.stringify({
  stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0, duration: 3000 },
  suites: [
    {
      title: 'Auth',
      file: 'src/tests/auth.spec.ts',
      specs: [
        {
          title: 'should redirect unauthenticated users',
          tests: [
            {
              projectName: 'chromium',
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: 'Expected URL to contain /login',
                      location: {
                        file: 'src/tests/auth.spec.ts',
                        line: 42,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runE2ESpecs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeningHandler = null;
    mockServer.once.mockImplementation((event: string, cb: () => void) => {
      if (event === 'listening') listeningHandler = cb;
      return mockServer;
    });
    mockServer.listen.mockImplementation(() => {
      listeningHandler?.();
      return mockServer;
    });
    mockExistsSync.mockReturnValue(true);
    mockRm.mockResolvedValue(undefined);
  });

  // --- Input validation ---

  describe('input validation', () => {
    it('rejects empty specs array', async () => {
      const result = await runE2ESpecs({ specs: [] });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/non-empty array/);
    });

    it('rejects spec path with unsafe characters', async () => {
      const result = await runE2ESpecs({
        specs: ['src/tests/foo;bar.spec.ts'],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/disallowed characters/);
    });

    it('rejects spec path containing shell pipe character', async () => {
      const result = await runE2ESpecs({
        specs: ['src/tests/foo|bar.spec.ts'],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/disallowed characters/);
    });

    it('rejects disallowed project name', async () => {
      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        project: 'safari',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not allowed/);
    });

    it('rejects grep with unsafe characters', async () => {
      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: 'test$(cmd)',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/disallowed characters/);
    });

    it('allows backslash in spec path (Windows paths)', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);
      const result = await runE2ESpecs({
        specs: ['src\\tests\\auth.spec.ts'],
      });
      expect(result.isError).toBeUndefined();
    });

    it('allows backslash in grep (regex anchors like \\b)', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);
      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: '\\blogin\\b',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  // --- Preconditions ---

  describe('preconditions', () => {
    it('returns error with build hint when dist/apps/web is missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        hint: string;
      };
      expect(payload.error).toMatch(/dist\/apps\/web/);
      expect(payload.hint).toMatch(/nx_run/);
    });
  });

  // --- Playwright execution ---

  describe('playwright execution', () => {
    it('returns error when playwright times out', async () => {
      (mockExecFile as unknown as jest.Mock).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
          const cb = callback as ExecFileCallback;
          cb(
            Object.assign(new Error('killed'), { killed: true }),
            '',
            'timeout stderr',
          );
        },
      );

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/timed out/);
    });

    it('returns error when playwright does not produce a results file', async () => {
      setupExecFile('some output', 'some error');
      mockReadFile.mockRejectedValue(new Error('ENOENT') as never);

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/did not produce a results file/);
    });

    it('returns success:true when all tests pass', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        success: boolean;
        stats: { passed: number; failed: number };
        failingTests: unknown[];
      };
      expect(payload.success).toBe(true);
      expect(payload.stats.passed).toBe(3);
      expect(payload.stats.failed).toBe(0);
      expect(payload.failingTests).toHaveLength(0);
    });

    it('returns success:false with failing test details when tests fail', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(FAILING_REPORT as never);

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        success: boolean;
        failingTests: Array<{
          title: string;
          file: string;
          projectName: string | null;
          error: string | null;
          location: string | null;
        }>;
      };
      expect(payload.success).toBe(false);
      expect(payload.failingTests).toHaveLength(1);
      expect(payload.failingTests[0].title).toBe(
        'should redirect unauthenticated users',
      );
      expect(payload.failingTests[0].projectName).toBe('chromium');
      expect(payload.failingTests[0].error).toMatch(/Expected URL/);
      expect(payload.failingTests[0].location).toBe(
        'src/tests/auth.spec.ts:42',
      );
    });

    it('passes E2E_AUTH_MODE=ci and E2E_PORT in the environment', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);

      await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });

      const callArgs = mockExecFile.mock.calls[0];
      const opts = callArgs[2] as { env?: Record<string, string> };
      expect(opts.env?.['E2E_AUTH_MODE']).toBe('ci');
      expect(opts.env?.['E2E_PORT']).toMatch(/^\d+$/);
    });

    it('appends --grep flag when grep option is provided', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: '@critical',
      });

      const callArgs = mockExecFile.mock.calls[0];
      const args = callArgs[1] as string[];
      expect(args).toContain('--grep=@critical');
    });

    it('uses specified project browser', async () => {
      setupExecFile('', '');
      mockReadFile.mockResolvedValue(PASSING_REPORT as never);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        project: 'firefox',
      });

      const callArgs = mockExecFile.mock.calls[0];
      const args = callArgs[1] as string[];
      expect(args).toContain('--project=firefox');
    });
  });
});

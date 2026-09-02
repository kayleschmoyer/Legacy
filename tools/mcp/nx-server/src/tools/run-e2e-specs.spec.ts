import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the import under test
// ---------------------------------------------------------------------------

jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));
jest.mock('node:fs', () => ({ existsSync: jest.fn(() => true) }));
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  readdir: jest.fn(() => Promise.resolve([])),
  rm: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({ isDirectory: () => false })),
}));
jest.mock('node:os', () => ({
  __esModule: true,
  default: { homedir: jest.fn(() => '/home/user') },
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

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { runE2ESpecs } from './run-e2e-specs.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockReadFile = fsPromises.readFile as unknown as jest.MockedFunction<
  (path: unknown, ...rest: unknown[]) => Promise<string>
>;
const mockRm = fsPromises.rm as jest.MockedFunction<typeof fsPromises.rm>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure runJobWithBudget to resolve with a terminal snapshot echoing job meta. */
function setupJob(
  log: string,
  opts: { failed?: boolean; timedOut?: boolean } = {},
): void {
  mockRunJob.mockImplementation((jobOpts: StartJobOptions) => {
    const failed = (opts.failed ?? false) || (opts.timedOut ?? false);
    const snapshot: JobSnapshot = {
      jobId: 'nx-test-job',
      status: failed ? 'failed' : 'done',
      label: jobOpts.label,
      cwd: jobOpts.cwd,
      elapsedSec: 1,
      exitCode: failed ? 1 : 0,
      error: opts.timedOut
        ? `Process killed after ${jobOpts.timeoutMs}ms (internal timeout)`
        : failed
          ? 'exited with code 1'
          : null,
      meta: jobOpts.meta,
      log,
    };
    return Promise.resolve(snapshot);
  });
}

/** The StartJobOptions passed to the (mocked) job runner in the first call. */
function jobCallOpts(): StartJobOptions {
  return mockRunJob.mock.calls[0][0];
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
        grep: 'test; rm -rf /',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/disallowed characters/);
    });

    it('allows regex alternation in grep (LS-8744)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);
      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: 'CSRF-protected request|upload endpoint returns an HTTP error',
      });
      expect(result.isError).toBeUndefined();
    });

    it('allows regex groups, classes, and quantifiers in grep', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);
      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: '^(foo|bar)[0-9]+\\.spec$',
      });
      expect(result.isError).toBeUndefined();
    });

    it('allows backslash in spec path (Windows paths)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);
      const result = await runE2ESpecs({
        specs: ['src\\tests\\auth.spec.ts'],
      });
      expect(result.isError).toBeUndefined();
    });

    it('allows backslash in grep (regex anchors like \\b)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);
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
    it('returns error when playwright hits the process timeout', async () => {
      setupJob('timeout output', { timedOut: true });

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/timed out/);
    });

    it('gives hermetic runs a 30-minute process timeout regardless of batch size (LS-8743)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({
        specs: Array.from(
          { length: 174 },
          (_, i) => `src/tests/spec-${i}.spec.ts`,
        ),
      });
      expect(jobCallOpts().timeoutMs).toBe(30 * 60 * 1000);
    });

    it('returns error when playwright does not produce a results file', async () => {
      setupJob('some output');
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/did not produce a results file/);
    });

    it('surfaces a version-mismatch hint when the browser executable is missing (LS-8319)', async () => {
      setupJob(
        "Error: browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell",
      );
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        hint?: string;
      };
      expect(payload.error).toMatch(/did not produce a results file/);
      expect(payload.hint).toMatch(/LS-8319/);
      expect(payload.hint).toMatch(/pw-browsers/);
    });

    it('returns a running snapshot with a jobId when the run exceeds the sync budget', async () => {
      mockRunJob.mockImplementation((jobOpts: StartJobOptions) =>
        Promise.resolve({
          jobId: 'nx-running-job',
          status: 'running' as const,
          label: jobOpts.label,
          cwd: jobOpts.cwd,
          elapsedSec: 45,
          exitCode: null,
          error: null,
          meta: jobOpts.meta,
          logTail: 'Running 3 tests…',
          hint: 'Call nx_job_wait',
        }),
      );

      const result = await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        status: string;
        jobId: string;
        hint: string;
      };
      expect(payload.status).toBe('running');
      expect(payload.jobId).toBe('nx-running-job');
      expect(payload.hint).toMatch(/nx_job_wait/);
    });

    it('returns success:true when all tests pass', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

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
      setupJob('');
      mockReadFile.mockResolvedValue(FAILING_REPORT);

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

    it('passes E2E_AUTH_MODE=ci and E2E_PORT in the job environment', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });

      const opts = jobCallOpts();
      expect(opts.env?.['E2E_AUTH_MODE']).toBe('ci');
      expect(opts.env?.['E2E_PORT']).toMatch(/^\d+$/);
    });

    it('appends --grep flag when grep option is provided', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        grep: '@critical',
      });

      expect(jobCallOpts().args).toContain('--grep=@critical');
    });

    it('uses specified project browser', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        project: 'firefox',
      });

      expect(jobCallOpts().args).toContain('--project=firefox');
    });

    it('appends --trace=on for hermetic runs when withTracing:true (LS-9332)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        withTracing: true,
      });

      expect(jobCallOpts().args).toContain('--trace=on');
    });

    it('omits --trace=on for hermetic runs when withTracing is unset', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });

      expect(jobCallOpts().args).not.toContain('--trace=on');
    });

    it('returns traceArtifacts for hermetic runs when withTracing:true finds trace.zip files (LS-9332)', async () => {
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);
      const mockReaddir = fsPromises.readdir as jest.MockedFunction<
        typeof fsPromises.readdir
      >;
      const mockStat = fsPromises.stat as unknown as jest.MockedFunction<
        (path: unknown) => Promise<{ isDirectory: () => boolean }>
      >;
      mockReaddir.mockImplementation((dir: unknown) => {
        const dirStr = String(dir);
        if (dirStr.endsWith('test-results')) {
          return Promise.resolve(['auth-should-login'] as never);
        }
        if (dirStr.endsWith('auth-should-login')) {
          return Promise.resolve(['trace.zip'] as never);
        }
        return Promise.resolve([] as never);
      });
      mockStat.mockImplementation((p: unknown) =>
        Promise.resolve({ isDirectory: () => !String(p).endsWith('.zip') }),
      );

      const result = await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        withTracing: true,
      });

      const payload = JSON.parse(result.content[0].text) as {
        mode: string;
        traceArtifacts?: string[];
      };
      expect(payload.mode).toBe('hermetic');
      expect(payload.traceArtifacts).toEqual([
        expect.stringContaining('trace.zip'),
      ]);
    });
  });

  // --- Windows spawn shape (LS-7836) ---

  describe('Windows spawn shape', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('spawns plain pnpm through a shell on Windows (not pnpm.cmd with no shell)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });

      const opts = jobCallOpts();
      expect(opts.command).toBe('pnpm');
      expect(opts.shell).toBe(true);
    });

    it('escapes shell-metacharacter args via escapeCmdShellArg on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({
        specs: ['src/tests/auth.spec.ts'],
        project: 'Mobile Chrome',
      });

      expect(jobCallOpts().args).toContain('"--project=Mobile Chrome"');
    });

    it('spawns plain pnpm with shell:false on non-Windows platforms', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      setupJob('');
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      await runE2ESpecs({ specs: ['src/tests/auth.spec.ts'] });

      const opts = jobCallOpts();
      expect(opts.command).toBe('pnpm');
      expect(opts.shell).toBe(false);
    });
  });

  // --- Integration mode ---

  describe('integration mode', () => {
    const INTEGRATION_SPEC = 'src/integration/tests/league.spec.ts';
    const FRESH_JWT = JSON.stringify({ expiresAt: Date.now() + 3_600_000 });

    beforeEach(() => {
      process.env['E2EPOOLPASSWORD'] = 'secret';
      // JWT exists and is fresh; dist/apps/web not needed in integration mode.
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).includes('e2e-token.json'),
      );
      mockReadFile.mockImplementation((p: unknown) => {
        if (String(p).includes('e2e-token.json')) {
          return Promise.resolve(FRESH_JWT);
        }
        return Promise.resolve(PASSING_REPORT);
      });
      setupJob('');
    });

    afterEach(() => {
      delete process.env['E2EPOOLPASSWORD'];
    });

    it('uses playwright.integration.config.ts and sets mode:"integration"', async () => {
      const result = await runE2ESpecs({
        specs: [INTEGRATION_SPEC],
        integration: true,
      });
      const args = jobCallOpts().args;
      expect(args.find((a) => a.includes('--config='))).toMatch(
        /playwright\.integration\.config\.ts/,
      );
      expect(args).toContain('--workers=1');
      const payload = JSON.parse(result.content[0].text) as { mode: string };
      expect(payload.mode).toBe('integration');
    });

    it('warns when e2e JWT is missing and omits E2E_AUTH_MODE from env', async () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFile.mockResolvedValue(PASSING_REPORT);

      const result = await runE2ESpecs({
        specs: [INTEGRATION_SPEC],
        integration: true,
      });
      const payload = JSON.parse(result.content[0].text) as {
        preconditionWarnings?: string[];
      };
      expect(
        payload.preconditionWarnings?.some((w) => /e2e JWT not found/.test(w)),
      ).toBe(true);

      expect(jobCallOpts().env?.['E2E_AUTH_MODE']).toBeUndefined();
    });

    it('appends --trace=on only when withTracing:true', async () => {
      await runE2ESpecs({
        specs: [INTEGRATION_SPEC],
        integration: true,
        withTracing: true,
      });
      expect(jobCallOpts().args).toContain('--trace=on');
    });

    it('keeps the 8-minute integration process timeout', async () => {
      await runE2ESpecs({
        specs: [INTEGRATION_SPEC],
        integration: true,
      });
      expect(jobCallOpts().timeoutMs).toBe(480_000);
    });
  });
});

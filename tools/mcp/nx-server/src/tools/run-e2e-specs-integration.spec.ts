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
jest.mock('node:net', () => ({
  __esModule: true,
  default: { createServer: jest.fn() },
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
const mockReaddir = fsPromises.readdir as jest.MockedFunction<
  typeof fsPromises.readdir
>;
const mockStat = fsPromises.stat as jest.MockedFunction<typeof fsPromises.stat>;
const mockRm = fsPromises.rm as jest.MockedFunction<typeof fsPromises.rm>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure runJobWithBudget to resolve with a done snapshot echoing job meta. */
function setupJob(log: string): void {
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
  stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0, duration: 8000 },
  suites: [],
});

const SPEC = 'src/integration/tests/league.spec.ts';
const FRESH_JWT = JSON.stringify({ expiresAt: Date.now() + 3_600_000 });
const EXPIRED_JWT = JSON.stringify({ expiresAt: Date.now() - 1_000 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runE2ESpecs — integration mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['E2EPOOLPASSWORD'] = 'secret';
    mockRm.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([] as never);
    mockStat.mockResolvedValue({ isDirectory: () => false } as never);
    // By default: JWT file exists and is fresh; dist/apps/web does NOT exist.
    mockExistsSync.mockImplementation((p: unknown) =>
      String(p).includes('e2e-token.json'),
    );
    mockReadFile.mockImplementation((p: unknown) => {
      if (String(p).includes('e2e-token.json'))
        return Promise.resolve(FRESH_JWT);
      return Promise.resolve(PASSING_REPORT);
    });
    setupJob('');
  });

  afterEach(() => {
    delete process.env['E2EPOOLPASSWORD'];
  });

  // --- Config selection ---

  it('uses playwright.integration.config.ts', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true });
    const args = jobCallOpts().args;
    expect(args.find((a) => a.includes('--config='))).toMatch(
      /playwright\.integration\.config\.ts/,
    );
  });

  it('sets mode:"integration" in the response payload', async () => {
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as { mode: string };
    expect(payload.mode).toBe('integration');
  });

  // --- Preconditions ---

  it('skips dist/apps/web check in integration mode', async () => {
    // dist/apps/web does NOT exist (only e2e-token.json does), yet the call
    // succeeds in integration mode.
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    expect(result.isError).toBeUndefined();
  });

  it('does not call findFreePort (net.createServer) in integration mode', async () => {
    const net = await import('node:net');
    const mockCreateServer = net.default.createServer as jest.MockedFunction<
      typeof net.default.createServer
    >;
    await runE2ESpecs({ specs: [SPEC], integration: true });
    expect(mockCreateServer).not.toHaveBeenCalled();
  });

  it('omits E2E_PORT and E2E_AUTH_MODE from env in integration mode', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true });
    const env = jobCallOpts().env ?? {};
    expect(env['E2E_AUTH_MODE']).toBeUndefined();
    expect(env['E2E_PORT']).toBeUndefined();
  });

  it('always passes --workers=1', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true });
    expect(jobCallOpts().args).toContain('--workers=1');
  });

  it('applies INTEGRATION_TIMEOUT_MS (480 000 ms) as the process timeout', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true });
    expect(jobCallOpts().timeoutMs).toBe(480_000);
  });

  // --- Tracing ---

  it('appends --trace=on when withTracing:true', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true, withTracing: true });
    expect(jobCallOpts().args).toContain('--trace=on');
  });

  it('does not append --trace=on when withTracing is omitted', async () => {
    await runE2ESpecs({ specs: [SPEC], integration: true });
    expect(jobCallOpts().args).not.toContain('--trace=on');
  });

  it('includes traceArtifacts in the response when traces are found', async () => {
    mockReaddir.mockImplementation((dir: unknown) => {
      if (String(dir).endsWith('test-results'))
        return Promise.resolve(['test-abc'] as never);
      if (String(dir).endsWith('test-abc'))
        return Promise.resolve(['trace.zip'] as never);
      return Promise.resolve([] as never);
    });
    mockStat.mockImplementation((p: unknown) =>
      Promise.resolve({
        isDirectory: () => String(p).endsWith('test-abc'),
      } as never),
    );

    const result = await runE2ESpecs({
      specs: [SPEC],
      integration: true,
      withTracing: true,
    });
    const payload = JSON.parse(result.content[0].text) as {
      traceArtifacts: string[];
    };
    expect(payload.traceArtifacts).toHaveLength(1);
    expect(payload.traceArtifacts[0]).toMatch(/trace\.zip$/);
  });

  it('omits traceArtifacts field when no trace files exist', async () => {
    const result = await runE2ESpecs({
      specs: [SPEC],
      integration: true,
      withTracing: true,
    });
    const payload = JSON.parse(result.content[0].text) as Record<
      string,
      unknown
    >;
    expect(payload['traceArtifacts']).toBeUndefined();
  });

  // --- GraphQL errors ---

  it('extracts graphqlErrors from output lines containing "errors"', async () => {
    setupJob(
      'some line\n{"errors":[{"message":"Unauthorized"}]}\nanother line\n',
    );
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      graphqlErrors: string;
    };
    expect(payload.graphqlErrors).toContain('"errors"');
    expect(payload.graphqlErrors).toContain('Unauthorized');
  });

  it('omits graphqlErrors field when no error lines found', async () => {
    setupJob('all good\nno problems here\n');
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as Record<
      string,
      unknown
    >;
    expect(payload['graphqlErrors']).toBeUndefined();
  });

  // --- Precondition warnings ---

  it('warns when JWT file is missing', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReadFile.mockResolvedValue(PASSING_REPORT);

    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      preconditionWarnings: string[];
    };
    expect(
      payload.preconditionWarnings.some((w) => /e2e JWT not found/.test(w)),
    ).toBe(true);
  });

  it('warns when JWT is expired', async () => {
    mockReadFile.mockImplementation((p: unknown) => {
      if (String(p).includes('e2e-token.json'))
        return Promise.resolve(EXPIRED_JWT);
      return Promise.resolve(PASSING_REPORT);
    });

    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      preconditionWarnings: string[];
    };
    expect(payload.preconditionWarnings.some((w) => /expired/.test(w))).toBe(
      true,
    );
  });

  it('warns when JWT file is unreadable/malformed', async () => {
    mockReadFile.mockImplementation((p: unknown) => {
      if (String(p).includes('e2e-token.json'))
        return Promise.reject(new Error('EACCES'));
      return Promise.resolve(PASSING_REPORT);
    });

    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      preconditionWarnings: string[];
    };
    expect(payload.preconditionWarnings.some((w) => /unreadable/.test(w))).toBe(
      true,
    );
  });

  it('warns when E2EPOOLPASSWORD is not set', async () => {
    delete process.env['E2EPOOLPASSWORD'];

    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      preconditionWarnings: string[];
    };
    expect(
      payload.preconditionWarnings.some((w) => /E2EPOOLPASSWORD/.test(w)),
    ).toBe(true);
  });

  it('omits preconditionWarnings when JWT is fresh and E2EPOOLPASSWORD is set', async () => {
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as Record<
      string,
      unknown
    >;
    expect(payload['preconditionWarnings']).toBeUndefined();
  });

  // --- Output shape ---

  it('omits port field in integration mode', async () => {
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as Record<
      string,
      unknown
    >;
    expect(payload['port']).toBeUndefined();
  });

  it('includes stats in the response', async () => {
    const result = await runE2ESpecs({ specs: [SPEC], integration: true });
    const payload = JSON.parse(result.content[0].text) as {
      stats: { passed: number; failed: number };
    };
    expect(typeof payload.stats.passed).toBe('number');
    expect(typeof payload.stats.failed).toBe('number');
  });
});

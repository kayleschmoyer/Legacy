import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolve } from 'node:path';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => false),
}));

import { existsSync } from 'node:fs';
import {
  describeFailure,
  MAX_FILES,
  resolveConfigDir,
  runESLint,
} from './run-eslint.js';
import { getRepoRoot } from '../run-command.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;
const mockGetRepoRoot = getRepoRoot as jest.MockedFunction<typeof getRepoRoot>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

// `resolve` normalises the POSIX-style fixtures below to whatever the host
// platform uses (C:\repo on Windows), so these specs assert real argv on both.
const ROOT = resolve('/repo');
const DB = resolve('/repo/lambdas/db');
const WEB = resolve('/repo/apps/web');

/** Make `eslint.config.mjs` appear to exist in exactly these directories. */
function setConfigRoots(dirs: string[]): void {
  const roots = new Set(dirs);
  mockExistsSync.mockImplementation((p) => {
    const str = String(p);
    if (!str.endsWith('eslint.config.mjs')) return false;
    return roots.has(resolve(str, '..'));
  });
}

/** Configure runJobWithBudget to resolve with a terminal "done" snapshot. */
function setupDoneJob(log = ''): void {
  mockRunJob.mockImplementation((jobOpts: StartJobOptions) => {
    const snapshot: JobSnapshot = {
      jobId: 'eslint-test-job',
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

/** The argv passed to the (mocked) job runner in the first call. */
function jobCallArgs(): string[] {
  return mockRunJob.mock.calls[0][0].args;
}

/** The StartJobOptions passed to the (mocked) job runner in the first call. */
function jobCallOpts(): StartJobOptions {
  return mockRunJob.mock.calls[0][0];
}

describe('runESLint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/repo');
    // Default: only the workspace root owns a flat config.
    setConfigRoots([ROOT]);
  });

  it('defaults to check mode and passes --max-warnings=0 with the given files', async () => {
    setupDoneJob('');

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      'tools/a.ts',
    ]);
    expect(jobCallOpts().cwd).toBe(ROOT);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      mode: 'check',
      files: 1,
      projectRoot: '.',
      passed: true,
    });
  });

  it('passes --fix when mode is "fix"', async () => {
    setupDoneJob('');

    await runESLint({ files: ['tools/a.ts', 'tools/b.ts'], mode: 'fix' });

    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      '--fix',
      'tools/a.ts',
      'tools/b.ts',
    ]);
  });

  it('uses worktreePath as cwd when provided', async () => {
    const worktree = resolve('/worktree');
    setConfigRoots([worktree]);
    setupDoneJob('');

    await runESLint({ files: ['a.ts'], worktreePath: worktree });

    expect(jobCallOpts().cwd).toBe(worktree);
  });

  it('returns passed:false and isError when eslint exits non-zero', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'eslint-fail',
      status: 'failed',
      label: 'eslint (1 file)',
      cwd: ROOT,
      elapsedSec: 3,
      exitCode: 1,
      error: 'eslint (1 file) exited with code 1',
      meta: { kind: 'eslint', mode: 'check', filesCount: 1, projectRoot: '.' },
      log: '/repo/tools/a.ts\n  1:1  error  Unexpected console statement',
    } satisfies JobSnapshot);

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      mode: 'check',
      files: 1,
      passed: false,
      output: expect.stringContaining('Unexpected console statement'),
    });
  });

  it('rejects a file list beyond MAX_FILES without calling eslint', async () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => `f${i}.ts`);

    const result = await runESLint({ files });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Too many files/);
    expect(result.content[0].text).toMatch(/pc-lint/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('accepts exactly MAX_FILES files', async () => {
    setupDoneJob('');
    const files = Array.from({ length: MAX_FILES }, (_, i) => `f${i}.ts`);

    const result = await runESLint({ files });

    expect(result.isError).toBeUndefined();
    expect(mockRunJob).toHaveBeenCalled();
  });

  it('rejects a file beginning with "-" without calling eslint', async () => {
    const result = await runESLint({ files: ['--config=evil.js'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/must not start with "-"/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects a file containing a semicolon', async () => {
    const result = await runESLint({ files: ['foo.ts;rm -rf /'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /contains shell metacharacters \(;&`\$\{\}\)/,
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects a file containing a backtick', async () => {
    const result = await runESLint({ files: ['foo`whoami`.ts'] });

    expect(result.isError).toBe(true);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects a file that resolves outside the working directory', async () => {
    const result = await runESLint({ files: ['../../outside.ts'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /resolves outside the working directory/,
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects an empty file list without calling eslint', async () => {
    const result = await runESLint({ files: [] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No files given/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('accepts a directory named "..foo" rather than treating it as an escape', async () => {
    setConfigRoots([ROOT]);
    setupDoneJob('');

    const result = await runESLint({ files: ['..foo/bar.ts'] });

    expect(result.isError).toBeUndefined();
    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      '..foo/bar.ts',
    ]);
  });

  it('rejects a path that only becomes hyphen-leading after relativisation', async () => {
    setConfigRoots([ROOT, DB]);

    // Passes the caller-path hyphen guard, but relativises to "-weird.ts"
    // once cwd becomes lambdas/db — which eslint would read as a flag.
    const result = await runESLint({ files: ['lambdas/db/-weird.ts'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /would be interpreted as an eslint flag/,
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  // --- async job semantics (LS-9594) ---

  it('returns a running snapshot with jobId instead of blocking past the sync budget', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'eslint-2',
      status: 'running',
      label: 'eslint (1 file)',
      cwd: ROOT,
      elapsedSec: 50,
      exitCode: null,
      error: null,
      logTail: 'linting...',
      hint: 'Job still running. Call nx_job_wait({ jobId: "eslint-2" }) to continue waiting.',
    } satisfies JobSnapshot);

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({
      mode: 'check',
      files: 1,
      projectRoot: '.',
      status: 'running',
      jobId: 'eslint-2',
      elapsedSec: 50,
      logTail: 'linting...',
      hint: 'Job still running. Call nx_job_wait({ jobId: "eslint-2" }) to continue waiting.',
    });
  });

  it('reports isError on an orphaned job', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'eslint-3',
      status: 'orphaned',
      label: 'eslint (1 file)',
      cwd: ROOT,
      elapsedSec: 700,
      exitCode: null,
      error: null,
      logTail: 'linting...',
      hint: 'This job was started by a previous MCP server process...',
    } satisfies JobSnapshot);

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBe(true);
  });

  it('explains a killed run distinctly from a real lint failure', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'eslint-4',
      status: 'failed',
      label: 'eslint (1 file)',
      cwd: ROOT,
      elapsedSec: 600,
      exitCode: null,
      error: 'Process killed after 600000ms (internal timeout)',
      meta: { kind: 'eslint', mode: 'check', filesCount: 1, projectRoot: '.' },
      log: '',
    } satisfies JobSnapshot);

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text) as { output: string };
    expect(parsed.output).toMatch(/Timed out after 600s/);
    expect(parsed.output).toMatch(/killed run, not a/);
    expect(parsed.output).toMatch(/target: "lint"/);
  });

  it('passes an idempotencyKey derived from cwd/args so a duplicate call joins the in-flight job', async () => {
    setupDoneJob('');

    await runESLint({ files: ['tools/a.ts'] });

    expect(jobCallOpts().idempotencyKey).toBe(
      `eslint:${ROOT}:exec eslint --max-warnings=0 tools/a.ts`,
    );
  });

  // --- project-local flat config resolution (the deviation from prettier) ---

  it('runs from the project root so the project-local flat config applies', async () => {
    setConfigRoots([ROOT, DB]);
    setupDoneJob('');

    const result = await runESLint({ files: ['lambdas/db/src/queries.ts'] });

    // cwd is lambdas/db — NOT the repo root — and the file is relativised to it.
    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      'src/queries.ts',
    ]);
    expect(jobCallOpts().cwd).toBe(DB);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      projectRoot: 'lambdas/db',
    });
  });

  it('resolves a different cwd for a file in a different project', async () => {
    setConfigRoots([ROOT, DB, WEB]);
    setupDoneJob('');

    await runESLint({ files: ['apps/web/src/App.tsx'] });

    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      'src/App.tsx',
    ]);
    expect(jobCallOpts().cwd).toBe(WEB);
  });

  it('rejects a file list spanning more than one config root', async () => {
    setConfigRoots([ROOT, DB, WEB]);

    const result = await runESLint({
      files: ['lambdas/db/src/queries.ts', 'apps/web/src/App.tsx'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/span 2 ESLint config roots/);
    expect(result.content[0].text).toMatch(/apps\/web, lambdas\/db/);
    expect(result.content[0].text).toMatch(
      /one nx_run_eslint call per config root/,
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('falls back to the workspace root when no nearer config exists', async () => {
    setConfigRoots([ROOT]);
    setupDoneJob('');

    await runESLint({ files: ['lambdas/db/src/queries.ts'] });

    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      'lambdas/db/src/queries.ts',
    ]);
    expect(jobCallOpts().cwd).toBe(ROOT);
  });

  it('lints a file outside every Nx project (top-level scripts/) via the root config, same as any other file (LS-9574)', async () => {
    setConfigRoots([ROOT]);
    setupDoneJob('');

    const result = await runESLint({
      files: ['scripts/modules-pool/link.mjs'],
    });

    expect(result.isError).toBeUndefined();
    expect(jobCallArgs()).toEqual([
      'exec',
      'eslint',
      '--max-warnings=0',
      'scripts/modules-pool/link.mjs',
    ]);
    expect(jobCallOpts().cwd).toBe(ROOT);
  });
});

describe('describeFailure', () => {
  it('passes a real lint failure through unchanged', () => {
    const message = 'src/a.ts\n  1:1  error  Unexpected console statement';

    expect(describeFailure(message, false)).toBe(message);
  });

  it('explains that a run which hit the internal timeout was killed, not a lint failure', () => {
    const out = describeFailure('', true);

    expect(out).toMatch(/Timed out after 600s/);
    expect(out).toMatch(/killed run, not a lint failure/);
    expect(out).toMatch(/target: "lint"/);
  });
});

describe('resolveConfigDir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the nearest ancestor directory owning a flat config', () => {
    setConfigRoots([ROOT, DB]);

    expect(resolveConfigDir(resolve(DB, 'src/queries.ts'), ROOT)).toBe(DB);
  });

  it('returns the base cwd when only the root owns a flat config', () => {
    setConfigRoots([ROOT]);

    expect(resolveConfigDir(resolve(DB, 'src/queries.ts'), ROOT)).toBe(ROOT);
  });

  it('returns the base cwd when no config exists anywhere', () => {
    setConfigRoots([]);

    expect(resolveConfigDir(resolve(DB, 'src/queries.ts'), ROOT)).toBe(ROOT);
  });
});

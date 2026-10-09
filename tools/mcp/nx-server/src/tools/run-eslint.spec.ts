import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolve } from 'node:path';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));

jest.mock('../project-resolution.js', () => ({
  buildProjectNotFoundHint: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => false),
}));

import { existsSync } from 'node:fs';
import {
  describeFailure,
  MAX_FILES,
  parseEslintCounts,
  resolveConfigDir,
  runESLint,
} from './run-eslint.js';
import { getRepoRoot, runNx } from '../run-command.js';
import { buildProjectNotFoundHint } from '../project-resolution.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;
const mockGetRepoRoot = getRepoRoot as jest.MockedFunction<typeof getRepoRoot>;
const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;
const mockBuildProjectNotFoundHint =
  buildProjectNotFoundHint as jest.MockedFunction<
    typeof buildProjectNotFoundHint
  >;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

// `resolve` normalises the POSIX-style fixtures below to whatever the host
// platform uses (C:\repo on Windows), so these specs assert real argv on both.
const ROOT = resolve('/repo');
const DB = resolve('/repo/lambdas/db');
const WEB = resolve('/repo/apps/web');
const WEB_E2E = resolve('/repo/apps/web-e2e');
// binJobSpec appends .cmd on the real host platform (not mocked here).
const ESLINT_BIN = resolve(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
);

// Real target files are assumed to exist unless explicitly listed as missing
// via `setMissingFiles` — only `eslint.config.mjs` presence is governed by
// `setConfigRoots`, mirroring the two independent things this tool checks
// `existsSync` for.
let missingFiles = new Set<string>();
let configRoots = new Set<string>();

const ESLINT_CONFIG_BASENAMES = new Set([
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
]);

function refreshExistsSyncMock(): void {
  mockExistsSync.mockImplementation((p) => {
    const str = String(p);
    const base = str.split(/[/\\]/).pop() ?? '';
    if (ESLINT_CONFIG_BASENAMES.has(base)) {
      // Fixtures below only ever materialise `eslint.config.mjs`.
      return (
        base === 'eslint.config.mjs' && configRoots.has(resolve(str, '..'))
      );
    }
    return !missingFiles.has(str);
  });
}

/** Make `eslint.config.mjs` appear to exist in exactly these directories. */
function setConfigRoots(dirs: string[]): void {
  configRoots = new Set(dirs);
  refreshExistsSyncMock();
}

/** Make the given absolute file paths appear not to exist on disk. */
function setMissingFiles(paths: string[]): void {
  missingFiles = new Set(paths);
  refreshExistsSyncMock();
}

/** Make `nx show project <name> --json` resolve to a project rooted at `root`. */
function setProjectRoot(root: string): void {
  mockRunNx.mockResolvedValue(JSON.stringify({ root }));
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
    mockBuildProjectNotFoundHint.mockResolvedValue(undefined);
    missingFiles = new Set();
    // Default: only the workspace root owns a flat config.
    setConfigRoots([ROOT]);
  });

  it('defaults to check mode and omits --max-warnings (unlimited, matching pc-lint)', async () => {
    setupDoneJob('');

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(jobCallArgs()).toEqual(['tools/a.ts']);
    expect(jobCallOpts().cwd).toBe(ROOT);
    // LS-10021: invoked as the local .bin shim directly, never via
    // `pnpm exec` — see localBinJobSpec's doc comment for why.
    expect(jobCallOpts().command).toBe(ESLINT_BIN);
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

    expect(jobCallArgs()).toEqual(['--fix', 'tools/a.ts', 'tools/b.ts']);
  });

  it('passes --max-warnings=<n> when maxWarnings is given explicitly', async () => {
    setupDoneJob('');

    await runESLint({ files: ['tools/a.ts'], maxWarnings: 0 });

    expect(jobCallArgs()).toEqual(['--max-warnings=0', 'tools/a.ts']);
  });

  it('rejects a negative maxWarnings without calling eslint', async () => {
    const result = await runESLint({ files: ['tools/a.ts'], maxWarnings: -5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid maxWarnings/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects a non-integer maxWarnings without calling eslint', async () => {
    const result = await runESLint({
      files: ['tools/a.ts'],
      maxWarnings: 1.5,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid maxWarnings/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('passes on a warnings-only run when maxWarnings is not given, agreeing with pc-lint', async () => {
    setupDoneJob(
      '/repo/tools/a.ts\n  1:1  warning  Unexpected non-null assertion\n\n' +
        '✖ 21 problems (0 errors, 21 warnings)',
    );

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      passed: true,
      errorCount: 0,
      warningCount: 21,
    });
  });

  it('uses worktreePath as cwd when provided', async () => {
    const worktree = resolve('/worktree');
    setConfigRoots([worktree]);
    setupDoneJob('');

    await runESLint({ files: ['a.ts'], worktreePath: worktree });

    expect(jobCallOpts().cwd).toBe(worktree);
  });

  it('returns passed:false and isError when eslint exits non-zero, with the error count parsed out', async () => {
    mockRunJob.mockResolvedValue({
      jobId: 'eslint-fail',
      status: 'failed',
      label: 'eslint (1 file)',
      cwd: ROOT,
      elapsedSec: 3,
      exitCode: 1,
      error: 'eslint (1 file) exited with code 1',
      meta: { kind: 'eslint', mode: 'check', filesCount: 1, projectRoot: '.' },
      log:
        '/repo/tools/a.ts\n  1:1  error  Unexpected console statement\n\n' +
        '✖ 1 problem (1 error, 0 warnings)',
    } satisfies JobSnapshot);

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      mode: 'check',
      files: 1,
      passed: false,
      errorCount: 1,
      warningCount: 0,
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

  it("rejects a file that does not exist under the repo root with an explicit message, not eslint's generic pattern error", async () => {
    setMissingFiles([resolve(ROOT, 'tools/missing.ts')]);

    const result = await runESLint({ files: ['tools/missing.ts'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /File "tools\/missing\.ts" not found under repo root/,
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects a file that does not exist under worktreePath, naming worktreePath explicitly (LS-9853 repro)', async () => {
    const worktree = resolve('/worktree');
    setConfigRoots([worktree]);
    setMissingFiles([
      resolve(worktree, 'apps/web-e2e/src/tests/zz-force-rule-probe.spec.ts'),
    ]);

    const result = await runESLint({
      files: ['apps/web-e2e/src/tests/zz-force-rule-probe.spec.ts'],
      worktreePath: worktree,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      new RegExp(
        `File "apps/web-e2e/src/tests/zz-force-rule-probe\\.spec\\.ts" not found under worktreePath ${worktree.replace(/[/\\]/g, '\\$&')}`,
      ),
    );
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('lints a file that exists only under worktreePath (not the main repo checkout), confirming the LS-9853 repro is fixed', async () => {
    const worktree = resolve('/worktree');
    setConfigRoots([worktree]);
    setupDoneJob('');

    const result = await runESLint({
      files: ['apps/web-e2e/src/tests/zz-force-rule-probe.spec.ts'],
      worktreePath: worktree,
    });

    expect(result.isError).toBeUndefined();
    expect(jobCallOpts().cwd).toBe(worktree);
    expect(jobCallArgs()).toEqual([
      'apps/web-e2e/src/tests/zz-force-rule-probe.spec.ts',
    ]);
  });

  it('lints a package-less nested-project file (apps/web-e2e) from the repo root cwd via a repo-relative path (LS-10006 repro)', async () => {
    // apps/web-e2e owns its own flat config but, unlike lambdas/db, has no
    // package.json of its own — the same package-less shape binJobSpec's
    // doc comment describes for LS-10021/LS-10022.
    setConfigRoots([ROOT, WEB_E2E]);
    setupDoneJob('');

    const result = await runESLint({
      files: ['apps/web-e2e/src/tests/football-free-agents-waivers.spec.ts'],
    });

    expect(result.isError).toBeUndefined();
    // The nearer (project) config governs, not the workspace root one.
    expect(jobCallOpts().cwd).toBe(WEB_E2E);
    // Relativised to the project's own config root, not left repo-relative —
    // the ticket's repro is eslint reporting this exact pattern as
    // unmatched when cwd/args disagree on which root it's relative to.
    expect(jobCallArgs()).toEqual([
      'src/tests/football-free-agents-waivers.spec.ts',
    ]);
    // Resolved from the *repo* root's node_modules/.bin (hoisted), not a
    // nonexistent apps/web-e2e/node_modules/.bin — this is what binJobSpec
    // guarantees by taking repoRoot as a separate argument from cwd.
    expect(jobCallOpts().command).toBe(ESLINT_BIN);
  });

  it('lints a package-less nested-project file (apps/web-e2e) via an absolute path (LS-10006 repro)', async () => {
    setConfigRoots([ROOT, WEB_E2E]);
    setupDoneJob('');

    const result = await runESLint({
      files: [
        resolve(
          ROOT,
          'apps/web-e2e/src/tests/football-free-agents-waivers.spec.ts',
        ),
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(jobCallOpts().cwd).toBe(WEB_E2E);
    expect(jobCallArgs()).toEqual([
      'src/tests/football-free-agents-waivers.spec.ts',
    ]);
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

  it('lints the whole project from its own config root when files is omitted (LS-10355)', async () => {
    setConfigRoots([ROOT, DB]);
    setProjectRoot('lambdas/db');
    setupDoneJob('');

    const result = await runESLint({ project: 'db' });

    expect(result.isError).toBeUndefined();
    expect(jobCallArgs()).toEqual(['.']);
    expect(jobCallOpts().cwd).toBe(DB);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      files: 0,
      projectRoot: 'lambdas/db',
      passed: true,
    });
  });

  it('targets the project root relative to an ancestor config when the project has none (LS-10355)', async () => {
    setConfigRoots([ROOT]);
    setProjectRoot('apps/web-e2e');
    setupDoneJob('');

    await runESLint({ project: 'web-e2e', mode: 'fix' });

    expect(jobCallArgs()).toEqual(['--fix', 'apps/web-e2e']);
    expect(jobCallOpts().cwd).toBe(ROOT);
  });

  it('returns structured counts for a failing whole-project run (LS-10355)', async () => {
    setConfigRoots([ROOT, DB]);
    setProjectRoot('lambdas/db');
    mockRunJob.mockImplementation((jobOpts: StartJobOptions) =>
      Promise.resolve({
        jobId: 'j',
        status: 'failed',
        label: jobOpts.label,
        cwd: jobOpts.cwd,
        elapsedSec: 1,
        exitCode: 1,
        error: 'exit 1',
        meta: jobOpts.meta,
        log: '✖ 3 problems (2 errors, 1 warning)',
      } as JobSnapshot),
    );

    const result = await runESLint({ project: 'db' });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      passed: false,
      errorCount: 2,
      warningCount: 1,
    });
  });

  it('rejects an omitted files list without a project (LS-10355)', async () => {
    const result = await runESLint({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/pass `project` alone/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('accepts a directory named "..foo" rather than treating it as an escape', async () => {
    setConfigRoots([ROOT]);
    setupDoneJob('');

    const result = await runESLint({ files: ['..foo/bar.ts'] });

    expect(result.isError).toBeUndefined();
    expect(jobCallArgs()).toEqual(['..foo/bar.ts']);
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

    expect(jobCallOpts().idempotencyKey).toBe(`eslint:${ROOT}:tools/a.ts`);
  });

  // --- project-local flat config resolution (the deviation from prettier) ---

  it('runs from the project root so the project-local flat config applies', async () => {
    setConfigRoots([ROOT, DB]);
    setupDoneJob('');

    const result = await runESLint({ files: ['lambdas/db/src/queries.ts'] });

    // cwd is lambdas/db — NOT the repo root — and the file is relativised to it.
    expect(jobCallArgs()).toEqual(['src/queries.ts']);
    expect(jobCallOpts().cwd).toBe(DB);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      projectRoot: 'lambdas/db',
    });
  });

  it('resolves a different cwd for a file in a different project', async () => {
    setConfigRoots([ROOT, DB, WEB]);
    setupDoneJob('');

    await runESLint({ files: ['apps/web/src/App.tsx'] });

    expect(jobCallArgs()).toEqual(['src/App.tsx']);
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

    expect(jobCallArgs()).toEqual(['lambdas/db/src/queries.ts']);
    expect(jobCallOpts().cwd).toBe(ROOT);
  });

  it('lints a file outside every Nx project (top-level scripts/) via the root config, same as any other file (LS-9574)', async () => {
    setConfigRoots([ROOT]);
    setupDoneJob('');

    const result = await runESLint({
      files: ['scripts/modules-pool/link.mjs'],
    });

    expect(result.isError).toBeUndefined();
    expect(jobCallArgs()).toEqual(['scripts/modules-pool/link.mjs']);
    expect(jobCallOpts().cwd).toBe(ROOT);
  });

  // --- `project`-relative file resolution (LS-10143) ---

  it('resolves files relative to the given nx project root', async () => {
    setProjectRoot('lambdas/db');
    setConfigRoots([ROOT, DB]);
    setupDoneJob('');

    const result = await runESLint({
      project: 'db',
      files: ['src/schema/matchups/matchupScores.resolver.spec.ts'],
    });

    expect(mockRunNx).toHaveBeenCalledWith(
      ['show', 'project', 'db', '--json'],
      ROOT,
    );
    expect(result.isError).toBeUndefined();
    expect(jobCallOpts().cwd).toBe(DB);
    expect(jobCallArgs()).toEqual([
      'src/schema/matchups/matchupScores.resolver.spec.ts',
    ]);
  });

  it('falls back to repo-root-relative when a project-relative path does not exist', async () => {
    setProjectRoot('lambdas/db');
    setConfigRoots([ROOT, DB]);
    setupDoneJob('');
    // Only the repo-root-relative form of this path exists.
    setMissingFiles([resolve(DB, 'lambdas/db/src/queries.ts')]);

    const result = await runESLint({
      project: 'db',
      files: ['lambdas/db/src/queries.ts'],
    });

    expect(result.isError).toBeUndefined();
    expect(jobCallOpts().cwd).toBe(DB);
    expect(jobCallArgs()).toEqual(['src/queries.ts']);
  });

  it('reports both attempted resolutions when a file is not found under the project root or repo root', async () => {
    setProjectRoot('lambdas/db');
    setConfigRoots([ROOT, DB]);
    setMissingFiles([
      resolve(DB, 'src/missing.ts'),
      resolve(ROOT, 'src/missing.ts'),
    ]);

    const result = await runESLint({
      project: 'db',
      files: ['src/missing.ts'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/"db" project root/);
    expect(result.content[0].text).toMatch(/repo root/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('rejects an invalid project name without calling nx', async () => {
    const result = await runESLint({
      project: 'db; rm -rf /',
      files: ['src/queries.ts'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid project name/);
    expect(mockRunNx).not.toHaveBeenCalled();
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it("surfaces a 'Did you mean?' hint when the named project cannot be resolved", async () => {
    mockRunNx.mockRejectedValue(new Error("Cannot find project 'dbz'"));
    mockBuildProjectNotFoundHint.mockResolvedValue(
      'No nx project named "dbz" exists. Did you mean one of these? "db"',
    );

    const result = await runESLint({ project: 'dbz', files: ['a.ts'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Did you mean one of these\? "db"/);
    expect(mockRunJob).not.toHaveBeenCalled();
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

describe('parseEslintCounts', () => {
  it('extracts the error and warning counts from the stylish summary line', () => {
    expect(parseEslintCounts('✖ 21 problems (0 errors, 21 warnings)')).toEqual({
      errorCount: 0,
      warningCount: 21,
    });
  });

  it('handles the singular form for exactly one problem', () => {
    expect(parseEslintCounts('✖ 1 problem (1 error, 0 warnings)')).toEqual({
      errorCount: 1,
      warningCount: 0,
    });
  });

  it('returns zeros when there is no summary line (a clean run)', () => {
    expect(parseEslintCounts('')).toEqual({ errorCount: 0, warningCount: 0 });
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

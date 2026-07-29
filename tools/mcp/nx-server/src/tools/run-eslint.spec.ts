import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runPnpm: jest.fn(),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => false),
}));

import { existsSync } from 'node:fs';
import { getRepoRoot, runPnpm } from '../run-command.js';
import {
  MAX_FILES,
  describeFailure,
  resolveConfigDir,
  runESLint,
} from './run-eslint.js';

const mockRunPnpm = runPnpm as jest.MockedFunction<typeof runPnpm>;
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

describe('runESLint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/repo');
    // Default: only the workspace root owns a flat config.
    setConfigRoots([ROOT]);
  });

  it('defaults to check mode and passes --max-warnings=0 with the given files', async () => {
    mockRunPnpm.mockResolvedValue('');

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'eslint', '--max-warnings=0', 'tools/a.ts'],
      ROOT,
      expect.any(Number),
      undefined,
      true,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text as string)).toMatchObject({
      mode: 'check',
      files: 1,
      projectRoot: '.',
      passed: true,
    });
  });

  it('passes --fix when mode is "fix"', async () => {
    mockRunPnpm.mockResolvedValue('');

    await runESLint({ files: ['tools/a.ts', 'tools/b.ts'], mode: 'fix' });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      [
        'exec',
        'eslint',
        '--max-warnings=0',
        '--fix',
        'tools/a.ts',
        'tools/b.ts',
      ],
      ROOT,
      expect.any(Number),
      undefined,
      true,
    );
  });

  it('uses worktreePath as cwd when provided', async () => {
    const worktree = resolve('/worktree');
    setConfigRoots([worktree]);
    mockRunPnpm.mockResolvedValue('');

    await runESLint({ files: ['a.ts'], worktreePath: worktree });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      expect.any(Array),
      worktree,
      expect.any(Number),
      undefined,
      true,
    );
  });

  it('returns passed:false and isError when eslint exits non-zero', async () => {
    mockRunPnpm.mockRejectedValue(
      new Error('/repo/tools/a.ts\n  1:1  error  Unexpected console statement'),
    );

    const result = await runESLint({ files: ['tools/a.ts'] });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text as string)).toMatchObject({
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
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('accepts exactly MAX_FILES files', async () => {
    mockRunPnpm.mockResolvedValue('');
    const files = Array.from({ length: MAX_FILES }, (_, i) => `f${i}.ts`);

    const result = await runESLint({ files });

    expect(result.isError).toBeUndefined();
    expect(mockRunPnpm).toHaveBeenCalled();
  });

  it('rejects a file beginning with "-" without calling eslint', async () => {
    const result = await runESLint({ files: ['--config=evil.js'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/must not start with "-"/);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects a file containing a semicolon', async () => {
    const result = await runESLint({ files: ['foo.ts;rm -rf /'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /contains shell metacharacters \(;&`\$\{\}\)/,
    );
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects a file containing a backtick', async () => {
    const result = await runESLint({ files: ['foo`whoami`.ts'] });

    expect(result.isError).toBe(true);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects a file that resolves outside the working directory', async () => {
    const result = await runESLint({ files: ['../../outside.ts'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /resolves outside the working directory/,
    );
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects an empty file list without calling eslint', async () => {
    const result = await runESLint({ files: [] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No files given/);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('accepts a directory named "..foo" rather than treating it as an escape', async () => {
    setConfigRoots([ROOT]);
    mockRunPnpm.mockResolvedValue('');

    const result = await runESLint({ files: ['..foo/bar.ts'] });

    expect(result.isError).toBeUndefined();
    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'eslint', '--max-warnings=0', '..foo/bar.ts'],
      ROOT,
      expect.any(Number),
      undefined,
      true,
    );
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
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  // --- project-local flat config resolution (the deviation from prettier) ---

  it('runs from the project root so the project-local flat config applies', async () => {
    setConfigRoots([ROOT, DB]);
    mockRunPnpm.mockResolvedValue('');

    const result = await runESLint({ files: ['lambdas/db/src/queries.ts'] });

    // cwd is lambdas/db — NOT the repo root — and the file is relativised to it.
    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'eslint', '--max-warnings=0', 'src/queries.ts'],
      DB,
      expect.any(Number),
      undefined,
      true,
    );
    expect(JSON.parse(result.content[0].text as string)).toMatchObject({
      projectRoot: 'lambdas/db',
    });
  });

  it('resolves a different cwd for a file in a different project', async () => {
    setConfigRoots([ROOT, DB, WEB]);
    mockRunPnpm.mockResolvedValue('');

    await runESLint({ files: ['apps/web/src/App.tsx'] });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'eslint', '--max-warnings=0', 'src/App.tsx'],
      WEB,
      expect.any(Number),
      undefined,
      true,
    );
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
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('falls back to the workspace root when no nearer config exists', async () => {
    setConfigRoots([ROOT]);
    mockRunPnpm.mockResolvedValue('');

    await runESLint({ files: ['lambdas/db/src/queries.ts'] });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'eslint', '--max-warnings=0', 'lambdas/db/src/queries.ts'],
      ROOT,
      expect.any(Number),
      undefined,
      true,
    );
  });
});

describe('describeFailure', () => {
  it('passes a real lint failure through unchanged', () => {
    const message = 'src/a.ts\n  1:1  error  Unexpected console statement';

    expect(describeFailure(message, 5_000, 600_000)).toBe(message);
  });

  it('explains that a run which hit the timeout was killed, not a lint failure', () => {
    const out = describeFailure(
      'Command failed: pnpm exec eslint --max-warnings=0 src/a.ts',
      600_000,
      600_000,
    );

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

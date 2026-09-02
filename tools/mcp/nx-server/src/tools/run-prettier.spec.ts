import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runPnpm: jest.fn(),
}));

import { MAX_FILES, runPrettier } from './run-prettier.js';
import { getRepoRoot, runPnpm } from '../run-command.js';

const mockRunPnpm = runPnpm as jest.MockedFunction<typeof runPnpm>;
const mockGetRepoRoot = getRepoRoot as jest.MockedFunction<typeof getRepoRoot>;

describe('runPrettier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoRoot.mockReturnValue('/repo');
  });

  it('defaults to check mode and passes --check with the given files', async () => {
    mockRunPnpm.mockResolvedValue(
      'Checking formatting...\nAll matched files use Prettier code style!',
    );

    const result = await runPrettier({ files: ['apps/web/Foo.tsx'] });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'prettier', '--check', 'apps/web/Foo.tsx'],
      '/repo',
      expect.any(Number),
      undefined,
      true,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      mode: 'check',
      files: 1,
      passed: true,
    });
  });

  it('passes --write when mode is "write"', async () => {
    mockRunPnpm.mockResolvedValue('apps/web/Foo.tsx 12ms');

    await runPrettier({
      files: ['apps/web/Foo.tsx', 'lambdas/db/src/queries.ts'],
      mode: 'write',
    });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      [
        'exec',
        'prettier',
        '--write',
        'apps/web/Foo.tsx',
        'lambdas/db/src/queries.ts',
      ],
      '/repo',
      expect.any(Number),
      undefined,
      true,
    );
  });

  it('uses worktreePath as cwd when provided', async () => {
    mockRunPnpm.mockResolvedValue('');

    await runPrettier({ files: ['a.ts'], worktreePath: '/worktree' });

    expect(mockRunPnpm).toHaveBeenCalledWith(
      expect.any(Array),
      '/worktree',
      expect.any(Number),
      undefined,
      true,
    );
  });

  it('returns passed:false and isError when prettier exits non-zero', async () => {
    mockRunPnpm.mockRejectedValue(
      new Error('[warn] apps/web/Foo.tsx\nCode style issues found.'),
    );

    const result = await runPrettier({ files: ['apps/web/Foo.tsx'] });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      mode: 'check',
      files: 1,
      passed: false,
      output: expect.stringContaining('Code style issues found'),
    });
  });

  it('rejects a file list beyond MAX_FILES without calling prettier', async () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => `f${i}.ts`);

    const result = await runPrettier({ files });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Too many files/);
    expect(result.content[0].text).toMatch(/pc-format/);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('accepts exactly MAX_FILES files', async () => {
    mockRunPnpm.mockResolvedValue('');
    const files = Array.from({ length: MAX_FILES }, (_, i) => `f${i}.ts`);

    const result = await runPrettier({ files });

    expect(result.isError).toBeUndefined();
    expect(mockRunPnpm).toHaveBeenCalled();
  });

  it('rejects a file beginning with "-" without calling prettier', async () => {
    const result = await runPrettier({ files: ['--config=evil.js'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/must not start with "-"/);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects a file containing a semicolon', async () => {
    const result = await runPrettier({ files: ['foo.ts;rm -rf /'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /contains shell metacharacters \(;&`\$\{\}\)/,
    );
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('rejects a file containing a backtick', async () => {
    const result = await runPrettier({ files: ['foo`whoami`.ts'] });

    expect(result.isError).toBe(true);
    expect(mockRunPnpm).not.toHaveBeenCalled();
  });

  it('formats a file outside every Nx project (top-level scripts/) the same as any other file — there is no project scoping here at all (LS-9574)', async () => {
    mockRunPnpm.mockResolvedValue('');

    const result = await runPrettier({
      files: ['scripts/modules-pool/link.mjs'],
    });

    expect(result.isError).toBeUndefined();
    expect(mockRunPnpm).toHaveBeenCalledWith(
      ['exec', 'prettier', '--check', 'scripts/modules-pool/link.mjs'],
      '/repo',
      expect.any(Number),
      undefined,
      true,
    );
  });
});

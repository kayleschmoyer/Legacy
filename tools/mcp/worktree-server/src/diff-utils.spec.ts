import { describe, expect, it, jest } from '@jest/globals';

import { resolveDiffBase, type RunGit } from './diff-utils';

describe('resolveDiffBase', () => {
  it('resolves base to the merge-base SHA with HEAD', () => {
    const runGit = jest.fn<RunGit>().mockReturnValue('abc123\n');

    const result = resolveDiffBase(runGit, 'origin/main', '/wt');

    expect(runGit).toHaveBeenCalledWith(
      ['merge-base', 'HEAD', 'origin/main'],
      '/wt',
      { timeout: 10_000 },
    );
    expect(result).toBe('abc123');
  });

  it('falls back to the raw base ref when merge-base throws', () => {
    const runGit = jest.fn<RunGit>().mockImplementation(() => {
      throw Object.assign(new Error('Command failed: git merge-base'), {
        status: 128,
        stderr: 'fatal: Not a valid commit name some-bogus-ref',
      });
    });

    const result = resolveDiffBase(runGit, 'some-bogus-ref', '/wt');

    expect(result).toBe('some-bogus-ref');
  });

  it('falls back to the raw base ref when merge-base returns empty output', () => {
    const runGit = jest.fn<RunGit>().mockReturnValue('   \n');

    const result = resolveDiffBase(runGit, 'origin/main', '/wt');

    expect(result).toBe('origin/main');
  });
});

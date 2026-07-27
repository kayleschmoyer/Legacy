import { describe, expect, it, jest } from '@jest/globals';

import { resolveMainRepoPath } from './resolve-main-repo';

describe('resolveMainRepoPath', () => {
  it('returns process.cwd() when git-common-dir is the relative ".git" (main repo)', () => {
    const runner = jest.fn<() => string>().mockReturnValue('.git\n');
    const result = resolveMainRepoPath(runner, []);
    expect(result).toBe(process.cwd());
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('resolves the parent of an absolute git-common-dir (worktree)', () => {
    const runner = jest.fn<() => string>().mockReturnValue('/repo/.git\n');
    const result = resolveMainRepoPath(runner, []);
    expect(result).toBe('/repo');
  });

  it('retries after a transient failure and succeeds', () => {
    const runner = jest
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('not a git repository (yet)');
      })
      .mockReturnValueOnce('.git\n');
    const result = resolveMainRepoPath(runner, [0, 0, 0]);
    expect(result).toBe(process.cwd());
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once retries are exhausted', () => {
    const lastError = new Error('git still not ready');
    const runner = jest
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('attempt 1');
      })
      .mockImplementationOnce(() => {
        throw lastError;
      });
    expect(() => resolveMainRepoPath(runner, [0])).toThrow(lastError);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('does not retry when no retry delays are configured', () => {
    const runner = jest.fn<() => string>().mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => resolveMainRepoPath(runner, [])).toThrow('boom');
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

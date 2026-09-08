import { describe, expect, it, jest } from '@jest/globals';

import { resolveMainRepoPath } from './resolve-main-repo.js';

describe('resolveMainRepoPath', () => {
  it('returns cwd when git-common-dir is the relative ".git" (main repo)', () => {
    const runner = jest.fn<(cwd: string) => string>().mockReturnValue('.git\n');
    const result = resolveMainRepoPath('/repo', runner);
    expect(result).toBe('/repo');
    expect(runner).toHaveBeenCalledWith('/repo');
  });

  it('resolves the parent of an absolute git-common-dir (worktree)', () => {
    const runner = jest
      .fn<(cwd: string) => string>()
      .mockReturnValue('/repo/.git\n');
    const result = resolveMainRepoPath(
      '/repo/.claude/worktrees/some-name',
      runner,
    );
    expect(result).toBe('/repo');
  });

  it('resolves a Windows-style absolute git-common-dir', () => {
    const runner = jest
      .fn<(cwd: string) => string>()
      .mockReturnValue('D:\\code\\legacy-sports\\.git\n');
    const result = resolveMainRepoPath(
      'D:\\code\\legacy-sports.claude\\worktrees\\foo',
      runner,
    );
    expect(result).toBe('D:\\code\\legacy-sports');
  });

  it('passes cwd through to the git-common-dir runner', () => {
    const runner = jest.fn<(cwd: string) => string>().mockReturnValue('.git\n');
    resolveMainRepoPath('/some/worktree', runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith('/some/worktree');
  });
});

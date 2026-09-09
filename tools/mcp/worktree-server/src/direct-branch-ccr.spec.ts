import { describe, expect, it, jest } from '@jest/globals';

import { detectDirectBranchCcrCwd } from './direct-branch-ccr';

describe('detectDirectBranchCcrCwd', () => {
  it('returns the resolved repo root when CCR + cwd matches main repo + .git exists', () => {
    const pathExists = jest
      .fn<(path: string) => boolean>()
      .mockReturnValue(true);
    const result = detectDirectBranchCcrCwd({
      cwd: '/home/user/legacy-sports',
      mainRepo: '/home/user/legacy-sports',
      isCcrEnv: true,
      pathExists,
    });
    expect(result).toBe('/home/user/legacy-sports');
    expect(pathExists).toHaveBeenCalledWith('/home/user/legacy-sports/.git');
  });

  it('returns null when not a CCR session', () => {
    const result = detectDirectBranchCcrCwd({
      cwd: '/home/user/legacy-sports',
      mainRepo: '/home/user/legacy-sports',
      isCcrEnv: false,
      pathExists: () => true,
    });
    expect(result).toBeNull();
  });

  it('returns null when cwd is a linked worktree, not the main repo root', () => {
    const result = detectDirectBranchCcrCwd({
      cwd: '/home/user/legacy-sports/.claude/worktrees/LS-1234',
      mainRepo: '/home/user/legacy-sports',
      isCcrEnv: true,
      pathExists: () => true,
    });
    expect(result).toBeNull();
  });

  it('returns null when the repo root has no .git', () => {
    const result = detectDirectBranchCcrCwd({
      cwd: '/home/user/legacy-sports',
      mainRepo: '/home/user/legacy-sports',
      isCcrEnv: true,
      pathExists: () => false,
    });
    expect(result).toBeNull();
  });

  it('normalizes trailing slashes and relative segments before comparing', () => {
    const result = detectDirectBranchCcrCwd({
      cwd: '/home/user/legacy-sports/./',
      mainRepo: '/home/user/legacy-sports',
      isCcrEnv: true,
      pathExists: () => true,
    });
    expect(result).toBe('/home/user/legacy-sports');
  });
});
